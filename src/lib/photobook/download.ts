export type Delivered = "shared" | "saved" | "downloaded" | "cancelled";

type SaveHandle = {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
};

function pickerWindow(): Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveHandle>;
} {
  return window;
}

/** Share sheet on Android, save picker on desktop, then a normal download. */
export async function deliverFile(blob: Blob, filename: string): Promise<Delivered> {
  const type = blob.type || "application/octet-stream";
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const picker = pickerWindow().showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: filename.endsWith(".pdf") ? "PDF" : "Folio project", accept: { [type]: [filename.slice(filename.lastIndexOf("."))] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
