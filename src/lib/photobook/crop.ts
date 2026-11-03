import { clamp } from "@/lib/photobook/types";

export type ImageSize = { w: number; h: number };

/**
 * Cover placement as percentages of the frame.
 * Zoom multiplies the minimum cover size, so the picture is cropped, never stretched.
 * slackX / slackY are the overflow, also in percent of the frame.
 */
export function imageBox(frameAspect: number, image: ImageSize, zoom: number, panX: number, panY: number) {
  const safeZoom = clamp(Number.isFinite(zoom) ? zoom : 1, 1, 4);
  const ir = image.w / Math.max(1, image.h);
  const fr = Math.max(0.05, frameAspect);
  let baseW: number;
  let baseH: number;
  if (ir > fr) {
    baseH = 100;
    baseW = (ir / fr) * 100;
  } else {
    baseW = 100;
    baseH = (fr / ir) * 100;
  }
  const width = baseW * safeZoom;
  const height = baseH * safeZoom;
  const slackX = Math.max(0, width - 100);
  const slackY = Math.max(0, height - 100);
  const px = clamp(panX, -1, 1);
  const py = clamp(panY, -1, 1);
  return {
    left: (-slackX * (px + 1)) / 2,
    top: (-slackY * (py + 1)) / 2,
    width,
    height,
    slackX,
    slackY,
  };
}
