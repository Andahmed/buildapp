import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// ============ طبقة عقول الذكاء الاصطناعي (BYOK) — v2 ============
// تحسينات الإصدار ده (كلها مقاسة):
// 1) تعدد المفاتيح: كل المفاتيح المفعلة بتتحاول بالدوران (round-robin) مع تبريد للمفاتيح الفاشلة
// 2) إعادة محاولة ذكية مع backoff للأخطاء المؤقتة (429/402/شبكة/تايم أوت)
// 3) Streaming حقيقي (SSE) للمحركات المتوافقة مع OpenAI — والمحركات بدون streaming بتتقسم إلى chunks
// 4) مهلات أقصر (45 ثانية بدل 90) عشان الانتقال للمحرك اللي بعده يبقى أسرع
// 5) مفيش ردود وهمية: الرد إما حقيقي أو خطأ واضح بالعربي

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface VisionPart {
  type: "text" | "image_url";
  text?: string;
  imageUrl?: string; // data URL
}

export interface VisionMessage {
  role: "system" | "user" | "assistant";
  content: string | VisionPart[];
}

export interface ProviderChoice {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  id: string | null;
  label?: string;
}

// FreeLLMAPI (tashfeenahmed/freellmapi): مجمّع ذاتي الاستضافة للطبقات المجانية —
// 87 مزود و736 عائلة موديلات و1313 endpoint مجاني (~10.1 مليار توكن/شهر) خلف /v1 متوافق مع OpenAI.
// التركيب بأمر واحد: curl -fsSL https://freellmapi.co/install.sh | bash
// وبعده أضف مفتاح بنوع custom و baseUrl=http://<host>:3001/v1
export const PROVIDER_PRESETS: Record<string, { label: string; baseUrl: string; model: string; docs: string }> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", docs: "platform.openai.com" },
  openrouter: { label: "OpenRouter (بي وصل لموديلات كتير وفيه مجانية :free)", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", docs: "openrouter.ai" },
  groq: { label: "Groq (سريع ومجاني)", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", docs: "console.groq.com" },
  cerebras: { label: "Cerebras (أسرع استدلال مجاني)", baseUrl: "https://api.cerebras.ai/v1", model: "llama-3.3-70b", docs: "cloud.cerebras.ai" },
  sambanova: { label: "SambaNova (طبقة مجانية)", baseUrl: "https://api.sambanova.ai/v1", model: "Meta-Llama-3.3-70B-Instruct", docs: "cloud.sambanova.ai" },
  cloudflare: { label: "Cloudflare Workers AI (مجاني بحدود)", baseUrl: "https://api.cloudflare.com/client/v4", model: "@cf/meta/llama-3.1-8b-instruct", docs: "developers.cloudflare.com/workers-ai" },
  huggingface: { label: "Hugging Face Router (موديلات مجانية)", baseUrl: "https://router.huggingface.co/v1", model: "meta-llama/Llama-3.3-70B-Instruct", docs: "huggingface.co/settings/tokens" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", docs: "platform.deepseek.com" },
  metamuse: { label: "Meta Muse (Spark — متوافق OpenAI، مليار توكن بكود دعوة)", baseUrl: "https://api.meta.ai/v1", model: "muse-spark-1.3", docs: "dev.meta.ai/docs/quickstart" },
  // AshnaAI (ashna.ai): مجمّع مُدار — endpoint واحد متوافق OpenAI قدام كتالوج كبير
  // (OpenAI gpt-6/5.x، Claude sonnet-5/opus-5، GLM 5.3، DeepSeek v4، Kimi K3، Grok 4.3، Gemini 3.x…).
  // بيتكلم 3 بروتوكولات: OpenAI Chat Completions + Anthropic Messages (Claude Code) + OpenAI Responses (Codex).
  // المفتاح مجاني ويُنشأ من app.ashna.ai/account/api — القاعدة: https://api.ashna.ai/v1/api
  ashna: { label: "AshnaAI (كتالوج كبير — OpenAI-Compatible، مفتاح مجاني من الحساب)", baseUrl: "https://api.ashna.ai/v1/api", model: "glm-5.3-flash", docs: "ashna.ai/api-docs" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-3.8-flash", docs: "aistudio.google.com" },
  anthropic: { label: "Anthropic Claude", baseUrl: "https://api.anthropic.com", model: "claude-3-5-haiku-latest", docs: "console.anthropic.com" },
  mistral: { label: "Mistral (طبقة مجانية كبيرة)", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", docs: "console.mistral.ai" },
  siliconflow: { label: "SiliconFlow (صيني — فيه مجانية)", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct", docs: "cloud.siliconflow.cn" },
  moonshot: { label: "Moonshot Kimi (صيني)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", docs: "platform.moonshot.cn" },
  zhipu: { label: "Zhipu GLM (صيني — فيه مجاني)", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", docs: "open.bigmodel.cn" },
  custom: { label: "مخصص (OpenAI-Compatible)", baseUrl: "", model: "", docs: "" },
};

export const FALLBACK_CHAIN_LABELS = [
  "مفاتيحك المتصلة بالدوران (لو شغالة)",
  "محرك مجاني مباشر بدون مفتاح (Pollinations)",
  "المحرك المدمج GLM",
];

function geminiErrorToArabic(status: number, body: string): string {
  if (status === 429 || body.includes("Rate limit exceeded") || body.includes("RESOURCE_EXHAUSTED")) {
    const retry = body.match(/retry in ([^."]+)/i);
    return `حصة اليوم من مفتاح Gemini خلصت${retry ? ` — الحصة بترجع بعد ${retry[1].trim()}` : ""}. الشغل بيكمّل تلقائياً على المحركات التانية، أو رقّي الطبقة من ai.dev/rate-limit.`;
  }
  if (body.includes("location is not supported") || body.includes("FAILED_PRECONDITION")) {
    return "جوجل بتمنع الطلبات الجاية من منطقة السيرفر السحابي دي. مفتاحك سليم: الشغل بيكمّل فوراً على المحركات التانية، ولو شغّلت المشروع من جهازك مفتاحك هيشتغل بانتظام.";
  }
  if (body.includes("API key not valid") || body.includes("API_KEY_INVALID")) {
    return "مفتاح Gemini مش صحيح — اتأكد إنه منسوخ كامل من AI Studio (يبدأ بـ AIza أو AQ.).";
  }
  if (body.includes("SERVICE_DISABLED")) {
    const url = body.match(/https:\/\/console\.developers\.google\.com[^"\s]+/);
    return `مشروع المفتاح محتاج تفعيل خدمة من جوجل (كليك واحد)${url ? `: فعّلها من ${url[0]}` : ""}.`;
  }
  if (status === 404) {
    return "اسم الموديل مش موجود — جرب gemini-3.8-flash أو gemini-flash-latest.";
  }
  return `خطأ ${status} من Gemini: ${body.slice(0, 160)}`;
}

// ============ دوران المفاتيح (Round-Robin) مع تبريد الفاشل ============

let rotationCounter = 0;
/** مفتاح فشل خلال آخر دقيقتين بيروح آخر الطابور بدل ما يوقف الدوران */
const keyCooldown = new Map<string, number>();
const COOLDOWN_MS = 2 * 60 * 1000;

// أخطاء الحصة اليومية (مثل Gemini الطبقة المجانية: "20 requests per day") — التبريد العادي دقيقتين
// هيسبب إعادة محاولة فاشلة كل دقيقتين طول اليوم؛ بنبرده لحد منتصف الليل بتوقيت القاهرة بدل كده
const DAILY_QUOTA_RE =
  /per day|daily quota|quota exceeded|exceeded your current quota|rate limit exceeded|FREE_LIMIT/i;

function coolKey(keyId: string | null, err?: unknown) {
  if (!keyId) return;
  let ms = COOLDOWN_MS;
  const body = (err as { body?: string })?.body ?? "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (DAILY_QUOTA_RE.test(`${msg} ${body}`)) {
    const now = new Date();
    const cairo = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
    const midnight = new Date(cairo);
    midnight.setHours(24, 0, 5, 0);
    ms = Math.min(Math.max(midnight.getTime() - cairo.getTime(), 60_000), 12 * 60 * 60 * 1000);
  }
  keyCooldown.set(keyId, Date.now() + ms);
}

export async function listEnabledKeys(): Promise<ProviderChoice[]> {
  let keys: { id: string; provider: string; model: string; apiKey: string; baseUrl: string; label: string; isDefault: boolean }[] = [];
  try {
    keys = await db.providerKey.findMany({
      where: { enabled: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  } catch {
    return [];
  }
  const choices: ProviderChoice[] = keys.map((k) => ({
    provider: k.provider,
    model: k.model || PROVIDER_PRESETS[k.provider]?.model || "",
    apiKey: decryptSecret(k.apiKey),
    baseUrl: k.baseUrl || PROVIDER_PRESETS[k.provider]?.baseUrl || "",
    id: k.id,
    label: k.label,
  }));
  // دوران: بنبدا من نقطة بتتحرك كل طلب
  rotationCounter = (rotationCounter + 1) % Math.max(choices.length, 1);
  const rotated = choices.length > 1 ? [...choices.slice(rotationCounter), ...choices.slice(0, rotationCounter)] : choices;
  // التبريد: اللي فشل قريب يروح آخر القايمة
  const now = Date.now();
  const hot = rotated.filter((c) => !c.id || (keyCooldown.get(c.id) ?? 0) < now);
  const cold = rotated.filter((c) => c.id && (keyCooldown.get(c.id) ?? 0) >= now);
  return [...hot, ...cold];
}

export async function pickProvider(preferred?: string): Promise<ProviderChoice | null> {
  const keys = await listEnabledKeys();
  if (keys.length === 0) return null;
  if (preferred) {
    const match = keys.find((k) => k.provider === preferred);
    if (match) return match;
  }
  return keys[0] ?? null;
}

// ============ المحركات المجانية المباشرة ============

// ---- بوابة حد المعدل المحلية لـ Pollinations (فكرة LiteLLM: تبريد قبل الضرب مش بعده) ----
// Pollinations المجاني: ~1 رد كل 45 ثانية لكل IP — اتقاست فعلياً (402 FREE_LIMIT بعد طلبين متتاليين).
// بدل ما نحرق طلب حقيقي + مهلة 45 ثانية ونكشف 402، بنسجل وقت آخر استعمال (نجاح أو رفض)،
// ولو المحاولة الجاية جاية في نافذة الـ IP بنرفض محلياً في 0ms → السلسلة بتنتقل فوراً للمحرك اللي بعده.
const POLLINATIONS_IP_WINDOW_MS = 46_000;
let pollinationsLastUseMs = 0;

function pollinationsGateEnter(): void {
  if (pollinationsLastUseMs > 0 && Date.now() - pollinationsLastUseMs < POLLINATIONS_IP_WINDOW_MS) {
    const waitSec = Math.max(1, Math.ceil((POLLINATIONS_IP_WINDOW_MS - (Date.now() - pollinationsLastUseMs)) / 1000));
    const err = new Error(
      `pollinations: حد المعدل المحلي للـ IP — فاضل ${waitSec}ث، بننتقل للمحرك اللي بعده فوراً بدون طلب حقيقي`
    ) as Error & { status?: number; skipRetry?: boolean };
    err.status = 429;
    err.skipRetry = true; // مش هنعيد المحاولة على نفس المحرك — الطاقة للمحرك اللي بعده
    throw err;
  }
}

/** أي رد HTTP من Pollinations (ناجح أو 402) معناه إن نافذة الـ IP اتستهلكت */
function pollinationsMarkConsumed(): void {
  pollinationsLastUseMs = Date.now();
}

// ---- Preflight ميزانية التوكنات (فكرة من Habr — مقالة Bitrix24 عن فشل LLM في الإنتاج) ----
// الفكرة: أغلب "الوقوف المفاجئ" في الإنتاج سببه طلبات أكبر من نافذة المحرك (input + output >
// الحد) — المحرك بيرد 400 أو بيهنج بدل ما يرد صريح. الحل الرخيص: فحص قبل الضرب — لو المدخلات
// + ميزانية الرد أكبر من نافذة المحرك الآمنة، نتخطاه محلياً في 0ms ونروح لللي بعده.
// التقدير محافظ عمداً (3 حروف/توكن — العربية أثقل من الإنجليزية): الرفض الخاطئ تكلفه انتقال
// للمحرك التالي، أما الإرسال الخاطئ فتكلفته مهلة 45ث + انهيار الرد.
const CHARS_PER_TOKEN_CONSERVATIVE = 3;

/** نوافذ إدخال آمنة لكل محرك (توكن) — تقديرات متحفظة أقل من المعلن رسمياً */
const ENGINE_INPUT_WINDOWS: Record<string, number> = {
  pollinations: 8_000,
  zai: 24_000,
  gemini: 80_000,
  anthropic: 32_000,
};
const DEFAULT_INPUT_WINDOW = 16_000;

function estimateMessagesTokens(messages: LLMMessage[]): number {
  let chars = 0;
  for (const m of messages) chars += typeof m.content === "string" ? m.content.length : 0;
  return Math.ceil(chars / CHARS_PER_TOKEN_CONSERVATIVE);
}

/** فحص ميزانية المحرك — يرجع true لو آمن يتبعت، false لو محسوم استباقياً */
export function preflightWindowOk(
  engineName: string,
  inputTokens: number,
  maxTokens: number
): { ok: boolean; window: number } {
  const window = ENGINE_INPUT_WINDOWS[engineName.toLowerCase()] ?? DEFAULT_INPUT_WINDOW;
  return { ok: inputTokens + maxTokens <= window, window };
}

/** تقدير التوكنات مكشوف للاختبارات (محافظ: 3 حروف/توكن) */
export function estimateTokensForTest(messages: LLMMessage[]): number {
  return estimateMessagesTokens(messages);
}

async function callPollinationsText(messages: LLMMessage[], maxTokens?: number): Promise<string> {
  pollinationsGateEnter();
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai-fast",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens ?? 2048,
    }),
    signal: AbortSignal.timeout(45000),
  });
  pollinationsMarkConsumed(); // أي رد HTTP — النافذة اتحرقت
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`pollinations error ${res.status}: ${body.slice(0, 200)}`) as Error & { status?: number; body?: string };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("pollinations رد فاضي");
  return text;
}

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;
async function getZAI() {
  if (!zaiInstance) zaiInstance = await ZAI.create();
  return zaiInstance;
}

async function callZAIText(messages: LLMMessage[], _maxTokens?: number): Promise<string> {
  const zai = await getZAI();
  const completion = await zai.chat.completions.create({
    messages: messages as never,
    thinking: { type: "disabled" },
  });
  const content = completion.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("المحرك المدمج رد فاضي");
  return content;
}

/** Gemini عبر الـ Interactions API — الواجهة الرسمية الجديدة اللي بتعدّي الحجب الجغرافي */
async function callGeminiInteractions(
  messages: LLMMessage[],
  choice: ProviderChoice,
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const url = `${choice.baseUrl.replace(/\/$/, "")}/v1beta/interactions`;
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: m.role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text: m.content }],
    }));
  if (turns.length === 0) throw new Error("مفيش رسايل تبعتها لـ Gemini");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": choice.apiKey,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify({
      model: choice.model,
      system_instruction: system || undefined,
      input: turns,
      generation_config: {
        max_output_tokens: opts?.maxTokens ?? 4096,
        thinking_level: "low",
      },
      store: false,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(geminiErrorToArabic(res.status, await res.text()));
  const json = await res.json();
  let text = String(json?.output_text ?? "");
  if (!text.trim() && Array.isArray(json?.steps)) {
    for (let i = json.steps.length - 1; i >= 0; i--) {
      const step = json.steps[i];
      const stepText =
        typeof step?.content === "string"
          ? step.content
          : Array.isArray(step?.content)
            ? step.content.map((c: { text?: string }) => c.text || "").join("")
            : "";
      if (String(stepText).trim()) {
        text = String(stepText);
        break;
      }
    }
  }
  if (!text.trim()) throw new Error("Gemini رد فاضي — جرب موديل تاني");
  return text;
}

async function callLLMWithChoice(
  messages: LLMMessage[],
  choice: ProviderChoice,
  opts?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  if (choice.provider === "gemini") {
    return callGeminiInteractions(messages, choice, opts);
  }

  if (choice.provider === "anthropic") {
    const res = await fetch(`${choice.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": choice.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: choice.model,
        max_tokens: opts?.maxTokens ?? 4096,
        system: messages.find((m) => m.role === "system")?.content ?? "",
        messages: messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const text = (json?.content ?? []).map((c: { text?: string }) => c.text || "").join("");
    if (!text.trim()) throw new Error("Anthropic رد فاضي");
    return text;
  }

  // OpenAI-Compatible: openai / openrouter / groq / cerebras / sambanova / cloudflare / huggingface / deepseek / mistral / siliconflow / moonshot / zhipu / custom
  if (!choice.baseUrl) throw new Error("المزود المخصص محتاج Base URL");
  const res = await fetch(`${choice.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${choice.apiKey}`,
    },
    body: JSON.stringify({
      model: choice.model,
      messages,
      max_tokens: opts?.maxTokens ?? 4096,
      temperature: opts?.temperature ?? 0.7,
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`${choice.provider} error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${choice.provider} رد فاضي`);
  return text;
}

// ============ Streaming — القلب الجديد ============

export interface StreamChunk {
  delta?: string;
  meta?: { provider: string; model: string };
}

/** streaming لمحرك OpenAI-Compatible (بيشتغل مع openai/groq/cerebras/sambanova/openrouter/mistral/pollinations...) */
async function* openaiStream(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number
): AsyncGenerator<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, Accept: "text/event-stream" },
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    const err = new Error(`stream error ${res.status}: ${t.slice(0, 160)}`) as Error & { status?: number; body?: string };
    err.status = res.status;
    err.body = t;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let emitted = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        // OpenAI-compatible: choices[0].delta.content — Anthropic: delta.text (content_block_delta)
        const delta: string =
          json?.choices?.[0]?.delta?.content ??
          json?.choices?.[0]?.message?.content ??
          (json?.type === "content_block_delta" ? json?.delta?.text ?? "" : "") ??
          "";
        if (delta) {
          emitted = true;
          yield delta;
        }
      } catch {
        // سطر ناقص — نتجاهله
      }
    }
  }
  if (!emitted) throw new Error("الرد الفوري كان فاضي");
}

/** تقسيم نص كامل إلى chunks متقاربة — للمحركات اللي مفيهاش streaming حقيقي */
async function* chunkText(text: string, size = 24, delayMs = 18): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += size) {
    yield text.slice(i, i + size);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}

interface Attempt {
  name: string;
  model: string;
  keyId: string | null;
  canStream: boolean;
  /** يرجع النص الكامل — للطريق غير الفوري */
  run: () => Promise<string>;
  /** streaming إن وُجد — وإلا بيرجع null وبنستخدم run مع تقسيم */
  stream?: () => AsyncGenerator<string>;
}

function buildAttempts(
  messages: LLMMessage[],
  choices: ProviderChoice[],
  opts?: { maxTokens?: number; temperature?: number }
): Attempt[] {
  const attempts: Attempt[] = [];
  const budget = opts?.maxTokens ?? 4096;
  const inputTokens = estimateMessagesTokens(messages);
  for (const choice of choices) {
    // Preflight: طلب أكبر من نافذة المحرك = محسوم استباقياً — نتخطاه بدون طلب حقيقي (فكرة Habr/Bitrix24)
    const pf = preflightWindowOk(choice.provider, inputTokens, budget);
    if (!pf.ok) {
      console.log(
        `[preflight] ${choice.provider}: المدخلات ~${Math.ceil(inputTokens / 1000)}k توكن + ${budget} رد أكبر من النافذة الآمنة ${pf.window} — تخطي محلي فوري بدون ضرب المحرك`
      );
      continue;
    }
    const base: Attempt = {
      name: choice.provider,
      model: choice.model,
      keyId: choice.id,
      canStream: false,
      run: () => callLLMWithChoice(messages, choice, opts),
    };
    if (choice.provider === "gemini") {
      attempts.push(base); // Interactions API — بنقسم الناتج chunks (نفس السرعة)
    } else if (choice.provider === "anthropic") {
      attempts.push({
        ...base,
        canStream: true,
        stream: () =>
          openaiStream(
            `${choice.baseUrl.replace(/\/$/, "")}/v1/messages`,
            { "Content-Type": "application/json", "x-api-key": choice.apiKey, "anthropic-version": "2023-06-01" },
            {
              model: choice.model,
              max_tokens: opts?.maxTokens ?? 4096,
              system: messages.find((m) => m.role === "system")?.content ?? "",
              messages: messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
              stream: true,
            },
            45000
          ),
      });
    } else {
      // OpenAI-compatible — streaming حقيقي
      attempts.push({
        ...base,
        canStream: true,
        stream: () =>
          openaiStream(
            `${choice.baseUrl.replace(/\/$/, "")}/chat/completions`,
            { "Content-Type": "application/json", Authorization: `Bearer ${choice.apiKey}` },
            { model: choice.model, messages, max_tokens: opts?.maxTokens ?? 4096, temperature: opts?.temperature ?? 0.7 },
            45000
          ),
      });
    }
  }
  return attempts;
}

function buildFreeAttempts(messages: LLMMessage[], opts?: { maxTokens?: number }): Attempt[] {
  const budget = opts?.maxTokens ?? 2048;
  const inputTokens = estimateMessagesTokens(messages);
  const attempts: Attempt[] = [];
  // Preflight لكل محرك مجاني — نفس فكرة بوابة حد المعدل: الرفض المحلي أرخص من الوقوف
  for (const { engine, win } of [
    { engine: "pollinations", win: ENGINE_INPUT_WINDOWS.pollinations },
    { engine: "zai", win: ENGINE_INPUT_WINDOWS.zai },
  ] as const) {
    if (inputTokens + budget > win) {
      console.log(
        `[preflight] ${engine}: المدخلات ~${Math.ceil(inputTokens / 1000)}k توكن + ${budget} رد أكبر من النافذة الآمنة ${win} — تخطي محلي فوري`
      );
    }
  }
  // الترتيب: المحرك المدمج GLM الأول (أقوى والتزاماً بالتعليمات وبدون حد معدل)،
  // وPollinations احتياطي بعده — كان الأول وبيسبب اختراق وخلط لهجات في برومبتات الشركة
  if (inputTokens + budget <= ENGINE_INPUT_WINDOWS.zai) {
    attempts.push({
      name: "zai",
      model: "GLM مدمج",
      keyId: null,
      canStream: false,
      run: () => callZAIText(messages, opts?.maxTokens),
    });
  }
  if (inputTokens + budget <= ENGINE_INPUT_WINDOWS.pollinations) {
    attempts.push({
      name: "pollinations",
      model: "openai-fast",
      keyId: null,
      canStream: true,
      run: () => callPollinationsText(messages, opts?.maxTokens),
      stream: async function* () {
        pollinationsGateEnter(); // لو حد المعدل المحلي شغال — رفض فوري بدون فتح طلب
        let marked = false;
        for await (const d of openaiStream(
          "https://text.pollinations.ai/openai",
          { "Content-Type": "application/json" },
          { model: "openai-fast", messages: messages.map((m) => ({ role: m.role, content: m.content })), max_tokens: opts?.maxTokens ?? 2048 },
          45000
        )) {
          if (!marked) {
            marked = true;
            pollinationsMarkConsumed(); // أول chunk = الطلب اتقبل ووصل — النافذة اتحرقت
          }
          yield d;
        }
      },
    });
  }
  return attempts;
}

function isRetryable(err: unknown): boolean {
  if ((err as { skipRetry?: boolean })?.skipRetry) return false; // أخطاء البوابة المحلية — متعيدش، انتقل
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status = (err as { status?: number })?.status;
  if (status && [408, 409, 425, 429, 500, 502, 503, 504, 402].includes(status)) return true;
  return /timeout|econnreset|econnrefused|fetch failed|network|socket|rate limit|free_limit|too_many_requests|overloaded/.test(msg);
}

function retryDelayMs(err: unknown, attemptNo: number): number | null {
  // لو المحرك قال "استنى X ثانية" — نلتزم بحد أقصى 25 ثانية، لو أكتر بننتقل للمحرك اللي بعده
  const body = (err as { body?: string })?.body ?? (err instanceof Error ? err.message : "");
  const m = body.match(/retry (?:after|in)\s*([\d.]+)\s*(s|sec|second)?/i);
  if (m) {
    const secs = parseFloat(m[1]);
    if (!Number.isNaN(secs)) {
      if (secs > 25) return null; // استنى أطول من كده؟ مش مستنيين — المحرك اللي بعده
      return secs * 1000 + 500;
    }
  }
  const mins = body.match(/retry in\s*([\d.]+)\s*(m|min)/i);
  if (mins) return null; // دقايق؟ بننتقل فوراً
  return [0, 1200, 3000][Math.min(attemptNo, 2)]; // backoff تصاعدي
}

async function markKeyStatus(id: string | null, status: "ok" | "failed") {
  if (!id) return;
  try {
    await db.providerKey.update({ where: { id }, data: { lastStatus: status } });
  } catch {
    // تجاهل
  }
}

export interface LLMResult {
  text: string;
  provider: string;
  model: string;
}

/**
 * Streaming موحّد لكل المحركات — بيطلع meta مرة واحدة وبعدها deltas.
 * بيحاول محرك محرك مع إعادة محاولة داخلية، ولو كلهم فشلوا بيطلع خطأ صادق.
 */
export async function* streamLLM(
  messages: LLMMessage[],
  opts?: { preferred?: string; maxTokens?: number; temperature?: number; preferFree?: boolean }
): AsyncGenerator<StreamChunk> {
  const choices = await listEnabledKeys();
  let ordered = choices;
  if (opts?.preferred) {
    const p = choices.find((c) => c.provider === opts.preferred);
    if (p) ordered = [p, ...choices.filter((c) => c !== p)];
  }
  const keyAttempts = buildAttempts(messages, ordered, opts);
  const freeAttempts = buildFreeAttempts(messages, opts);
  const attempts = opts?.preferFree ? [...freeAttempts, ...keyAttempts] : [...keyAttempts, ...freeAttempts];

  const errors: string[] = [];
  for (const attempt of attempts) {
    for (let tryNo = 0; tryNo < 3; tryNo++) {
      try {
        let emittedMeta = false;
        if (attempt.stream) {
          for await (const delta of attempt.stream()) {
            if (!emittedMeta) {
              emittedMeta = true;
              if (attempt.keyId) void markKeyStatus(attempt.keyId, "ok");
              yield { meta: { provider: attempt.name, model: attempt.model } };
            }
            yield { delta };
          }
        } else {
          const text = await attempt.run();
          if (!text.trim()) throw new Error("رد فاضي");
          if (attempt.keyId) void markKeyStatus(attempt.keyId, "ok");
          yield { meta: { provider: attempt.name, model: attempt.model } };
          for await (const delta of chunkText(text)) yield { delta };
        }
        return; // نجح — خلاص
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt.keyId) coolKey(attempt.keyId, err);
        if (!isRetryable(err) || tryNo === 2) {
          errors.push(`${attempt.name}: ${msg.slice(0, 140)}`);
          console.error(`[providers] ${attempt.name} فشل نهائي → ${msg.slice(0, 180)}`);
          void markKeyStatus(attempt.keyId, "failed");
          break; // المحرك اللي بعده
        }
        const delay = retryDelayMs(err, tryNo);
        if (delay === null) {
          errors.push(`${attempt.name}: ${msg.slice(0, 140)}`);
          break;
        }
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(`كل المحركات فشلت — ${errors.join(" | ").slice(0, 600)}`);
}

/** الطريق غير الفوري — مبنية فوق streamLLM (نفس السلسلة والمنطق بالظبط) */
export async function callLLM(
  messages: LLMMessage[],
  opts?: { preferred?: string; maxTokens?: number; temperature?: number; preferFree?: boolean }
): Promise<LLMResult> {
  let text = "";
  let provider = "unknown";
  let model = "";
  for await (const chunk of streamLLM(messages, opts)) {
    if (chunk.meta) {
      provider = chunk.meta.provider;
      model = chunk.meta.model;
    }
    if (chunk.delta) text += chunk.delta;
  }
  if (!text.trim()) throw new Error(`كل المحركات فشلت — الرد النهائي فاضي`);
  return { text, provider, model };
}

/** الاسم المختصر للعقل اللي هيشتغل — للعرض في الواجهة */
export async function describeActiveBrain(): Promise<{ brain: string; provider: string; chain: string[] }> {
  const keys = await listEnabledKeys();
  if (keys.length > 0) {
    const choice = keys[0];
    const label =
      choice.provider === "gemini"
        ? `Google Gemini (${choice.label ?? "مفتاحك"})`
        : PROVIDER_PRESETS[choice.provider]?.label ?? choice.provider;
    const extra =
      keys.length > 1 ? ` + ${keys.length - 1} مفتاح تاني بالدوران` : "";
    if (choice.id) {
      try {
        const rec = await db.providerKey.findUnique({ where: { id: choice.id }, select: { lastStatus: true } });
        if (rec?.lastStatus === "failed") {
          return {
            brain: `المحرك المجاني (مفتاحك ${label} فشل آخر فحص)`,
            provider: "pollinations",
            chain: [`${label}: فشل آخر فحص — جرب اختبار المفتاح من تبويب المفاتيح`, ...FALLBACK_CHAIN_LABELS.slice(1)],
          };
        }
      } catch {
        // تجاهل
      }
    }
    return {
      brain: label + extra,
      provider: choice.provider,
      chain: [`مفاتيحك: ${label}${extra}`, ...FALLBACK_CHAIN_LABELS.slice(1)],
    };
  }
  return { brain: FALLBACK_CHAIN_LABELS[1], provider: "pollinations", chain: FALLBACK_CHAIN_LABELS };
}

// ============ الرؤية (تحليل الصور) ============

async function callZAIVision(prompt: string, imageDataUrl: string): Promise<string | null> {
  try {
    const zai = await getZAI();
    const candidates = ["glm-4.6v", "glm-4.5v", "glm-4v-plus", "glm-4v"];
    for (const model of candidates) {
      try {
        const completion = await zai.chat.completions.createVision({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
        });
        const content = completion?.choices?.[0]?.message?.content ?? "";
        if (content.trim()) return content;
      } catch {
        continue;
      }
    }
  } catch {
    // تجاهل
  }
  return null;
}

export async function callVision(
  prompt: string,
  imageDataUrl: string,
  opts?: { preferred?: string }
): Promise<string | null> {
  const choice = await pickProvider(opts?.preferred);

  // رؤية Gemini في الـ Interactions API محتاجة رفع الملف على Files API أولاً —
  // ده هيستنزف الحصة المحدودة، فبنستخدم المحرك المدمج للمفاتيح بتاعت جيميناي
  if (choice && choice.provider !== "gemini") {
    try {
      let text = "";
      if (choice.provider === "anthropic") {
        const [, base64] = imageDataUrl.split(",");
        const res = await fetch(`${choice.baseUrl.replace(/\/$/, "")}/v1/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": choice.apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: choice.model,
            max_tokens: 2048,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
                  { type: "text", text: prompt },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (res.ok) {
          const json = await res.json();
          text = (json?.content ?? []).map((c: { text?: string }) => c.text || "").join("");
        }
      } else {
        const res = await fetch(`${choice.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${choice.apiKey}` },
          body: JSON.stringify({
            model: choice.model,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: imageDataUrl } },
                ],
              },
            ],
            max_tokens: 2048,
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (res.ok) {
          const json = await res.json();
          text = json?.choices?.[0]?.message?.content ?? "";
        }
      }
      if (text.trim()) return text;
    } catch (err) {
      console.error(`[providers] ${choice.provider} vision فشل → ${err instanceof Error ? err.message.slice(0, 160) : err}`);
    }
  }

  return callZAIVision(prompt, imageDataUrl);
}

// ============ فحص مفتاح ============

export async function testProviderKey(
  provider: string,
  apiKey: string,
  baseUrl: string,
  model: string
): Promise<{ ok: boolean; message: string }> {
  const preset = PROVIDER_PRESETS[provider];
  const choice: ProviderChoice = {
    provider,
    model: model || preset?.model || "",
    apiKey,
    baseUrl: baseUrl || preset?.baseUrl || "",
    id: null,
  };
  if (provider === "custom" && !choice.baseUrl) {
    return { ok: false, message: "المزود المخصص محتاج Base URL زي https://.../v1" };
  }
  try {
    const text = await callLLMWithChoice([{ role: "user", content: "رد بكلمة واحدة: تمام" }], choice, { maxTokens: 2000 });
    if (!text.trim()) return { ok: false, message: "المفتاح اشتغل بس الرد فاضي — جرب موديل تاني" };
    return { ok: true, message: `المفتاح شغال والرد وصل فعلاً عبر ${choice.model || provider}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg.slice(0, 400) };
  }
}
