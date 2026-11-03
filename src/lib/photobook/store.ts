import { create } from "zustand";
import { decodeImage, prettyName } from "@/lib/photobook/decode";
import {
  deleteAllPhotoRecords,
  deletePhotoRecord,
  getBlob,
  loadBook,
  loadThumbs,
  putPhoto,
  saveBook,
} from "@/lib/photobook/db";
import { defaultLayout, makePage, withLayout, LAYOUT_BY_ID } from "@/lib/photobook/layouts";
import { SAMPLE_ALBUM } from "@/lib/photobook/samples";
import {
  clamp,
  emptySlot,
  MAX_PHOTOS,
  type Book,
  type Density,
  type LayoutId,
  type Orientation,
  type Page,
  type Photo,
  type Slot,
} from "@/lib/photobook/types";

type LibraryFilter = "all" | "loose";

type BookState = {
  ready: boolean;
  notice: string | null;
  importing: { done: number; total: number } | null;
  preparingPrint: boolean;
  photos: Photo[];
  fullUrls: Record<string, string>;
  title: string;
  orientation: Orientation;
  marginIn: number;
  gapIn: number;
  captionIn: number;
  density: Density;
  pages: Page[];
  activePageId: string | null;
  selectedSlot: number | null;
  placingId: string | null;
  libraryQuery: string;
  libraryFilter: LibraryFilter;
  hydrate: () => Promise<void>;
  setTitle: (title: string) => void;
  setOrientation: (orientation: Orientation) => void;
  setMargin: (marginIn: number) => void;
  setGap: (gapIn: number) => void;
  setCaptionSize: (captionIn: number) => void;
  setDensity: (density: Density) => void;
  setQuery: (libraryQuery: string) => void;
  setFilter: (libraryFilter: LibraryFilter) => void;
  selectPage: (id: string) => void;
  selectSlot: (index: number) => void;
  focusPhoto: (id: string) => void;
  cancelPlacing: () => void;
  importFiles: (files: File[], captions?: Record<string, string>) => Promise<void>;
  cancelImport: () => void;
  loadSamples: () => Promise<void>;
  addPage: () => void;
  duplicatePage: () => void;
  deletePage: () => void;
  movePage: (dir: -1 | 1) => void;
  stepPage: (dir: -1 | 1) => void;
  movePageTo: (fromId: string, toId: string) => void;
  setPageLayout: (layout: LayoutId) => void;
  assignPhoto: (pageId: string, index: number, photoId: string) => void;
  clearSlot: (pageId: string, index: number) => void;
  swapSlots: (fromPageId: string, fromIndex: number, toPageId: string, toIndex: number) => void;
  setSlotCaption: (pageId: string, index: number, caption: string) => void;
  setSlotCrop: (pageId: string, index: number, crop: Partial<Pick<Slot, "zoom" | "panX" | "panY">>) => void;
  deletePhoto: (id: string) => Promise<void>;
  clearPages: () => void;
  deleteAllPhotos: () => Promise<void>;
  loadProject: (book: Book, incoming: { id: string; name: string; blob: Blob }[]) => Promise<void>;
  ensureFull: (id: string) => Promise<void>;
  ensureAllFull: () => Promise<void>;
  setPreparingPrint: (preparingPrint: boolean) => void;
};

let canSave = false;
let saveTimer = 0;
let importCancelled = false;
let booted = false;
let dirty = false;
const fullLoads = new Map<string, Promise<void>>();

function snapshot(s: BookState): Book {
  return {
    title: s.title,
    orientation: s.orientation,
    marginIn: s.marginIn,
    gapIn: s.gapIn,
    captionIn: s.captionIn,
    density: s.density,
    pages: s.pages,
  };
}

function defaultBook(): Book {
  return {
    title: "Untitled book",
    orientation: "landscape",
    marginIn: 0.4,
    gapIn: 0.12,
    captionIn: 0.32,
    density: 2,
    pages: [makePage("two-cols")],
  };
}

function isDensity(n: number): n is Density {
  return n === 1 || n === 2 || n === 3 || n === 4;
}

function sanitizeBook(raw: Book | null): Book {
  const base = defaultBook();
  if (!raw || !Array.isArray(raw.pages) || raw.pages.length === 0) return base;
  const density = isDensity(raw.density) ? raw.density : 2;
  const pages = raw.pages.flatMap((page) => {
    if (!page || !LAYOUT_BY_ID[page.layout]) return [];
    return [withLayout({ ...page, slots: Array.isArray(page.slots) ? page.slots : [] }, page.layout)];
  });
  if (pages.length === 0) return base;
  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.slice(0, 80) : base.title,
    orientation: raw.orientation === "portrait" ? "portrait" : "landscape",
    marginIn: clamp(Number(raw.marginIn) || base.marginIn, 0, 1.25),
    gapIn: clamp(Number(raw.gapIn) || base.gapIn, 0.04, 0.45),
    captionIn: clamp(Number(raw.captionIn) || base.captionIn, 0.2, 0.7),
    density,
    pages,
  };
}

function bookIsEmpty(pages: Page[]) {
  return pages.every((page) => page.slots.every((slot) => !slot.photoId));
}

function persistLater() {
  dirty = true;
  if (!canSave) return;
  window.clearTimeout(saveTimer);
  const book = snapshot(useBook.getState());
  saveTimer = window.setTimeout(() => {
    void saveBook(book);
  }, 220);
}

function flash(notice: string) {
  useBook.setState({ notice });
  window.setTimeout(() => {
    if (useBook.getState().notice === notice) useBook.setState({ notice: null });
  }, 4600);
}

function placeIds(pages: Page[], ids: string[], density: Density, replaceEmpty: boolean): Page[] {
  if (ids.length === 0) return pages;
  const next = replaceEmpty ? [] : pages.slice();
  let cursor = 0;
  while (cursor < ids.length) {
    const remain = ids.length - cursor;
    const count = Math.min(density, remain) as Density;
    const page = makePage(defaultLayout(count));
    page.slots = page.slots.map((slot, index) => {
      const id = ids[cursor + index];
      return id ? { ...slot, photoId: id } : slot;
    });
    cursor += count;
    next.push(page);
  }
  return next;
}

function patchSlot(pages: Page[], pageId: string, index: number, recipe: (slot: Slot) => Slot): Page[] {
  return pages.map((page) => {
    if (page.id !== pageId || !page.slots[index]) return page;
    const slots = page.slots.slice();
    slots[index] = recipe(slots[index]);
    return { ...page, slots };
  });
}

export const useBook = create<BookState>((set, get) => {
  const seed = defaultBook();
  return {
  ready: true,
  notice: null,
  importing: null,
  preparingPrint: false,
  photos: [],
  fullUrls: {},
  title: seed.title,
  orientation: seed.orientation,
  marginIn: seed.marginIn,
  gapIn: seed.gapIn,
  captionIn: seed.captionIn,
  density: seed.density,
  pages: seed.pages,
  activePageId: seed.pages[0]?.id ?? null,
  selectedSlot: 0,
  placingId: null,
  libraryQuery: "",
  libraryFilter: "all",

  hydrate: async () => {
    if (booted) return;
    booted = true;
    try {
      const [thumbs, stored] = await Promise.all([loadThumbs(), loadBook()]);
      const photos: Photo[] = thumbs.map((thumb) => ({
        id: thumb.id,
        name: thumb.name,
        w: thumb.w,
        h: thumb.h,
        thumbUrl: URL.createObjectURL(thumb.thumb),
      }));
      if (dirty) {
        set({ photos });
        return;
      }
      if (!stored && photos.length === 0) return;
      const book = sanitizeBook(stored);
      const pages = stored ? book.pages : placeIds(book.pages, photos.map((photo) => photo.id), book.density, true);
      set({
        photos,
        ...book,
        pages,
        activePageId: pages[0]?.id ?? null,
        selectedSlot: 0,
      });
    } catch (error) {
      set({
        notice: error instanceof Error ? error.message : "Could not open the saved book.",
      });
    } finally {
      canSave = true;
      if (dirty) persistLater();
    }
  },

  setTitle: (title) => {
    set({ title: title.slice(0, 80) });
    persistLater();
  },
  setOrientation: (orientation) => {
    set({ orientation });
    persistLater();
  },
  setMargin: (marginIn) => {
    set({ marginIn: clamp(marginIn, 0, 1.25) });
    persistLater();
  },
  setGap: (gapIn) => {
    set({ gapIn: clamp(gapIn, 0.04, 0.45) });
    persistLater();
  },
  setCaptionSize: (captionIn) => {
    set({ captionIn: clamp(captionIn, 0.2, 0.7) });
    persistLater();
  },
  setDensity: (density) => {
    set({ density });
    persistLater();
  },
  setQuery: (libraryQuery) => set({ libraryQuery }),
  setFilter: (libraryFilter) => set({ libraryFilter }),
  selectPage: (id) => set({ activePageId: id, selectedSlot: null }),
  selectSlot: (index) => {
    const placingId = get().placingId;
    const pageId = get().activePageId;
    set({ selectedSlot: index });
    if (placingId && pageId) {
      get().assignPhoto(pageId, index, placingId);
      set({ placingId: null });
    }
  },
  focusPhoto: (id) => set({ placingId: get().placingId === id ? null : id }),
  cancelPlacing: () => set({ placingId: null }),
  cancelImport: () => {
    importCancelled = true;
  },

  importFiles: async (files, captions) => {
    if (get().importing) return;
    const images = files.filter((file) => file.type.startsWith("image/"));
    const room = MAX_PHOTOS - get().photos.length;
    if (room <= 0) {
      flash("This book already holds 1,000 photos.");
      return;
    }
    if (images.length === 0) {
      flash("Choose image files — JPEG, PNG, or WebP.");
      return;
    }
    const batch = images.slice(0, room);
    const overflow = images.length - batch.length;
    importCancelled = false;
    set({ importing: { done: 0, total: batch.length } });
    const fresh: Photo[] = [];
    const ids: string[] = [];
    let failed = 0;
    for (let i = 0; i < batch.length; i += 1) {
      if (importCancelled) break;
      const file = batch[i];
      try {
        const decoded = await decodeImage(file);
        const id = crypto.randomUUID();
        const name = prettyName(file.name);
        await putPhoto({ id, name, w: decoded.w, h: decoded.h, thumb: decoded.thumb }, decoded.blob);
        const photo: Photo = {
          id,
          name,
          w: decoded.w,
          h: decoded.h,
          thumbUrl: URL.createObjectURL(decoded.thumb),
        };
        fresh.push(photo);
        ids.push(id);
      } catch {
        failed += 1;
      }
      if (fresh.length > 0 && (fresh.length % 3 === 0 || i === batch.length - 1)) {
        const chunk = fresh.splice(0);
        set((state) => ({ photos: state.photos.concat(chunk), importing: { done: i + 1, total: batch.length } }));
      } else {
        set({ importing: { done: i + 1, total: batch.length } });
      }
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (fresh.length) {
      set((state) => ({ photos: state.photos.concat(fresh) }));
    }
    const replaceEmpty = bookIsEmpty(get().pages);
    const pages = placeIds(get().pages, ids, get().density, replaceEmpty);
    const captioned = captions
      ? pages.map((page) => ({
          ...page,
          slots: page.slots.map((slot) => {
            if (!slot.photoId || slot.caption) return slot;
            const photo = get().photos.find((item) => item.id === slot.photoId);
            const caption = photo ? captions[photo.name] : undefined;
            return caption ? { ...slot, caption } : slot;
          }),
        }))
      : pages;
    set({
      pages: captioned,
      activePageId: replaceEmpty ? (captioned[0]?.id ?? null) : (get().activePageId ?? captioned[0]?.id ?? null),
      importing: null,
      selectedSlot: 0,
    });
    persistLater();
    const notes: string[] = [];
    if (importCancelled) notes.push("Import stopped.");
    else notes.push(`${ids.length} photo${ids.length === 1 ? "" : "s"} added.`);
    if (overflow > 0) notes.push(`${overflow} left out — the limit is 1,000.`);
    if (failed > 0) notes.push(`${failed} could not be read.`);
    flash(notes.join(" "));
    for (const id of ids.slice(0, 8)) void get().ensureFull(id);
  },

  loadSamples: async () => {
    if (get().importing) return;
    try {
      const captions: Record<string, string> = {};
      const files: File[] = [];
      for (const sample of SAMPLE_ALBUM) {
        const response = await fetch(`/samples/${sample.file}`);
        if (!response.ok) throw new Error("Sample photographs are missing.");
        const blob = await response.blob();
        files.push(new File([blob], `${sample.name}.jpg`, { type: "image/jpeg" }));
        captions[sample.name] = sample.caption;
      }
      if (bookIsEmpty(get().pages)) {
        set({
          title: get().title === "Untitled book" ? "Studio sample" : get().title,
          density: 2,
          orientation: "landscape",
        });
      }
      await get().importFiles(files, captions);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not open the sample album.");
    }
  },

  addPage: () => {
    const page = makePage(defaultLayout(get().density));
    const pages = get().pages.concat(page);
    set({ pages, activePageId: page.id, selectedSlot: null });
    persistLater();
  },
  duplicatePage: () => {
    const current = get().pages.find((page) => page.id === get().activePageId);
    if (!current) return;
    const copy: Page = {
      ...current,
      id: crypto.randomUUID(),
      slots: current.slots.map((slot) => ({ ...slot })),
    };
    const index = get().pages.findIndex((page) => page.id === current.id);
    const pages = get().pages.slice();
    pages.splice(index + 1, 0, copy);
    set({ pages, activePageId: copy.id });
    persistLater();
  },
  deletePage: () => {
    if (get().pages.length <= 1) {
      const page = makePage(defaultLayout(get().density));
      set({ pages: [page], activePageId: page.id, selectedSlot: null });
      persistLater();
      return;
    }
    const id = get().activePageId;
    const index = get().pages.findIndex((page) => page.id === id);
    const pages = get().pages.filter((page) => page.id !== id);
    const next = pages[Math.max(0, index - 1)] ?? pages[0];
    set({ pages, activePageId: next?.id ?? null, selectedSlot: null });
    persistLater();
  },
  movePage: (dir) => {
    const pages = get().pages.slice();
    const index = pages.findIndex((page) => page.id === get().activePageId);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= pages.length) return;
    const [page] = pages.splice(index, 1);
    pages.splice(target, 0, page);
    set({ pages });
    persistLater();
  },
  stepPage: (dir) => {
    const pages = get().pages;
    const index = pages.findIndex((page) => page.id === get().activePageId);
    const next = pages[index + dir];
    if (!next) return;
    set({ activePageId: next.id, selectedSlot: 0 });
  },
  movePageTo: (fromId, toId) => {
    if (fromId === toId) return;
    const pages = get().pages.slice();
    const from = pages.findIndex((page) => page.id === fromId);
    const to = pages.findIndex((page) => page.id === toId);
    if (from < 0 || to < 0) return;
    const [page] = pages.splice(from, 1);
    pages.splice(to, 0, page);
    set({ pages, activePageId: fromId });
    persistLater();
  },
  setPageLayout: (layout) => {
    const id = get().activePageId;
    if (!id) return;
    const pages = get().pages.map((page) => (page.id === id ? withLayout(page, layout) : page));
    const page = pages.find((item) => item.id === id);
    const selected = get().selectedSlot;
    set({
      pages,
      selectedSlot: selected != null && page && selected < page.slots.length ? selected : 0,
    });
    persistLater();
  },
  assignPhoto: (pageId, index, photoId) => {
    set({
      pages: patchSlot(get().pages, pageId, index, (slot) => ({
        ...slot,
        photoId,
        zoom: 1,
        panX: 0,
        panY: 0,
      })),
      activePageId: pageId,
      selectedSlot: index,
    });
    persistLater();
    void get().ensureFull(photoId);
  },
  clearSlot: (pageId, index) => {
    set({ pages: patchSlot(get().pages, pageId, index, () => emptySlot()) });
    persistLater();
  },
  swapSlots: (fromPageId, fromIndex, toPageId, toIndex) => {
    const pages = get().pages.map((page) => ({ ...page, slots: page.slots.map((slot) => ({ ...slot })) }));
    const from = pages.find((page) => page.id === fromPageId);
    const to = pages.find((page) => page.id === toPageId);
    if (!from?.slots[fromIndex] || !to?.slots[toIndex]) return;
    const temp = from.slots[fromIndex];
    from.slots[fromIndex] = to.slots[toIndex];
    to.slots[toIndex] = temp;
    set({ pages, activePageId: toPageId, selectedSlot: toIndex });
    persistLater();
  },
  setSlotCaption: (pageId, index, caption) => {
    set({
      pages: patchSlot(get().pages, pageId, index, (slot) => ({ ...slot, caption: caption.slice(0, 140) })),
    });
    persistLater();
  },
  setSlotCrop: (pageId, index, crop) => {
    set({
      pages: patchSlot(get().pages, pageId, index, (slot) => ({
        ...slot,
        zoom: crop.zoom == null ? slot.zoom : clamp(crop.zoom, 1, 2.5),
        panX: crop.panX == null ? slot.panX : clamp(crop.panX, -1, 1),
        panY: crop.panY == null ? slot.panY : clamp(crop.panY, -1, 1),
      })),
    });
    persistLater();
  },
  deletePhoto: async (id) => {
    const photo = get().photos.find((item) => item.id === id);
    if (photo) URL.revokeObjectURL(photo.thumbUrl);
    const full = get().fullUrls[id];
    if (full) URL.revokeObjectURL(full);
    const { [id]: _removed, ...fullUrls } = get().fullUrls;
    set({
      photos: get().photos.filter((item) => item.id !== id),
      fullUrls,
      placingId: get().placingId === id ? null : get().placingId,
      pages: get().pages.map((page) => ({
        ...page,
        slots: page.slots.map((slot) => (slot.photoId === id ? emptySlot() : slot)),
      })),
    });
    persistLater();
    await deletePhotoRecord(id);
  },
  clearPages: () => {
    const page = makePage(defaultLayout(get().density));
    set({ pages: [page], activePageId: page.id, selectedSlot: null });
    persistLater();
    flash("Pages cleared. Photos are still in the library.");
  },
  deleteAllPhotos: async () => {
    for (const photo of get().photos) URL.revokeObjectURL(photo.thumbUrl);
    for (const url of Object.values(get().fullUrls)) URL.revokeObjectURL(url);
    const page = makePage(defaultLayout(get().density));
    set({
      photos: [],
      fullUrls: {},
      placingId: null,
      pages: [page],
      activePageId: page.id,
      selectedSlot: null,
    });
    persistLater();
    await deleteAllPhotoRecords();
    flash("All photos removed.");
  },
  loadProject: async (book, incoming) => {
    set({ importing: incoming.length ? { done: 0, total: incoming.length } : null, notice: null });
    try {
      const nextPhotos: Photo[] = [];
      for (let index = 0; index < incoming.length; index += 1) {
        const item = incoming[index];
        const decoded = await decodeImage(item.blob);
        await putPhoto(
          { id: item.id, name: item.name, w: decoded.w, h: decoded.h, thumb: decoded.thumb },
          decoded.blob,
        );
        nextPhotos.push({
          id: item.id,
          name: item.name,
          w: decoded.w,
          h: decoded.h,
          thumbUrl: URL.createObjectURL(decoded.thumb),
        });
        set({ importing: { done: index + 1, total: incoming.length } });
      }
      const kept = new Set(nextPhotos.map((photo) => photo.id));
      for (const photo of get().photos) {
        URL.revokeObjectURL(photo.thumbUrl);
        if (!kept.has(photo.id)) await deletePhotoRecord(photo.id);
      }
      for (const url of Object.values(get().fullUrls)) URL.revokeObjectURL(url);
      const clean = sanitizeBook(book);
      set({
        ...clean,
        photos: nextPhotos,
        fullUrls: {},
        placingId: null,
        activePageId: clean.pages[0]?.id ?? null,
        selectedSlot: 0,
        importing: null,
        libraryQuery: "",
        libraryFilter: "all",
      });
      dirty = true;
      await saveBook(clean);
      flash(`Opened “${clean.title}”.`);
    } catch (error) {
      set({ importing: null });
      flash(error instanceof Error ? error.message : "Could not open that project.");
    }
  },
  ensureFull: async (id) => {
    if (get().fullUrls[id]) return;
    const pending = fullLoads.get(id);
    if (pending) return pending;
    const job = (async () => {
      const blob = await getBlob(id);
      if (!blob) return;
      if (get().fullUrls[id]) return;
      const url = URL.createObjectURL(blob);
      set((state) => ({ fullUrls: { ...state.fullUrls, [id]: url } }));
    })().finally(() => {
      fullLoads.delete(id);
    });
    fullLoads.set(id, job);
    return job;
  },
  ensureAllFull: async () => {
    const ids = new Set<string>();
    for (const page of get().pages) {
      for (const slot of page.slots) if (slot.photoId) ids.add(slot.photoId);
    }
    const missing = [...ids].filter((id) => !get().fullUrls[id]);
    for (let i = 0; i < missing.length; i += 6) {
      await Promise.all(missing.slice(i, i + 6).map((id) => get().ensureFull(id)));
    }
  },
  setPreparingPrint: (preparingPrint) => set({ preparingPrint }),
  };
});
