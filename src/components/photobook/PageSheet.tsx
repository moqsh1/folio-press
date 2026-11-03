import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { imageBox } from "@/lib/photobook/crop";
import { cellRects, rectToPercent } from "@/lib/photobook/geometry";
import { LAYOUT_BY_ID } from "@/lib/photobook/layouts";
import { PAGE_INCHES, type Orientation, type Page, type Photo, type Slot } from "@/lib/photobook/types";
import { cn } from "@/lib/cn";

const PHOTO_MIME = "application/x-folio-photo";
const SLOT_MIME = "application/x-folio-slot";

type PageSheetProps = {
  page: Page;
  orientation: Orientation;
  marginIn: number;
  gapIn: number;
  captionIn: number;
  photoById: Map<string, Photo>;
  fullUrls: Record<string, string>;
  pageNumber?: number;
  interactive?: boolean;
  selectedSlot?: number | null;
  placing?: boolean;
  onSelectSlot?: (index: number) => void;
  onCommitPan?: (index: number, panX: number, panY: number) => void;
  onDropPhoto?: (index: number, photoId: string) => void;
  onSwap?: (index: number, fromPageId: string, fromIndex: number) => void;
};

export function PageSheet({
  page,
  orientation,
  marginIn,
  gapIn,
  captionIn,
  photoById,
  fullUrls,
  pageNumber,
  interactive = false,
  selectedSlot = null,
  placing = false,
  onSelectSlot,
  onCommitPan,
  onDropPhoto,
  onSwap,
}: PageSheetProps) {
  const inches = PAGE_INCHES[orientation];
  const layout = LAYOUT_BY_ID[page.layout];
  const rects = cellRects(layout.areas, inches.w, inches.h, marginIn, gapIn);

  return (
    <div className="relative h-full w-full bg-page">
      {rects.map((rect, index) => {
        const slot = page.slots[index];
        if (!slot) return null;
        return (
          <Frame
            key={index}
            pageId={page.id}
            index={index}
            rect={rect}
            pageW={inches.w}
            pageH={inches.h}
            captionIn={captionIn}
            slot={slot}
            photo={slot.photoId ? photoById.get(slot.photoId) : undefined}
            src={slot.photoId ? fullUrls[slot.photoId] : undefined}
            interactive={interactive}
            selected={selectedSlot === index}
            placing={placing}
            onSelectSlot={onSelectSlot}
            onCommitPan={onCommitPan}
            onDropPhoto={onDropPhoto}
            onSwap={onSwap}
          />
        );
      })}
      {pageNumber != null && (
        <p className="page-folio pointer-events-none absolute inset-x-0 bottom-0 z-20 text-center font-serif text-ink tabular-nums">
          <span className="bg-page/90 px-1.5">{pageNumber}</span>
        </p>
      )}
    </div>
  );
}

function Frame({
  pageId,
  index,
  rect,
  pageW,
  pageH,
  captionIn,
  slot,
  photo,
  src,
  interactive,
  selected,
  placing,
  onSelectSlot,
  onCommitPan,
  onDropPhoto,
  onSwap,
}: {
  pageId: string;
  index: number;
  rect: { x: number; y: number; w: number; h: number };
  pageW: number;
  pageH: number;
  captionIn: number;
  slot: Slot;
  photo?: Photo;
  src?: string;
  interactive: boolean;
  selected: boolean;
  placing: boolean;
  onSelectSlot?: (index: number) => void;
  onCommitPan?: (index: number, panX: number, panY: number) => void;
  onDropPhoto?: (index: number, photoId: string) => void;
  onSwap?: (index: number, fromPageId: string, fromIndex: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const liveRef = useRef<{ panX: number; panY: number } | null>(null);
  const [live, setLive] = useState<{ panX: number; panY: number } | null>(null);
  const [over, setOver] = useState(false);
  const captionFrac = Math.min(0.42, captionIn / rect.h);
  const imageH = rect.h * (1 - captionFrac);
  const frameAspect = rect.w / Math.max(0.05, imageH);
  const pan = live ?? { panX: slot.panX, panY: slot.panY };
  const box = photo ? imageBox(frameAspect, photo, slot.zoom, pan.panX, pan.panY) : null;
  const shownSrc = src || photo?.thumbUrl;
  const style = rectToPercent(rect, pageW, pageH);

  function commit() {
    const next = liveRef.current;
    if (next) onCommitPan?.(index, next.panX, next.panY);
    liveRef.current = null;
    setLive(null);
    drag.current = null;
  }

  return (
    <div
      className={cn(
        "absolute overflow-hidden bg-well",
        interactive && selected && "z-10 ring-2 ring-accent ring-inset",
        interactive && over && "ring-2 ring-accent ring-inset",
      )}
      style={style}
      onDragOver={
        interactive
          ? (event) => {
              if (
                event.dataTransfer.types.includes(PHOTO_MIME) ||
                event.dataTransfer.types.includes(SLOT_MIME)
              ) {
                event.preventDefault();
                setOver(true);
              }
            }
          : undefined
      }
      onDragLeave={interactive ? () => setOver(false) : undefined}
      onDrop={
        interactive
          ? (event) => {
              event.preventDefault();
              setOver(false);
              const photoId = event.dataTransfer.getData(PHOTO_MIME);
              const slotRef = event.dataTransfer.getData(SLOT_MIME);
              if (slotRef) {
                const [fromPageId, fromIndex] = slotRef.split("|");
                if (fromPageId && fromIndex != null) onSwap?.(index, fromPageId, Number(fromIndex));
                return;
              }
              if (photoId) onDropPhoto?.(index, photoId);
            }
          : undefined
      }
    >
      <div
        ref={frameRef}
        className={cn("absolute inset-x-0 top-0 overflow-hidden", interactive && photo && "reframe")}
        style={{ bottom: `${captionFrac * 100}%` }}
        onPointerDown={
          interactive
            ? (event) => {
                if (!photo || event.button !== 0) return;
                onSelectSlot?.(index);
                if (placing) return;
                const frame = frameRef.current;
                if (!frame || !box) return;
                frame.setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, panX: slot.panX, panY: slot.panY };
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (event) => {
                const start = drag.current;
                const frame = frameRef.current;
                if (!start || !frame || !box || !photo) return;
                const dx = event.clientX - start.x;
                const dy = event.clientY - start.y;
                if (Math.abs(dx) + Math.abs(dy) < 3 && !liveRef.current) return;
                const slackPxX = (box.slackX / 100) * frame.clientWidth;
                const slackPxY = (box.slackY / 100) * frame.clientHeight;
                const next = {
                  panX: slackPxX > 1 ? Math.min(1, Math.max(-1, start.panX - (dx * 2) / slackPxX)) : start.panX,
                  panY: slackPxY > 1 ? Math.min(1, Math.max(-1, start.panY - (dy * 2) / slackPxY)) : start.panY,
                };
                liveRef.current = next;
                setLive(next);
              }
            : undefined
        }
        onPointerUp={interactive ? () => commit() : undefined}
        onPointerCancel={interactive ? () => commit() : undefined}
        onDoubleClick={
          interactive && photo
            ? (event) => {
                event.preventDefault();
                onCommitPan?.(index, 0, 0);
                setLive(null);
              }
            : undefined
        }
      >
        {photo && box && shownSrc ? (
          <img
            src={shownSrc}
            alt={slot.caption || photo.name}
            draggable={false}
            className="absolute max-w-none select-none"
            style={{
              left: `${box.left}%`,
              top: `${box.top}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
          />
        ) : (
          interactive && (
            <button
              type="button"
              className="flex h-full w-full items-center justify-center px-2 text-center text-muted"
              onClick={() => onSelectSlot?.(index)}
            >
              <span className="font-serif text-sm italic">{placing ? "Place here" : "Empty frame"}</span>
            </button>
          )
        )}
        {interactive && photo && (
          <div
            className="absolute top-1 left-1 z-10 flex size-8 cursor-grab items-center justify-center rounded-sm bg-page/90 text-ink active:cursor-grabbing"
            draggable
            aria-label="Drag to swap with another frame"
            onPointerDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.dataTransfer.setData(SLOT_MIME, `${pageId}|${index}`);
              event.dataTransfer.setData(PHOTO_MIME, slot.photoId ?? "");
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <GripVertical className="size-4" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="caption-band absolute inset-x-0 bottom-0 border-t border-line bg-caption text-ink" style={{ height: `${captionFrac * 100}%` }}>
        {interactive && photo ? (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center px-2 text-center"
            onClick={() => onSelectSlot?.(index)}
          >
            <span className={cn("caption-copy font-serif italic", !slot.caption && "text-muted")}>
              {slot.caption || "Add a caption"}
            </span>
          </button>
        ) : (
          <p className="caption-copy flex h-full w-full items-center justify-center px-2 text-center font-serif italic">
            {slot.caption}
          </p>
        )}
      </div>
    </div>
  );
}

export { PHOTO_MIME, SLOT_MIME };
