import { mkdir, writeFile, readFile, stat } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// كل الملفات بتتخزن على القرص في db/uploads — وبياناتها في جدول WorkspaceFile
export const UPLOAD_DIR = path.join(process.cwd(), "db", "uploads");

export async function ensureUploadDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

export interface SavedFileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  diskName: string;
}

export async function saveBufferToDisk(
  data: Buffer,
  originalName: string,
  mime: string
): Promise<SavedFileMeta> {
  await ensureUploadDir();
  const id = randomUUID();
  const ext = path.extname(originalName || "").slice(0, 12).replace(/[^.\w]/g, "");
  const diskName = `${id}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, diskName), data);
  return { id, name: (originalName || "file").slice(0, 120), mime: mime || "application/octet-stream", size: data.length, diskName };
}

export async function readSavedFile(diskName: string): Promise<Buffer | null> {
  try {
    const safe = path.basename(diskName); // منع الـ path traversal
    const buf = await readFile(path.join(UPLOAD_DIR, safe));
    return buf;
  } catch {
    return null;
  }
}

export async function fileExistsOnDisk(diskName: string): Promise<boolean> {
  try {
    const safe = path.basename(diskName);
    await stat(path.join(UPLOAD_DIR, safe));
    return true;
  } catch {
    return false;
  }
}

export function guessMimeFromName(name: string): string {
  const ext = (path.extname(name) || "").toLowerCase();
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".py": "text/x-python",
    ".js": "text/javascript",
    ".ts": "text/typescript",
    ".html": "text/html",
    ".css": "text/css",
    ".zip": "application/zip",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".mp4": "video/mp4",
  };
  return map[ext] || "application/octet-stream";
}
