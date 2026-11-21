import ZAI from "z-ai-web-dev-sdk";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

export async function getZAI() {
  if (!zaiInstance) zaiInstance = await ZAI.create();
  return zaiInstance;
}

export async function llm(messages: ChatMsg[], maxTokens?: number): Promise<string> {
  const zai = await getZAI();
  const completion = await zai.chat.completions.create({
    messages: messages as never,
    thinking: { type: "disabled" },
  });
  const content = completion.choices[0]?.message?.content ?? "";
  if (!content.trim()) throw new Error("empty llm response");
  return content;
}

/** يستخرج المهمة والمخرجات من رد الموظف وينظف الرد المعروض */
export function parseTaskMarkers(text: string): {
  reply: string;
  task: string | null;
  result: string | null;
} {
  let reply = text;
  let task: string | null = null;
  let result: string | null = null;

  const taskMatch = text.match(/\[\[TASK\]\]([\s\S]*?)\[\[\/TASK\]\]/i);
  if (taskMatch) {
    task = taskMatch[1].trim().replace(/\s+/g, " ").slice(0, 120);
    reply = reply.replace(taskMatch[0], "");
  }
  const resultMatch = text.match(/\[\[RESULT\]\]([\s\S]*?)\[\[\/RESULT\]\]/i);
  if (resultMatch) {
    result = resultMatch[1].trim();
    reply = reply.replace(resultMatch[0], "");
  }
  // تنظيف أي ماركرات ناقصة
  reply = reply
    .replace(/\[\[TASK\]\]/gi, "")
    .replace(/\[\[\/TASK\]\]/gi, "")
    .replace(/\[\[RESULT\]\]/gi, "")
    .replace(/\[\[\/RESULT\]\]/gi, "")
    .trim();
  return { reply, task, result };
}

/** يستخرج أول JSON صالح (مصفوفة أو كائن) من نص الـ LLM حتى لو محاط بكلام */
export function extractJSON<T>(text: string): T | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = Math.min(
    ...[cleaned.indexOf("["), cleaned.indexOf("{")].filter((i) => i >= 0)
  );
  if (!isFinite(start)) return null;
  const endArr = cleaned.lastIndexOf("]");
  const endObj = cleaned.lastIndexOf("}");
  const end = Math.max(endArr, endObj);
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    try {
      return JSON.parse(cleaned.slice(start, end + 1).replace(/,\s*([\]}])/g, "$1")) as T;
    } catch {
      return null;
    }
  }
}

export async function addActivity(icon: string, text: string) {
  const { db } = await import("@/lib/db");
  await db.activity.create({ data: { icon, text } });
}
