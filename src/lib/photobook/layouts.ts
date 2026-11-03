import { clamp, emptySlot, type Density, type LayoutId, type Page, type Slot } from "@/lib/photobook/types";

export type Area = { x: number; y: number; w: number; h: number };

export type LayoutDef = {
  id: LayoutId;
  name: string;
  hint: string;
  slots: number;
  areas: Area[];
};

export const LAYOUTS: LayoutDef[] = [
  {
    id: "one",
    name: "Full",
    hint: "One photograph",
    slots: 1,
    areas: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  {
    id: "two-cols",
    name: "Pair",
    hint: "Two side by side",
    slots: 2,
    areas: [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: "two-rows",
    name: "Stack",
    hint: "Two stacked",
    slots: 2,
    areas: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: "three-feature",
    name: "Feature",
    hint: "Large photo and two",
    slots: 3,
    areas: [
      { x: 0, y: 0, w: 0.62, h: 1 },
      { x: 0.62, y: 0, w: 0.38, h: 0.5 },
      { x: 0.62, y: 0.5, w: 0.38, h: 0.5 },
    ],
  },
  {
    id: "three-banner",
    name: "Banner",
    hint: "Wide photo over two",
    slots: 3,
    areas: [
      { x: 0, y: 0, w: 1, h: 0.58 },
      { x: 0, y: 0.58, w: 0.5, h: 0.42 },
      { x: 0.5, y: 0.58, w: 0.5, h: 0.42 },
    ],
  },
  {
    id: "three-cols",
    name: "Columns",
    hint: "Three columns",
    slots: 3,
    areas: [
      { x: 0, y: 0, w: 1 / 3, h: 1 },
      { x: 1 / 3, y: 0, w: 1 / 3, h: 1 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 1 },
    ],
  },
  {
    id: "four",
    name: "Grid",
    hint: "Four photographs",
    slots: 4,
    areas: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
];

export const LAYOUT_BY_ID: Record<LayoutId, LayoutDef> = Object.fromEntries(
  LAYOUTS.map((layout) => [layout.id, layout]),
) as Record<LayoutId, LayoutDef>;

const DENSITY_LAYOUT: Record<Density, LayoutId> = {
  1: "one",
  2: "two-cols",
  3: "three-feature",
  4: "four",
};

export function defaultLayout(count: Density): LayoutId {
  return DENSITY_LAYOUT[count];
}

export function makePage(layoutId: LayoutId): Page {
  const layout = LAYOUT_BY_ID[layoutId];
  return {
    id: crypto.randomUUID(),
    layout: layoutId,
    slots: Array.from({ length: layout.slots }, () => emptySlot()),
  };
}

function asSlot(value: unknown): Slot {
  if (!value || typeof value !== "object") return emptySlot();
  const slot = value as Partial<Slot>;
  return {
    photoId: typeof slot.photoId === "string" ? slot.photoId : null,
    caption: typeof slot.caption === "string" ? slot.caption.slice(0, 140) : "",
    zoom: clamp(Number(slot.zoom) || 1, 1, 2.5),
    panX: clamp(Number(slot.panX) || 0, -1, 1),
    panY: clamp(Number(slot.panY) || 0, -1, 1),
  };
}

export function withLayout(page: Page, layoutId: LayoutId): Page {
  const layout = LAYOUT_BY_ID[layoutId];
  const slots = (page.slots ?? []).slice(0, layout.slots).map((slot) => asSlot(slot));
  while (slots.length < layout.slots) slots.push(emptySlot());
  return { ...page, layout: layoutId, slots };
}
