const FULL_EDGE = 2200;
const THUMB_EDGE = 420;

export async function decodeImage(file: Blob): Promise<{ blob: Blob; thumb: Blob; w: number; h: number }> {
  const bitmap = await loadBitmap(file);
  try {
    const full = draw(bitmap, FULL_EDGE);
    const thumb = draw(bitmap, THUMB_EDGE);
    const blob = await canvasToJpeg(full.canvas, 0.86);
    const thumbBlob = await canvasToJpeg(thumb.canvas, 0.74);
    return { blob, thumb: thumbBlob, w: full.w, h: full.h };
  } finally {
    bitmap.close();
  }
}

function draw(bitmap: ImageBitmap, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the photograph.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, w, h };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not save the photograph."))),
      "image/jpeg",
      quality,
    );
  });
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Could not read that image."));
        el.src = url;
      });
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function prettyName(filename: string) {
  const stripped = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return stripped || "Photo";
}
