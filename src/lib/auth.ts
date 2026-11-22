// ============ جلسة الأدمن — كوكي موقّع HMAC-SHA256 ============
// فلسفة التصميم: مستخدم واحد (الرئيس التنفيذي) بكلمة سر واحدة من البيئة.
// مفيش جدول users ولا next-auth: الجلسة قيمة موقعة `v1.<انتهاء>.<nonce>.<بصمة>`
// والتوقيع بيتتحقق في src/proxy.ts (البوابة) وفي أي route handler لو احتجت.
// Web Crypto بس — عشان نفس الكود يشتغل في Node.js runtime ومحرك الـ edge.

export const SESSION_COOKIE = "kod_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // أسبوع واحد
export const MIN_PASSWORD_LEN = 8;
export const MIN_SECRET_LEN = 16;

/** هل إعدادات الدخول موجودة؟ — فشل مغلق: بدون إعداد مفيش أي محتوى غير صفحة الدخول */
export function authConfigured(): boolean {
  const password = process.env.ADMIN_PASSWORD?.trim() ?? "";
  const secret = process.env.AUTH_SECRET?.trim() ?? "";
  return password.length > 0 && secret.length >= MIN_SECRET_LEN;
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(sig);
}

/** يبني قيمة الكوكي الموقعة — الصلاحية داخل القيمة نفسها فمفيش حالة على السيرفر */
export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomUUID();
  const payload = `v1.${exp}.${nonce}`;
  const sig = await hmacHex(payload, secret);
  return `${payload}.${sig}`;
}

/** يتحقق من البصمة والصلاحية — مقارنة ثابتة الزمن ضد timing oracle */
export async function verifySessionToken(
  token: string | undefined,
  secret: string
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const [, expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !nonce || !sig) return false;
  const expected = await hmacHex(`v1.${exp}.${nonce}`, secret);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}
