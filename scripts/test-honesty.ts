/**
 * اختبار الصدق واللهجة في الاجتماع الجماعي — قبل/بعد إصلاح البرومبتات
 * - 5 أسئلة × محركين (Pollinations المجاني + GLM المدمج) على نفس برومبت الإنتاج (src/lib/team-prompt.ts)
 * - فحوص آلية: عدم اختلاق بيانات الشركة، اللهجة المصرية الخالصة، طول الرد، الحروف الصينية
 * - التشغيل: bun run scripts/test-honesty.ts قبل|بعد
 * - الأدلة بتنحفظ في tool-results/honesty-<المرحلة>-<المحرك>.txt
 */
import ZAI from "z-ai-web-dev-sdk";
import { db } from "../src/lib/db";
import { buildTeamPrompt } from "../src/lib/team-prompt";

const PHASE = process.argv[2] ?? "قبل";
const QUESTIONS: { id: string; q: string; expectNoData: boolean; expectCount?: number; expectCode?: boolean }[] = [
  { id: "مشروعات", q: "إيه المشروعات الموجودة؟", expectNoData: true },
  { id: "عدد الموظفين", q: "كم موظف عندنا في الشركة؟", expectNoData: false, expectCount: 19 },
  { id: "تلخيص", q: "لخصلي إيه اللي حصل في آخر اجتماع", expectNoData: true },
  { id: "كود", q: "اكتبلي دالة جافاسكريبت صغيرة تحسب سن الموظف من سنة ميلاده", expectNoData: false, expectCode: true },
  { id: "بلا إجابة", q: "إيه اسم العميل اللي دفع آخر فاتورة؟", expectNoData: true },
];

const REFUSAL = ["مفيش", "ما فيش", "مش موجود", "مش عندي", "لا يوجد", "مش مسجل", "مش متسجل", "مفيش عندي", "مفيش عندنا", "مش متوفر", "ماشي معاك"];
const SHAMI = /\b(بدي|شو|ليش|هلق|هلاق|منيح|عندكن|هاي|نحنا|أنتو)\b/;
const FUS7A = /\b(سوف|لذا|بموجب|إذ أن|حيث إن|وذلك|نرجو التكرم|يُعتبر)\b/;
const CHINESE = /[\u4e00-\u9fff]/;

interface Reply { name: string; reply: string }

function parseReplies(raw: string): Reply[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(raw.slice(start, end + 1));
      if (Array.isArray(arr)) return arr.slice(0, 3).filter((r: Reply) => r?.name && r?.reply);
    } catch { /* هنعامل النص كرد واحد */ }
  }
  return raw.trim() ? [{ name: "؟ (مش JSON)", reply: raw.trim().slice(0, 800) }] : [];
}

async function enginePollinations(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch("https://text.pollinations.ai/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai-fast", messages, max_tokens: 2200 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function engineZai(messages: { role: string; content: string }[]): Promise<string> {
  const zai = await ZAI.create();
  const c = await zai.chat.completions.create({
    messages: messages as never,
    temperature: 0.8,
    thinking: { type: "disabled" },
  });
  return c.choices?.[0]?.message?.content ?? "";
}

/** المسار الحقيقي للإنتاج: POST /api/chat/team على السيرفر الشغال (السلسلة الكاملة: مفاتيح ← Pollinations ← المدمج) */
let prodCookie = "";
async function login(): Promise<void> {
  const res = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD ?? "" }),
  });
  if (!res.ok) throw new Error("فشل الدخول للسيرفر — محتاج ADMIN_PASSWORD");
  prodCookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
}
async function engineProduction(messages: { role: string; content: string }[]): Promise<string> {
  if (!prodCookie) await login();
  const res = await fetch("http://localhost:3000/api/chat/team", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: prodCookie },
    body: JSON.stringify({ content: messages[messages.length - 1].content.replace("أنت (الرئيس التنفيذي): ", "") }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`production ${res.status}`);
  const json = await res.json();
  const replies = (json?.replies ?? []) as { senderName?: string; content?: string; name?: string; reply?: string }[];
  return JSON.stringify(replies.map((r) => ({ name: r.name ?? r.senderName ?? "؟", reply: r.reply ?? r.content ?? "" })));
}

function checkReply(r: string, qc: (typeof QUESTIONS)[number]) {
  const lines = r.split("\n").filter((l) => l.trim()).length;
  const checks: Record<string, boolean> = {};
  checks["مفيش حروف صينية"] = !CHINESE.test(r);
  checks["طول معقول (≤5 أسطر)"] = lines <= 5 && r.length <= 700;
  if (qc.expectNoData) {
    checks["قال «مفيش» بدل الاختراع"] = REFUSAL.some((m) => r.includes(m));
  }
  if (qc.expectCount) {
    checks["العدد الصح 19"] = r.includes(String(qc.expectCount));
  }
  if (qc.expectCode) {
    checks["فيه كود فعلي"] = /function|const|=>|return/.test(r);
  }
  checks["مفيش شامي"] = !SHAMI.test(r);
  checks["مفيش فصحى تقيلة"] = !FUS7A.test(r);
  return checks;
}

async function runEngine(label: string, fn: (m: { role: string; content: string }[]) => Promise<string>, phase: string, system: string) {
  const evidence: string[] = [`===== اختبار الصدق — مرحلة ${phase} — محرك ${label} =====`];
  let total = 0, passed = 0, refused = 0, refusedNeeded = 0;
  for (const qc of QUESTIONS) {
    evidence.push(`\n----- سؤال [${qc.id}]: ${qc.q}`);
    let raw = "";
    try {
      raw = await fn([
        { role: "system", content: system },
        { role: "user", content: `أنت (الرئيس التنفيذي): ${qc.q}` },
      ]);
    } catch (err) {
      evidence.push(`خطأ محرك: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    const replies = parseReplies(raw);
    evidence.push("الرد الخام:\n" + raw.slice(0, 1200));
    for (const r of replies) {
      const checks = checkReply(r.reply, qc);
      const names = Object.entries(checks).map(([k, v]) => `${v ? "نعم" : "لا"}:${k}`).join(" | ");
      evidence.push(`» ${r.name}: ${names}`);
      if (qc.expectNoData) {
        refusedNeeded++;
        if (checks["قال «مفيش» بدل الاختراع"]) refused++;
      }
      total += Object.keys(checks).length;
      passed += Object.values(checks).filter(Boolean).length;
    }
    if (label === "pollinations") await new Promise((res) => setTimeout(res, 46000)); // حد المعدل: رد واحد كل 45ث لكل IP
  }
  const pct = total ? Math.round((passed / total) * 100) : 0;
  evidence.push(`\n===== خلاصة ${phase} / ${label}: ${passed}/${total} فحص ناجح (${pct}%) — الرد «مفيش» عند الحاجة: ${refused}/${refusedNeeded} =====`);
  const fs = await import("fs");
  const file = `tool-results/honesty-${phase === "قبل" ? "before" : "after"}-${label}.txt`;
  fs.writeFileSync(file, evidence.join("\n"), "utf-8");
  console.log(evidence.join("\n"));
  return { passed, total, pct, refused, refusedNeeded };
}

async function main() {
  const only = process.argv[3]; // اختياري: pollinations | zai | production
  const employees = await db.employee.findMany({ orderBy: { createdAt: "asc" } });
  const system = buildTeamPrompt(employees);
  console.log(`الموظفين من القاعدة: ${employees.length} — مرحلة: ${PHASE}${only ? ` — محرك: ${only}` : ""}`);
  if (!only || only === "pollinations") {
    await runEngine("pollinations", enginePollinations, PHASE, system);
  }
  if (!only || only === "zai") {
    await new Promise((res) => setTimeout(res, 3000));
    await runEngine("zai", engineZai, PHASE, system);
  }
  if (only === "production") {
    await runEngine("production", engineProduction, PHASE, system);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
