/**
 * Local .phext file actions: File System Access where the browser offers it,
 * the same `<input type="file">` / download fallbacks the JSON file actions
 * use (`src/demo/browser-json-file.ts`). These run only when the user picks
 * Open Phext… / Export Phext… — never in the background, never on typing.
 */
import type { BrowserFileHandle } from "../demo/browser-json-file";

export interface PhextFile {
  filename: string;
  text: string;
  handle?: BrowserFileHandle;
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<BrowserFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<BrowserFileHandle>;
};

const phextTypes = [
  { description: "Phext files", accept: { "text/plain": [".phext"] } },
];

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function phextFilename(value: string, fallback: string): string {
  const trimmed = value.trim() || fallback;
  return /\.phext$/i.test(trimmed) ? trimmed : `${trimmed}.phext`;
}

function inputFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".phext,text/plain";
    input.hidden = true;
    const finish = (file?: File) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener("change", () => finish(input.files?.[0]), { once: true });
    input.addEventListener("cancel", () => finish(), { once: true });
    document.body.append(input);
    input.click();
  });
}

/** Ask the user for a .phext file and read it as text; undefined on cancel. */
export async function openPhextFile(): Promise<PhextFile | undefined> {
  const picker = window as FilePickerWindow;
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({
        multiple: false,
        types: phextTypes,
        excludeAcceptAllOption: false,
      });
      if (!handle) return undefined;
      const file = await handle.getFile();
      return { filename: file.name || handle.name, text: await file.text(), handle };
    } catch (error) {
      if (cancelled(error)) return undefined;
      throw error;
    }
  }
  const file = await inputFile();
  return file ? { filename: file.name, text: await file.text() } : undefined;
}

async function writeHandle(handle: BrowserFileHandle, contents: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(contents);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch(() => undefined);
    throw error;
  }
}

function download(contents: string, suggestedName: string): void {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "text/plain;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

/**
 * Save phext text through the save picker, or download it where no picker
 * exists. Export only: this never acknowledges a Mutable JSON Save or changes
 * the Document's binding. Returns the chosen filename, undefined on cancel.
 */
export async function savePhextFile(
  text: string,
  suggestedName: string,
): Promise<{ filename: string } | undefined> {
  const filename = phextFilename(suggestedName, "Document.phext");
  const picker = window as FilePickerWindow;
  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName: filename,
        types: phextTypes,
        excludeAcceptAllOption: false,
      });
      await writeHandle(handle, text);
      return { filename: phextFilename(handle.name, filename) };
    } catch (error) {
      if (cancelled(error)) return undefined;
      throw error;
    }
  }
  download(text, filename);
  return { filename };
}
