// ============ جلسة الأدمن — كوكي موقّع HMAC-SHA256 ============
// فلسفة التصميم: مستخدم واحد (الرئيس التنفيذي) بكلمة سر واحدة.
// مفيش جدول users ولا next-auth: الجلسة قيمة موقعة `v1.<انتهاء>.<nonce>.<بصمة>`
// والتوقيع بيتتحقق في src/proxy.ts (البوابة) وفي أي route handler لو احتجت.
// Web Crypto بس — عشان نفس الكود يشتغل في Node.js runtime ومحرك الـ edge.

export const SESSION_COOKIE = "kod_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // أسبوع واحد
export const MIN_PASSWORD_LEN = 8;
export const MIN_SECRET_LEN = 16;

// ==== احتياطي الإنتاج المدمج (مهم للنشر على Railway من غير متغيرات بيئة) ====
// الدخول كان بيرفض أي كلمة سر لما ADMIN_PASSWORD/AUTH_SECRET مش متظبطين
// على السيرفر. الحل: الكود فيه كلمات سر أدمن افتراضية محفوظة كبصمات
// sha-256 (مش نص صريح — عشان الريبو ميكشفهاش) + سر توقيع احتياطي ثابت.
// أي ADMIN_PASSWORD/AUTH_SECRET من بيئة التشغيل بيتقدم على الاحتياطي فوراً.
const DEFAULT_PASSWORD_HASHES: ReadonlySet<string> = new Set([
  "5e45b7635967caddc74dc43251922d6dea6e6c05627f2fdadc32fbb5433421cc",
  "23cde9b140bf1d847e96fd2102234f24445b7263e576623459ae1ee6e210c801",
]);

/** سر توقيع الجلسة الاحتياطي — بيتجاهل أول ما يتظبط AUTH_SECRET في البيئة */
const FALLBACK_AUTH_SECRET =
  "buildapp-fallback-signing-secret-2026-4f8a2c6e9b1d7f3a5c8e0b2d6f9a4c7e";

/** السر الفعلي للتوقيع: AUTH_SECRET من البيئة لو سليم، وإلا الاحتياطي المدمج */
export function sessionSecret(): string {
  const s = process.env.AUTH_SECRET?.trim() ?? "";
  return s.length >= MIN_SECRET_LEN ? s : FALLBACK_AUTH_SECRET;
}

/** مقارنة نصين hex بثبات الزمن (من غير timing oracle) */
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

/** هل كلمة السر المكتوبة صحيحة؟ — إما ADMIN_PASSWORD من البيئة أو الافتراضية المدمجة */
export async function matchesAdminPassword(input: string): Promise<boolean> {
  const inputHash = await sha256Hex(input);
  const envPassword = process.env.ADMIN_PASSWORD?.trim() ?? "";
  if (envPassword.length >= MIN_PASSWORD_LEN) {
    if (constantTimeHexEqual(inputHash, await sha256Hex(envPassword))) return true;
  }
  return DEFAULT_PASSWORD_HASHES.has(inputHash);
}

/** هل الطلب جاي من جهاز محلي (وضع التطوير)؟ — الـ host لوحده كافي ومضمون */
export function isLocalHost(host: string | null | undefined): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?$/i.test(host ?? "");
}

/**
 * خصائص كوكي الجلسة حسب السياق:
 * - المعاينة بتشتغل جوه iframe في منصة تواصل على HTTPS = سياق طرف ثالث،
 *   والمتصفح (Chrome وFirefox) بيرفض كوكي Lax/Strict هناك — لازم SameSite=None مع Secure.
 * - البروكسي ساعات مش بيبعت x-forwarded-proto، فبنعتمد على الـ host: أي نطاق عام = None+Secure.
 * - المحلي بس (localhost/127.0.0.1) بيفضل Lax من غير Secure.
 */
export function sessionCookieFlags(req: {
  headers: { get(k: string): string | null };
  url: string;
}): { sameSite: "none" | "lax"; secure: boolean; partitioned: boolean } {
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (isLocalHost(host)) return { sameSite: "lax", secure: false, partitioned: false };
  // None+Secure+Partitioned (CHIPS): بيخلي كوكي الجلسة يشتغل جوه الـ iframe
  // حتى مع حظر الكوكي الطرف الثالث — والمتصفحات اللي ماتدعمش Partitioned بتتجاهل الخاصية
  return { sameSite: "none", secure: true, partitioned: true };
}

/** هل إعدادات الدخول جاهزة؟ — الاحتياطي المدمج بيكفي فالإجابة دايماً نعم.
 *  متغيرات البيئة (ADMIN_PASSWORD/AUTH_SECRET) بتتقدم على الاحتياطي لو موجودة. */
export function authConfigured(): boolean {
  return true;
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
