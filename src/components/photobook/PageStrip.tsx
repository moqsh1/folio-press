import { memo } from "react";
import { LAYOUT_BY_ID } from "@/lib/photobook/layouts";
import { PAGE_INCHES, type Orientation, type Page, type Photo } from "@/lib/photobook/types";
import { cn } from "@/lib/cn";

const PAGE_MIME = "application/x-folio-page";

type PageStripProps = {
  pages: Page[];
  activePageId: string | null;
  orientation: Orientation;
  photoById: Map<string, Photo>;
  onSelect: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
};

export const PageStrip = memo(function PageStrip({
  pages,
  activePageId,
  orientation,
  photoById,
  onSelect,
  onReorder,
}: PageStripProps) {
  const ratio = PAGE_INCHES[orientation];
  return (
    <div className="scroll-thin flex gap-3 overflow-x-auto px-4 py-3" aria-label="Pages">
      {pages.map((page, index) => {
        const layout = LAYOUT_BY_ID[page.layout];
        const active = page.id === activePageId;
        return (
          <button
            key={page.id}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData(PAGE_MIME, page.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(PAGE_MIME)) event.preventDefault();
            }}
            onDrop={(event) => {
              const fromId = event.dataTransfer.getData(PAGE_MIME);
              if (fromId) onReorder(fromId, page.id);
            }}
            onClick={() => onSelect(page.id)}
            className={cn(
              "thumb-cell w-24 shrink-0 text-left sm:w-28",
              active ? "opacity-100" : "opacity-80",
            )}
            aria-current={active ? "page" : undefined}
            aria-label={`Page ${index + 1}`}
          >
            <div
              className={cn("relative bg-page", active ? "ring-2 ring-accent" : "ring-1 ring-line")}
              style={{ aspectRatio: `${ratio.w} / ${ratio.h}` }}
            >
              {layout.areas.map((area, slotIndex) => {
                const photoId = page.slots[slotIndex]?.photoId;
                const photo = photoId ? photoById.get(photoId) : undefined;
                return (
                  <span
                    key={slotIndex}
                    className="absolute overflow-hidden bg-well"
                    style={{
                      left: `${area.x * 100}%`,
                      top: `${area.y * 100}%`,
                      width: `${area.w * 100}%`,
                      height: `${area.h * 100}%`,
                    }}
                  >
                    {photo && (
                      <img
                        src={photo.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${((page.slots[slotIndex].panX + 1) / 2) * 100}% ${((page.slots[slotIndex].panY + 1) / 2) * 100}%`,
                          transform: `scale(${page.slots[slotIndex].zoom})`,
                        }}
                      />
                    )}
                  </span>
                );
              })}
            </div>
            <span className="mt-1 block text-center text-xs text-muted tabular-nums">{index + 1}</span>
          </button>
        );
      })}
    </div>
  );
});
