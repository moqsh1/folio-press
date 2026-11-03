export type Orientation = "landscape" | "portrait";
export type Density = 1 | 2 | 3 | 4;
export type LayoutId =
  | "one"
  | "two-cols"
  | "two-rows"
  | "three-feature"
  | "three-banner"
  | "three-cols"
  | "four";

export type Slot = {
  photoId: string | null;
  caption: string;
  zoom: number;
  panX: number;
  panY: number;
};

export type Page = {
  id: string;
  layout: LayoutId;
  slots: Slot[];
};

export type Book = {
  title: string;
  orientation: Orientation;
  marginIn: number;
  gapIn: number;
  captionIn: number;
  density: Density;
  pages: Page[];
};

export type Photo = {
  id: string;
  name: string;
  w: number;
  h: number;
  thumbUrl: string;
};

export const MAX_PHOTOS = 1000;

export const PAGE_INCHES: Record<Orientation, { w: number; h: number }> = {
  landscape: { w: 12, h: 8 },
  portrait: { w: 8, h: 12 },
};

export const LIMITS = {
  margin: { min: 0, max: 1.25, step: 0.05 },
  gap: { min: 0.04, max: 0.45, step: 0.01 },
  caption: { min: 0.2, max: 0.7, step: 0.02 },
  zoom: { min: 1, max: 2.5, step: 0.01 },
} as const;

export function emptySlot(): Slot {
  return { photoId: null, caption: "", zoom: 1, panX: 0, panY: 0 };
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
