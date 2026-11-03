import type { Area } from "@/lib/photobook/layouts";

export type Rect = { x: number; y: number; w: number; h: number };

/** Cell rectangles in inches. Gap is physical inches between neighbors. */
export function cellRects(
  areas: Area[],
  pageW: number,
  pageH: number,
  margin: number,
  gap: number,
): Rect[] {
  const content: Rect = {
    x: margin,
    y: margin,
    w: Math.max(0.4, pageW - margin * 2),
    h: Math.max(0.4, pageH - margin * 2),
  };
  return areas.map((area) => {
    let x = content.x + area.x * content.w;
    let y = content.y + area.y * content.h;
    let w = area.w * content.w;
    let h = area.h * content.h;
    if (area.x > 0.001) {
      x += gap / 2;
      w -= gap / 2;
    }
    if (area.x + area.w < 0.999) w -= gap / 2;
    if (area.y > 0.001) {
      y += gap / 2;
      h -= gap / 2;
    }
    if (area.y + area.h < 0.999) h -= gap / 2;
    return { x, y, w: Math.max(0.2, w), h: Math.max(0.2, h) };
  });
}

export function rectToPercent(rect: Rect, pageW: number, pageH: number) {
  return {
    left: `${(rect.x / pageW) * 100}%`,
    top: `${(rect.y / pageH) * 100}%`,
    width: `${(rect.w / pageW) * 100}%`,
    height: `${(rect.h / pageH) * 100}%`,
  };
}
