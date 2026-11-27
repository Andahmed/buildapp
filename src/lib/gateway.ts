import { randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

// ============ بوابة LLM الموحدة — المفتاح والمعلومات ============
// فكرة الفيديو (FreeLLMAP): مفتاح موحد + Base URL واحد يقدر أي عمود خارجي
// (Claude Desktop / Claude Code / أي أداة OpenAI-compatible) يتوصل بيهم.
// المفتاح بيتولد مرة واحدة ويتخزن في AppMeta — ومفيش أي كلمة سر حساب هنا.

export const GATEWAY_TOKEN_KEY = "gateway_token";
export const OWNER_EMAIL_KEY = "owner_email";

// حساب المالك المسجل (للعرض في صفحة /gateway فقط — ليس بيانات دخول)
export const DEFAULT_OWNER_EMAIL = "ahmedrafeet93@gmail.com";

function newToken(): string {
  return `bapp-gw-${randomBytes(24).toString("base64url")}`;
}

/** مفتاح البوابة الحالي — بيتولد تلقائياً في أول استدعاء */
export async function getGatewayToken(): Promise<string> {
  try {
    const row = await db.appMeta.findUnique({ where: { key: GATEWAY_TOKEN_KEY } });
    if (row?.value) return row.value;
  } catch {
    // قاعدة البيانات مش متاحة — نرجع مفتاح مؤقت محلي (مش هيتخزن)
    return "bapp-gw-unavailable";
  }
  const token = newToken();
  try {
    await db.appMeta.upsert({
      where: { key: GATEWAY_TOKEN_KEY },
      update: {},
      create: { key: GATEWAY_TOKEN_KEY, value: token },
    });
  } catch {
    // تجاهل — المحاولة الجاية هتحاول تاني
  }
  return token;
}

/** تدوير المفتاح — المفتاح القديم بيبطل فوراً */
export async function rotateGatewayToken(): Promise<string> {
  const token = newToken();
  await db.appMeta.upsert({
    where: { key: GATEWAY_TOKEN_KEY },
    update: { value: token },
    create: { key: GATEWAY_TOKEN_KEY, value: token },
  });
  return token;
}

export async function getOwnerEmail(): Promise<string> {
  try {
    const row = await db.appMeta.findUnique({ where: { key: OWNER_EMAIL_KEY } });
    if (row?.value) return row.value;
    await db.appMeta.upsert({
      where: { key: OWNER_EMAIL_KEY },
      update: {},
      create: { key: OWNER_EMAIL_KEY, value: DEFAULT_OWNER_EMAIL },
    });
  } catch {
    // تجاهل
  }
  return DEFAULT_OWNER_EMAIL;
}

/** مقارنة زمن-ثابت عشان منسيبش timing attack يخمّن المفتاح حرف حرف */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** تحقق Authorization: Bearer <مفتاح البوابة> */
export async function verifyGatewayAuth(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  const expected = await getGatewayToken();
  return safeEqual(m[1].trim(), expected);
}
