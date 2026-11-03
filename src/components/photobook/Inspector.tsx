import { memo, type ReactNode } from "react";
import * as Slider from "@radix-ui/react-slider";
import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { LAYOUTS, LAYOUT_BY_ID } from "@/lib/photobook/layouts";
import {
  LIMITS,
  PAGE_INCHES,
  type Density,
  type LayoutId,
  type Orientation,
  type Page,
  type Photo,
} from "@/lib/photobook/types";
import { cn } from "@/lib/cn";

type InspectorProps = {
  page: Page | null;
  pageCount: number;
  pageIndex: number;
  orientation: Orientation;
  marginIn: number;
  gapIn: number;
  captionIn: number;
  density: Density;
  photo?: Photo;
  caption: string;
  zoom: number;
  hasPhoto: boolean;
  onLayout: (layout: LayoutId) => void;
  onCaption: (value: string) => void;
  onZoom: (zoom: number) => void;
  onResetCrop: () => void;
  onClearSlot: () => void;
  onMargin: (value: number) => void;
  onGap: (value: number) => void;
  onCaptionSize: (value: number) => void;
  onOrientation: (orientation: Orientation) => void;
  onDensity: (density: Density) => void;
  onAddPage: () => void;
  onDuplicate: () => void;
  onDeletePage: () => void;
  onMove: (dir: -1 | 1) => void;
  onClearPages: () => void;
  onDeletePhotos: () => void;
};

export const Inspector = memo(function Inspector(props: InspectorProps) {
  const size = PAGE_INCHES[props.orientation];
  return (
    <div className="scroll-thin flex h-full min-h-0 flex-col overflow-y-auto">
      <section className="px-4 pt-4 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl">This page</h2>
          <p className="text-sm text-muted tabular-nums">
            {props.pageIndex + 1} / {props.pageCount}
          </p>
        </div>
        <p className="mt-1 text-sm text-muted">
          {size.w} × {size.h} in · {props.page ? LAYOUT_BY_ID[props.page.layout].slots : 0} frames
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Page layout">
          {LAYOUTS.map((layout) => {
            const active = props.page?.layout === layout.id;
            return (
              <button
                key={layout.id}
                type="button"
                aria-pressed={active}
                aria-label={layout.hint}
                onClick={() => props.onLayout(layout.id)}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 rounded-sm px-1 py-2",
                  active ? "bg-ink text-page" : "bg-caption text-ink",
                )}
              >
                <LayoutGlyph layoutId={layout.id} active={active} />
                <span className="text-xs">{layout.name}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <IconButton label="Previous page" onClick={() => props.onMove(-1)} disabled={props.pageIndex <= 0}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <IconButton label="Next page" onClick={() => props.onMove(1)} disabled={props.pageIndex >= props.pageCount - 1}>
            <ChevronRight className="size-4" />
          </IconButton>
          <IconButton label="Duplicate page" onClick={props.onDuplicate}>
            <Copy className="size-4" />
          </IconButton>
          <IconButton label="Add page" onClick={props.onAddPage}>
            <Plus className="size-4" />
          </IconButton>
        </div>
        <button type="button" className="btn btn-quiet mt-2 w-full" onClick={props.onDeletePage}>
          <Trash2 className="size-4" aria-hidden="true" />
          Remove this page
        </button>
      </section>

      <section className="border-t border-line px-4 py-4">
        <h2 className="font-serif text-xl">Frame</h2>
        {props.hasPhoto ? (
          <>
            <label className="mt-3 block">
              <span className="text-sm text-muted">Caption along the bottom border</span>
              <textarea
                className="field mt-2 min-h-20 py-2 font-serif italic"
                value={props.caption}
                maxLength={140}
                rows={2}
                placeholder="A line under this photo"
                onChange={(event) => props.onCaption(event.target.value)}
              />
            </label>
            <InchSlider
              className="mt-3"
              label="Crop zoom"
              display={`${Math.round(props.zoom * 100)}%`}
              min={LIMITS.zoom.min}
              max={LIMITS.zoom.max}
              step={LIMITS.zoom.step}
              value={props.zoom}
              onChange={props.onZoom}
            />
            <p className="mt-1 text-sm text-pretty text-muted">
              Drag the photo to reframe. It stays in proportion — we crop the edges, never stretch.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-quiet" onClick={props.onResetCrop}>
                Reset crop
              </button>
              <button type="button" className="btn btn-quiet" onClick={props.onClearSlot}>
                Clear frame
              </button>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-pretty text-muted">
            Select a frame, then tap a photo or drop one in. Each photo keeps a caption on its bottom edge.
          </p>
        )}
      </section>

      <section className="border-t border-line px-4 py-4">
        <h2 className="font-serif text-xl">Book</h2>
        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Page orientation">
          <button
            type="button"
            className={cn("btn", props.orientation === "landscape" ? "btn-ink" : "btn-quiet")}
            aria-pressed={props.orientation === "landscape"}
            onClick={() => props.onOrientation("landscape")}
          >
            12 × 8
          </button>
          <button
            type="button"
            className={cn("btn", props.orientation === "portrait" ? "btn-ink" : "btn-quiet")}
            aria-pressed={props.orientation === "portrait"}
            onClick={() => props.onOrientation("portrait")}
          >
            8 × 12
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">Same sheet, turned. Both are an 8×12 photobook.</p>
        <InchSlider
          className="mt-4"
          label="Page margin"
          display={`${props.marginIn.toFixed(2)} in`}
          min={LIMITS.margin.min}
          max={LIMITS.margin.max}
          step={LIMITS.margin.step}
          value={props.marginIn}
          onChange={props.onMargin}
        />
        <InchSlider
          className="mt-2"
          label="Space between photos"
          display={`${props.gapIn.toFixed(2)} in`}
          min={LIMITS.gap.min}
          max={LIMITS.gap.max}
          step={LIMITS.gap.step}
          value={props.gapIn}
          onChange={props.onGap}
        />
        <InchSlider
          className="mt-2"
          label="Caption band"
          display={`${props.captionIn.toFixed(2)} in`}
          min={LIMITS.caption.min}
          max={LIMITS.caption.max}
          step={LIMITS.caption.step}
          value={props.captionIn}
          onChange={props.onCaptionSize}
        />
        <p className="mt-4 text-sm text-muted">Photos per new page</p>
        <div className="mt-2 grid grid-cols-4 gap-2" role="group" aria-label="Photos per new page">
          {([1, 2, 3, 4] as Density[]).map((count) => (
            <button
              key={count}
              type="button"
              className={cn("btn", props.density === count ? "btn-ink" : "btn-quiet")}
              aria-pressed={props.density === count}
              onClick={() => props.onDensity(count)}
            >
              {count}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-pretty text-muted">
          Bulk uploads fill pages at this count, up to 1,000 photos. Change a page’s layout any time.
        </p>
      </section>

      <section className="mt-auto border-t border-line px-4 py-4">
        <button type="button" className="btn btn-quiet w-full" onClick={props.onClearPages}>
          Clear pages
        </button>
        <button type="button" className="btn btn-quiet mt-2 w-full text-accent" onClick={props.onDeletePhotos}>
          Delete all photos
        </button>
      </section>
    </div>
  );
});

function LayoutGlyph({ layoutId, active }: { layoutId: LayoutId; active: boolean }) {
  const layout = LAYOUT_BY_ID[layoutId];
  return (
    <span className={cn("relative block h-6 w-9", active ? "bg-page/15" : "bg-page")}>
      {layout.areas.map((area, index) => (
        <span
          key={index}
          className={cn("absolute", active ? "bg-page" : "bg-ink/80")}
          style={{
            left: `${area.x * 100}%`,
            top: `${area.y * 100}%`,
            width: `${area.w * 100}%`,
            height: `${area.h * 100}%`,
            outline: "1px solid transparent",
            transform: "scale(0.86)",
          }}
        />
      ))}
    </span>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" className="btn btn-quiet px-0" aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function InchSlider({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
  className,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="text-muted tabular-nums">{display}</span>
      </span>
      <Slider.Root
        className="relative flex h-11 w-full touch-none items-center"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-line">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-5 rounded-full border-2 border-accent bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={label}
        />
      </Slider.Root>
    </label>
  );
}
