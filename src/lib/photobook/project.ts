import { getBlob } from "@/lib/photobook/db";
import type { Book, Photo } from "@/lib/photobook/types";
import { unzipStore, zipStore } from "@/lib/photobook/zip";

export type ProjectPhoto = { id: string; name: string; blob: Blob };

type ProjectJson = {
  version: 1;
  book: Book;
  photos: { id: string; name: string; file: string }[];
};

function slug(title: string) {
  const clean = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return clean || "folio";
}

export function projectFilename(title: string) {
  return `${slug(title)}.folio.zip`;
}

export function pdfFilename(title: string) {
  return `${slug(title)}.pdf`;
}

export async function buildProjectFile(book: Book, photos: Photo[]): Promise<Blob> {
  const listed: ProjectJson["photos"] = [];
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const photo of photos) {
    const blob = await getBlob(photo.id);
    if (!blob) continue;
    const file = `photos/${photo.id}.jpg`;
    listed.push({ id: photo.id, name: photo.name, file });
    entries.push({ name: file, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  const payload: ProjectJson = { version: 1, book, photos: listed };
  entries.unshift({ name: "book.json", data: new TextEncoder().encode(JSON.stringify(payload)) });
  const bytes = zipStore(entries);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: "application/zip" });
}

export async function readProjectFile(file: Blob): Promise<{ book: Book; photos: ProjectPhoto[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unzipped = unzipStore(bytes);
  const raw = unzipped.get("book.json");
  if (!raw) throw new Error("This file is not a Folio project.");
  let parsed: ProjectJson;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw)) as ProjectJson;
  } catch {
    throw new Error("This project file is damaged.");
  }
  if (!parsed || parsed.version !== 1 || !parsed.book || !Array.isArray(parsed.photos)) {
    throw new Error("This project was made by a newer Folio and cannot be opened here.");
  }
  const photos: ProjectPhoto[] = [];
  for (const item of parsed.photos) {
    if (!item || typeof item.id !== "string" || typeof item.file !== "string") continue;
    const data = unzipped.get(item.file);
    if (!data) continue;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    photos.push({
      id: item.id,
      name: typeof item.name === "string" && item.name.trim() ? item.name.slice(0, 120) : "Photo",
      blob: new Blob([copy], { type: "image/jpeg" }),
    });
  }
  return { book: parsed.book, photos };
}
