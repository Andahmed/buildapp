import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// ============ تشفير مفاتيح الـ API أثناء التخزين (AES-256-GCM) ============
// مفيش أي مفتاح بيتخزن نص صريح في قاعدة البيانات — كل المفاتيح مشفرة
// بمفتاح تشفير منفصل موجود على السيرفر بس (متغير بيئة أو ملف db/.secret.key).

const SECRET_ENV = process.env.APP_SECRET?.trim();
const SECRET_FILE = path.join(process.cwd(), "db", ".secret.key");

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  let material: string;
  if (SECRET_ENV && SECRET_ENV.length >= 16) {
    material = SECRET_ENV;
  } else {
    try {
      if (existsSync(SECRET_FILE)) {
        material = readFileSync(SECRET_FILE, "utf-8").trim();
        if (material.length < 32) throw new Error("secret file too short");
      } else {
        material = randomBytes(48).toString("hex");
        writeFileSync(SECRET_FILE, material, { mode: 0o600 });
      }
    } catch {
      // آخر احتياطي: نشتق من ثابت الجهاز — أحسن من نص صريح، بس المستخدم يفضل يحدد APP_SECRET
      material = "cod-dhaki-fallback-" + process.cwd();
    }
  }
  cachedKey = scryptSync(material, "cod-dhaki-keys-salt", 32);
  return cachedKey;
}

const PREFIX = "enc:v1:";

/** يشفر نص — الناتج بيطول بحقل enc:v1: معروف */
export function encryptSecret(plain: string): string {
  if (!plain || plain.startsWith(PREFIX)) return plain;
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
    const enc = Buffer.concat([cipher.update(plain, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
  } catch {
    return plain; // نرجع النص لو التشفير فشل — أحسن من كسر التطبيق
  }
}

/** يفك التشفير — وبيتعامل مع المفاتيح القديمة غير المشفرة (ترحيل تلقائي) */
export function decryptSecret(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // مفتاح قديم نص صريح — بنرجعه زي ما هو
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
  } catch {
    return ""; // مشفرة بمفتاح تاني ضايع — بنرجع فاضي بدل ما نكسر
  }
}

export function isEncrypted(stored: string): boolean {
  return stored?.startsWith(PREFIX);
}
