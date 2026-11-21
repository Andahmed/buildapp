// ============ كاش في الذاكرة (LRU بوقت صلاحية) ============
// بيلغي التكرار: نفس GET بترددات متكررة بيرجع من الذاكرة في أقل من 1ms
// بدل استعلامات Prisma متعددة في كل مرة.

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 300;

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key) as Entry<T> | undefined;
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return null;
  }
  // LRU: نحرك المفتاح لآخر الخريطة
  store.delete(key);
  store.set(key, e);
  return e.value;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  if (store.size >= MAX_ENTRIES) {
    // نحذف الأقدم (أول مفتاح في الخريطة)
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** يلف دالة GET مع كاش — لو فشلت الدالة ما بنخزنش حاجة */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  cacheSet(key, value, ttlMs);
  return value;
}

/** إبطال الكاش بعد أي كتابة — بنمسح المفاتيح اللي بتبدأ بالبريفكس ده */
export function invalidate(prefix: string) {
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** كاش مخصص لردود الـ LLM المتطابقة — بيمنع إعادة دفع نفس السؤال للمحرك خلال فترة قصيرة */
const LLM_TTL = 3 * 60 * 1000;
export function llmCacheKey(messages: unknown, opts?: unknown): string {
  return "llm:" + JSON.stringify([messages, opts ?? {}]).slice(0, 2000);
}
export function llmCacheGet(key: string): string | null {
  return cacheGet<string>(key);
}
export function llmCacheSet(key: string, text: string) {
  cacheSet(key, text, LLM_TTL);
}
