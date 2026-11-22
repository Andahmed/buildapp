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

/** بحث في الأجزاء — BM25-lite (فكرة LlamaIndex/sqlite-vec): ترجيح بالندرة IDF + تطبيع طول المستند
 *  بدل TF البسيط — الكلمة النادرة في السؤال (أرقام، أسماء، موديلات) بتاخد وزن أعلى من الكلمات الشائعة */
export async function searchChunks(query: string, limit = 3): Promise<string[]> {
  const words = tokenize(query);
  if (words.length === 0) return [];
  const unique = Array.from(new Set(words)).slice(0, 24);

  const candidates = await db.fileChunk.findMany({ take: 800, orderBy: { createdAt: "desc" } });
  if (candidates.length === 0) return [];

  // ثوابت BM25 القياسية (معايرة لملفات قصيرة ~700 حرف)
  const K1 = 1.4;
  const B = 0.72;
  const docs = candidates.map((c) => ({ text: c.text, norm: normalizeArabic(c.text) }));
  const N = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.norm.length, 0) / N || 1;

  // تكرار الكلمة داخل المستند الواحد + عدد المستندات اللي فيها الكلمة (DF)
  const freqIn = (doc: string, w: string) => doc.split(w).length - 1;
  const df = new Map<string, number>();
  for (const w of unique) {
    let n = 0;
    for (const d of docs) if (freqIn(d.norm, w) > 0) n++;
    df.set(w, n);
  }

  const scored: { text: string; score: number; matched: number }[] = [];
  for (const d of docs) {
    const lenNorm = K1 * (1 - B + B * (d.norm.length / avgLen));
    let score = 0;
    let matched = 0;
    for (const w of unique) {
      const f = freqIn(d.norm, w);
      if (f === 0) continue;
      matched++;
      const n = df.get(w) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); // IDF ناعم — مبيبوظش الكلمة الموجودة في الكل
      score += idf * ((f * (K1 + 1)) / (f + lenNorm));
    }
    // دقة الاسترجاع: الجزء لازم يطابق كلمتين مختلفتين على الأقل من السؤال
    // (سؤال "اعمل لي خطة نشر تطبيق ويب" مش لازم يجيب جزء مشروع توصيل أكل لمجرد كلمة "تطبيق")
    const minMatch = Math.min(2, unique.length);
    if (score > 0 && matched >= minMatch) scored.push({ text: d.text, score, matched });
  }
  if (scored.length === 0) return [];
  scored.sort((a, b) => b.score - a.score);
  // عتبة نسبية: اللي جايين لحد 35% من أعلى نتيجة — بيشيل القطع العائرة بكلمات عامة
  const cutoff = scored[0].score * 0.35;
  return scored.filter((s) => s.score >= cutoff).slice(0, limit).map((s) => s.text.slice(0, 900));
}

/** حذف أجزاء ملف — لما الملف يتحذف */
export async function deleteFileChunks(fileId: string) {
  try {
    await db.fileChunk.deleteMany({ where: { fileId } });
  } catch {
    // اختياري
  }
}
