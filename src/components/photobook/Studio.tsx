import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronLeft, ChevronRight, FolderOpen, Images, Printer, Save, SlidersHorizontal } from "lucide-react";
import { Inspector } from "@/components/photobook/Inspector";
import { Library } from "@/components/photobook/Library";
import { PageSheet } from "@/components/photobook/PageSheet";
import { PageStrip } from "@/components/photobook/PageStrip";
import { deliverFile } from "@/lib/photobook/download";
import { renderBookPdf } from "@/lib/photobook/pdf";
import { buildProjectFile, pdfFilename, projectFilename, readProjectFile } from "@/lib/photobook/project";
import { useBook } from "@/lib/photobook/store";
import { PAGE_INCHES, type Book, type Page } from "@/lib/photobook/types";
import { cn } from "@/lib/cn";

type Pane = "library" | "edit" | "pages";
type ConfirmKind = "pages" | "photos" | "load" | null;
type ExportMode = "current" | "selected" | "all";

export function Studio() {
  const book = useBook();
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState<Pane>("library");
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [pendingProject, setPendingProject] = useState<File | null>(null);
  const [printPages, setPrintPages] = useState<Page[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("current");
  const [picked, setPicked] = useState<string[]>([]);
  const [exportNote, setExportNote] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<{ url: string; name: string } | null>(null);
  const pdfBlob = useRef<Blob | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const openFiles = useCallback(() => fileRef.current?.click(), []);

  useEffect(() => {
    void book.hydrate();
  }, [book.hydrate]);

  useEffect(() => {
    document.title = `${book.title || "Untitled book"} · Folio Press`;
  }, [book.title]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [book.ready, pane]);

  const pagePhotoKey = book.pages
    .map((page) => `${page.id}:${page.slots.map((slot) => slot.photoId ?? "").join(",")}`)
    .join("|");

  useEffect(() => {
    const current = book.pages.find((item) => item.id === book.activePageId);
    if (!current) return;
    for (const slot of current.slots) {
      if (slot.photoId) void book.ensureFull(slot.photoId);
    }
  }, [book.activePageId, book.ensureFull, pagePhotoKey]);

  useEffect(() => {
    const over = (event: DragEvent) => {
      if ([...(event.dataTransfer?.types ?? [])].includes("Files")) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      void book.importFiles(files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [book.importFiles]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") book.stepPage(1);
      if (event.key === "ArrowLeft") book.stepPage(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [book.stepPage]);

  useEffect(() => {
    const done = () => setPrintPages(null);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  const photoById = useMemo(() => new Map(book.photos.map((photo) => [photo.id, photo])), [book.photos]);
  const placedSignature = book.pages
    .flatMap((page) => page.slots.map((slot) => slot.photoId ?? ""))
    .filter(Boolean)
    .join("|");
  const page = book.pages.find((item) => item.id === book.activePageId) ?? book.pages[0] ?? null;
  const pageIndex = page ? Math.max(0, book.pages.findIndex((item) => item.id === page.id)) : 0;
  const inches = PAGE_INCHES[book.orientation];
  const fitted = fitSheet(stage.w, stage.h, inches.w / inches.h);
  const slotIndex = book.selectedSlot;
  const slot = page && slotIndex != null ? page.slots[slotIndex] : null;
  const slotPhoto = slot?.photoId ? photoById.get(slot.photoId) : undefined;
  const progress = book.importing ? Math.round((book.importing.done / Math.max(1, book.importing.total)) * 100) : 0;

  function snapshot(): Book {
    return {
      title: book.title,
      orientation: book.orientation,
      marginIn: book.marginIn,
      gapIn: book.gapIn,
      captionIn: book.captionIn,
      density: book.density,
      pages: book.pages,
    };
  }

  function pagesForExport() {
    if (exportMode === "all") return book.pages;
    if (exportMode === "current") return page ? [page] : [];
    const chosen = new Set(picked);
    return book.pages.filter((item) => chosen.has(item.id));
  }

  function complain(message: string) {
    setProblem(message);
    window.setTimeout(() => {
      setProblem((current) => (current === message ? null : current));
    }, 5000);
  }

  function openExport() {
    setExportMode("current");
    setPicked(page ? [page.id] : []);
    setExportNote("");
    setExportOpen(true);
  }

  function closeExport() {
    setExportOpen(false);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    pdfBlob.current = null;
    setExportNote("");
  }

  async function openProject(file: File) {
    try {
      const project = await readProjectFile(file);
      await book.loadProject(project.book, project.photos);
    } catch (error) {
      complain(error instanceof Error ? error.message : "Could not open that project.");
    }
  }

  async function onSaveProject() {
    book.setPreparingPrint(true);
    try {
      const blob = await buildProjectFile(snapshot(), book.photos);
      const name = projectFilename(book.title);
      const url = URL.createObjectURL(blob);
      setHandoff((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, name };
      });
      const how = await deliverFile(blob, name);
      if (how === "cancelled") setProblem(null);
    } catch (error) {
      complain(error instanceof Error ? error.message : "Could not save the project.");
    } finally {
      book.setPreparingPrint(false);
    }
  }

  async function onMakePdf() {
    const pages = pagesForExport();
    if (pages.length === 0) {
      setExportNote("Choose at least one page.");
      return;
    }
    book.setPreparingPrint(true);
    setExportNote(`Drawing page 1 of ${pages.length}`);
    try {
      const blob = await renderBookPdf(snapshot(), pages, book.photos, (done, total) => {
        setExportNote(done >= total ? "PDF ready." : `Drawing page ${done + 1} of ${total}`);
      });
      pdfBlob.current = blob;
      const url = URL.createObjectURL(blob);
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setExportNote("PDF ready. Tap Save PDF. On Android, tap Share and send it to Files or Drive.");
    } catch (error) {
      setExportNote(error instanceof Error ? error.message : "Could not make the PDF.");
    } finally {
      book.setPreparingPrint(false);
    }
  }

  async function onSharePdf() {
    const blob = pdfBlob.current;
    if (!blob) return;
    try {
      const how = await deliverFile(blob, pdfFilename(book.title));
      if (how === "cancelled") return;
      setExportNote(how === "shared" ? "Share sheet opened." : "PDF download started.");
    } catch (error) {
      setExportNote(error instanceof Error ? error.message : "Could not share the PDF.");
    }
  }

  async function onSystemPrint() {
    const pages = pagesForExport();
    if (pages.length === 0) {
      setExportNote("Choose at least one page.");
      return;
    }
    book.setPreparingPrint(true);
    try {
      await book.ensureAllFull();
      setPrintPages(pages);
      await new Promise((resolve) => window.setTimeout(resolve, 60));
      const images = [...document.querySelectorAll<HTMLImageElement>(".print-root img")];
      await Promise.all(
        images.map(
          (img) =>
            img.complete && img.naturalWidth > 0
              ? Promise.resolve()
              : new Promise((resolve) => {
                  img.onload = () => resolve(null);
                  img.onerror = () => resolve(null);
                }),
        ),
      );
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve(null))));
      const style = document.createElement("style");
      style.setAttribute("data-folio-page", "1");
      style.textContent = `@page { size: ${inches.w}in ${inches.h}in; margin: 0; }`;
      document.head.appendChild(style);
      window.print();
      style.remove();
    } finally {
      book.setPreparingPrint(false);
    }
  }

  const library = (
    <Library
      photos={book.photos}
      placedSignature={placedSignature}
      placingId={book.placingId}
      query={book.libraryQuery}
      filter={book.libraryFilter}
      busy={book.importing != null}
      onQuery={book.setQuery}
      onFilter={book.setFilter}
      onFocus={book.focusPhoto}
      onAdd={openFiles}
      onSamples={() => {
        void book.loadSamples();
      }}
      onDelete={(id) => {
        void book.deletePhoto(id);
      }}
    />
  );

  const inspector = (
    <Inspector
      page={page}
      pageCount={Math.max(1, book.pages.length)}
      pageIndex={pageIndex}
      orientation={book.orientation}
      marginIn={book.marginIn}
      gapIn={book.gapIn}
      captionIn={book.captionIn}
      density={book.density}
      photo={slotPhoto}
      caption={slot?.caption ?? ""}
      zoom={slot?.zoom ?? 1}
      hasPhoto={Boolean(slot?.photoId)}
      onLayout={book.setPageLayout}
      onCaption={(value) => page && slotIndex != null && book.setSlotCaption(page.id, slotIndex, value)}
      onZoom={(zoom) => page && slotIndex != null && book.setSlotCrop(page.id, slotIndex, { zoom })}
      onResetCrop={() =>
        page && slotIndex != null && book.setSlotCrop(page.id, slotIndex, { zoom: 1, panX: 0, panY: 0 })
      }
      onClearSlot={() => page && slotIndex != null && book.clearSlot(page.id, slotIndex)}
      onMargin={book.setMargin}
      onGap={book.setGap}
      onCaptionSize={book.setCaptionSize}
      onOrientation={book.setOrientation}
      onDensity={book.setDensity}
      onAddPage={book.addPage}
      onDuplicate={book.duplicatePage}
      onDeletePage={book.deletePage}
      onMove={book.stepPage}
      onClearPages={() => setConfirm("pages")}
      onDeletePhotos={() => setConfirm("photos")}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <header className="no-print flex items-center gap-3 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <div className="leading-none">
          <p className="font-serif text-xl tracking-tight">Folio</p>
          <p className="text-xs tracking-widest text-muted uppercase">Press</p>
        </div>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Book title</span>
          <input
            className="w-full min-w-0 bg-transparent font-serif text-lg text-ink outline-none"
            value={book.title}
            maxLength={80}
            aria-label="Book title"
            onChange={(event) => book.setTitle(event.target.value)}
          />
        </label>
        <button type="button" className="btn btn-quiet px-3" onClick={openFiles} disabled={book.importing != null} aria-label="Add photos">
          <span className="hidden sm:inline">Add photos</span>
          <Images className="size-4 sm:hidden" aria-hidden="true" />
        </button>
        <button type="button" className="btn btn-quiet px-3" onClick={() => void onSaveProject()} disabled={book.preparingPrint || !book.ready} aria-label="Save project">
          <Save className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">Save</span>
        </button>
        <button type="button" className="btn btn-quiet px-3" onClick={() => projectRef.current?.click()} disabled={book.importing != null} aria-label="Open project">
          <FolderOpen className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">Open</span>
        </button>
        <button type="button" className="btn btn-primary px-3" onClick={openExport} disabled={book.preparingPrint || !book.ready} aria-label="Export PDF">
          <Printer className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      </header>

      {book.importing && (
        <div className="no-print border-b border-line bg-surface px-4 py-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="tabular-nums">
              Adding {book.importing.done} of {book.importing.total}
            </p>
            <button type="button" className="min-h-11 px-2 text-accent" onClick={book.cancelImport}>
              Stop
            </button>
          </div>
          <div className="mt-2 h-1 bg-line">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {(book.notice || problem) && (
        <p className="no-print border-b border-line bg-caption px-4 py-2 text-sm" aria-live="polite">
          {problem || book.notice}
        </p>
      )}

      {handoff && (
        <p className="no-print border-b border-line bg-surface px-4 py-2 text-sm">
          Project file ready.{" "}
          <a className="font-medium text-accent underline" href={handoff.url} download={handoff.name}>
            Download {handoff.name}
          </a>
        </p>
      )}

      {book.placingId && (
        <div className="no-print flex items-center justify-between gap-3 border-b border-line bg-ink px-4 py-2 text-sm text-page">
          <p>Tap a frame to place this photo.</p>
          <button type="button" className="min-h-11 px-2" onClick={book.cancelPlacing}>
            Cancel
          </button>
        </div>
      )}

      {!book.ready ? (
        <main className="grid flex-1 place-items-center px-6 text-center">
          <p className="font-serif text-2xl">Opening your book…</p>
        </main>
      ) : (
        <div className="no-print flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside
            className={cn(
              "order-2 min-h-0 border-line bg-surface lg:order-none lg:flex lg:h-auto lg:w-80 lg:shrink-0 lg:flex-col lg:border-r",
              pane === "library" ? "flex h-72 shrink-0 flex-col border-t" : "max-lg:hidden",
            )}
          >
            {library}
          </aside>

          <section className="order-1 flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={stageRef} className="relative min-h-0 flex-1">
              {page && fitted.w > 0 && (
                <div
                  className="sheet-shadow absolute top-1/2 left-1/2 bg-page"
                  style={{ width: fitted.w, height: fitted.h, marginLeft: -fitted.w / 2, marginTop: -fitted.h / 2 }}
                >
                  <PageSheet
                    page={page}
                    orientation={book.orientation}
                    marginIn={book.marginIn}
                    gapIn={book.gapIn}
                    captionIn={book.captionIn}
                    photoById={photoById}
                    fullUrls={book.fullUrls}
                    pageNumber={pageIndex + 1}
                    interactive
                    selectedSlot={book.selectedSlot}
                    placing={Boolean(book.placingId)}
                    onSelectSlot={book.selectSlot}
                    onCommitPan={(index, panX, panY) => book.setSlotCrop(page.id, index, { panX, panY })}
                    onDropPhoto={(index, photoId) => book.assignPhoto(page.id, index, photoId)}
                    onSwap={(index, fromPageId, fromIndex) => book.swapSlots(fromPageId, fromIndex, page.id, index)}
                  />
                </div>
              )}
              <p className="pointer-events-none absolute bottom-3 left-4 text-xs tracking-wide text-muted uppercase">
                {inches.w} × {inches.h} in
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-1 lg:hidden">
              <button
                type="button"
                className="btn btn-quiet px-3"
                aria-label="Previous page"
                onClick={() => book.stepPage(-1)}
                disabled={pageIndex <= 0}
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-sm tabular-nums">
                Page {pageIndex + 1} of {book.pages.length}
              </p>
              <button
                type="button"
                className="btn btn-quiet px-3"
                aria-label="Next page"
                onClick={() => book.stepPage(1)}
                disabled={pageIndex >= book.pages.length - 1}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className={cn("border-t border-line bg-surface", pane === "pages" ? "block lg:block" : "hidden lg:block")}>
              <PageStrip
                pages={book.pages}
                activePageId={page?.id ?? null}
                orientation={book.orientation}
                photoById={photoById}
                onSelect={book.selectPage}
                onReorder={book.movePageTo}
              />
            </div>
          </section>

          <aside
            className={cn(
              "order-3 min-h-0 border-line bg-surface lg:order-none lg:block lg:h-auto lg:w-80 lg:shrink-0 lg:overflow-visible lg:border-l",
              pane === "edit" ? "h-80 shrink-0 overflow-hidden border-t" : "max-lg:hidden",
            )}
          >
            {inspector}
          </aside>
        </div>
      )}

      <nav className="safe-bottom no-print grid grid-cols-3 border-t border-line bg-surface lg:hidden" aria-label="Editor">
        <PaneButton active={pane === "pages"} onClick={() => setPane("pages")} label="Pages">
          <BookOpen className="size-4" />
        </PaneButton>
        <PaneButton active={pane === "library"} onClick={() => setPane("library")} label="Photos">
          <Images className="size-4" />
        </PaneButton>
        <PaneButton active={pane === "edit"} onClick={() => setPane("edit")} label="Adjust">
          <SlidersHorizontal className="size-4" />
        </PaneButton>
      </nav>

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void book.importFiles(files);
        }}
      />

      <input
        ref={projectRef}
        className="sr-only"
        type="file"
        accept=".folio,.zip,application/zip"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const hasWork =
            book.photos.length > 0 ||
            book.pages.length > 1 ||
            book.pages.some((item) => item.slots.some((slot) => slot.photoId || slot.caption));
          if (hasWork) {
            setPendingProject(file);
            setConfirm("load");
            return;
          }
          void openProject(file);
        }}
      />

      {printPages &&
        createPortal(
          <div className="print-root">
            {printPages.map((item) => {
              const number = Math.max(1, book.pages.findIndex((pageItem) => pageItem.id === item.id) + 1);
              return (
                <div key={item.id} className="print-page" style={{ width: `${inches.w}in`, height: `${inches.h}in` }}>
                  <PageSheet
                    page={item}
                    orientation={book.orientation}
                    marginIn={book.marginIn}
                    gapIn={book.gapIn}
                    captionIn={book.captionIn}
                    photoById={photoById}
                    fullUrls={book.fullUrls}
                    pageNumber={number}
                  />
                </div>
              );
            })}
          </div>,
          document.body,
        )}

      {exportOpen && (
        <div className="no-print fixed inset-0 z-40 grid place-items-center bg-ink/40 px-4" role="dialog" aria-modal="true" aria-labelledby="export-title">
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto bg-raised p-6">
            <h2 id="export-title" className="font-serif text-2xl">Export PDF</h2>
            <p className="mt-2 text-sm text-pretty text-muted">
              A real PDF file, {inches.w}×{inches.h} in, with a page number on every page. This works in the browser and the Android app.
            </p>
            <fieldset className="mt-4 grid gap-2">
              <legend className="sr-only">Which pages</legend>
              {(
                [
                  ["current", "This page"],
                  ["selected", "Selected pages"],
                  ["all", `All pages (${book.pages.length})`],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name="export-mode"
                    className="size-4 accent-accent"
                    checked={exportMode === value}
                    onChange={() => setExportMode(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {exportMode === "selected" && (
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pages to export">
                {book.pages.map((item, index) => {
                  const on = picked.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn("btn min-w-11 px-3", on ? "btn-primary" : "btn-quiet")}
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((current) => (current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]))
                      }
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
            )}
            {exportNote && (
              <p className="mt-3 text-sm" aria-live="polite">
                {exportNote}
              </p>
            )}
            <div className="mt-5 grid gap-2">
              <button type="button" className="btn btn-primary" onClick={() => void onMakePdf()} disabled={book.preparingPrint}>
                {book.preparingPrint ? "Making PDF…" : "Download PDF"}
              </button>
              {pdfUrl && (
                <a className="btn btn-ink no-underline" href={pdfUrl} download={pdfFilename(book.title)}>
                  Save PDF
                </a>
              )}
              {pdfUrl && (
                <button type="button" className="btn btn-quiet" onClick={() => void onSharePdf()}>
                  Share
                </button>
              )}
              <button type="button" className="btn btn-quiet" onClick={() => void onSystemPrint()} disabled={book.preparingPrint}>
                Printer dialog
              </button>
              <button type="button" className="btn btn-quiet" onClick={closeExport}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-raised p-6">
            <h2 className="font-serif text-2xl">
              {confirm === "photos" ? "Delete every photo?" : confirm === "load" ? "Replace this book?" : "Clear every page?"}
            </h2>
            <p className="mt-2 text-sm text-pretty text-muted">
              {confirm === "photos"
                ? "This removes the library and empties the book on this device."
                : confirm === "load"
                  ? "Opening a project replaces the pages and photos stored on this device."
                  : "Photos stay in the library. Pages go back to a blank spread."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setConfirm(null);
                  setPendingProject(null);
                }}
              >
                Keep
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (confirm === "photos") void book.deleteAllPhotos();
                  else if (confirm === "load" && pendingProject) void openProject(pendingProject);
                  else if (confirm === "pages") book.clearPages();
                  setPendingProject(null);
                  setConfirm(null);
                }}
              >
                {confirm === "photos" ? "Delete" : confirm === "load" ? "Open" : "Clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaneButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
        active ? "text-accent" : "text-muted",
      )}
      aria-pressed={active}
    >
      {children}
      {label}
    </button>
  );
}

function fitSheet(stageW: number, stageH: number, aspect: number) {
  const pad = 28;
  const aw = stageW - pad * 2;
  const ah = stageH - pad * 2;
  if (aw <= 40 || ah <= 40) return { w: 0, h: 0 };
  if (aw / ah > aspect) return { w: ah * aspect, h: ah };
  return { w: aw, h: aw / aspect };
}
