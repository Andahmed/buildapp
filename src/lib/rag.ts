import { db } from "@/lib/db";
import { readSavedFile } from "@/lib/files";

// ============ RAG خفيف من الملفات المرفوعة ============
// كل ملف نصي بيتقسم لأجزاء (~700 حرف) بتتخزن في FileChunk،
// والبحث بيكون بترجيح TF عالب كلمات السؤال — بدون موديل embeddings خارجي.

const CHUNK_SIZE = 700;
const CHUNK_OVERLAP = 90;

const TEXT_MIMES = [
  "text/", "application/json", "application/javascript", "application/typescript",
  "application/xml", "application/x-yaml", "application/csv",
];

export function isTextLike(mime: string, name: string): boolean {
  if (TEXT_MIMES.some((t) => mime.startsWith(t))) return true;
  if (mime.startsWith("image/") || mime.startsWith("audio/") || mime.startsWith("video/")) return false;
  return /\.(md|txt|csv|json|py|js|ts|tsx|jsx|html|css|xml|yaml|yml|sh|sql|env|log|toml|ini)$/i.test(name || "");
}

/** تقسيم ملف مرفوع لأجزاء مفهرسة — بيتندهي بعد الرفع مباشرة */
export async function ingestFile(fileId: string, diskName: string, mime: string, name: string): Promise<number> {
  if (!isTextLike(mime, name)) return 0;
  const buf = await readSavedFile(diskName);
  if (!buf) return 0;
  const raw = buf.toString("utf-8").replace(/\r/g, "");
  if (raw.trim().length < 40) return 0;

  // تنظيف خفيف: مسافات متكررة
  const text = raw.replace(/[ \t]+/g, " ").trim();
  await db.fileChunk.deleteMany({ where: { fileId } });

  const chunks: { fileId: string; idx: number; text: string }[] = [];
  for (let i = 0, idx = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP, idx++) {
    const piece = text.slice(i, i + CHUNK_SIZE).trim();
    if (piece.length > 30) chunks.push({ fileId, idx, text: piece });
    if (chunks.length >= 60) break; // حد أقصى للملف الواحد — 60 جزء
  }
  if (chunks.length === 0) return 0;
  await db.fileChunk.createMany({ data: chunks });
  return chunks.length;
}

/** تطبيع النص العربي: إزالة التشكيل وتوحيد الهمزات عشان البحث يلاقي الأكتر */
function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u065F\u0670]/g, "") // تشكيل
    .replace(/[أإآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase();
}

function tokenize(q: string): string[] {
  return normalizeArabic(q)
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((w) => w.length >= 2);
}

/** بحث في الأجزاء — بيرجع أحسن 3 أجزاء ليها علاقة فعلياً بالسؤال */
export async function searchChunks(query: string, limit = 3): Promise<string[]> {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const unique = Array.from(new Set(words)).slice(0, 24);

  const candidates = await db.fileChunk.findMany({ take: 800, orderBy: { createdAt: "desc" } });
  if (candidates.length === 0) return [];

  const scored: { text: string; score: number }[] = [];
  for (const c of candidates) {
    const norm = normalizeArabic(c.text);
    let score = 0;
    for (const w of unique) {
      const count = norm.split(w).length - 1;
      if (count > 0) score += 1 + Math.min(count, 5) * 0.2;
    }
    if (score >= Math.max(2, Math.min(unique.length, 3)) * 0.8) {
      scored.push({ text: c.text, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.text.slice(0, 900));
}

/** حذف أجزاء ملف — لما الملف يتحذف */
export async function deleteFileChunks(fileId: string) {
  try {
    await db.fileChunk.deleteMany({ where: { fileId } });
  } catch {
    // اختياري
  }
}
