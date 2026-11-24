/**
 * سيناريوهات تقييم جودة الموظفين + حكم LLM (فكرة OpenAI Evals / Reflexion)
 * - 6 سيناريوهات ثابتة على موظفين من أقسام مختلفة (المسار الحقيقي: POST /api/chat/dm)
 * - فحوصات تلقائية صارمة (حساب/حروف صينية/طول) + حكم LLM بيقيّم 5 معايير من 1 إلى 5
 * - التقرير بيتكتب في docs/EVALS-REPORT.md
 * التشغيل: bun run scripts/evals.ts (السيرفر لازم يكون شغال على :3000)
 */
import { callLLM } from "../src/lib/providers";
import { db } from "../src/lib/db";

const BASE = "http://localhost:3000";

interface Scenario {
  id: string;
  dept: string;
  question: string;
  auto?: { name: string; test: (reply: string) => boolean; hint: string }[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "خطة تقنية",
    dept: "tech",
    question: "اعمل لي خطة نشر تطبيق ويب على 3 خطوات مختصرة بالعربي المصري.",
    auto: [
      { name: "طول كافي", test: (r) => r.length > 120, hint: "الرد أقصر من 120 حرف — خطة من 3 خطوات مش ممكن تكون أقصر" },
      { name: "بدون حروف صينية", test: (r) => !/[\u4e00-\u9fff]/.test(r), hint: "ممنوع أي حروف صينية في الرد" },
    ],
  },
  {
    id: "حساب مالي",
    dept: "finance",
    question: "الميزانية المعتمدة 45 ألف جنيه والمصاريف الفعلية 12 ألف جنيه — الفرق كام؟ جاوب بالرقم بس في سطر.",
    auto: [
      { name: "الرقم صح (33)", test: (r) => r.includes("33"), hint: "الفرق 45-12=33 لازم يظهر" },
      { name: "بدون حروف صينية", test: (r) => !/[\u4e00-\u9fff]/.test(r), hint: "ممنوع أي حروف صينية في الرد" },
    ],
  },
  {
    id: "إعلان تسويق",
    dept: "marketing",
    question: "اكتب سطرين إعلان قصيرين لعصير قصب طبيعي، بالمصري، بدون مبالغة.",
    auto: [
      { name: "طول مناسب", test: (r) => r.length > 40 && r.length < 600, hint: "سطرين إعلان مش ممكن يكونوا سطر واحد ولا رسالة طويلة" },
      { name: "بدون حروف صينية", test: (r) => !/[\u4e00-\u9fff]/.test(r), hint: "ممنوع أي حروف صينية في الرد" },
    ],
  },
  {
    id: "نسخة احتياطية",
    dept: "tech",
    question: "عايز أعمل نسخة احتياطية يومية لقاعدة بيانات SQLite على سيرفر لينكس — الخطوات الأساسية إيه؟ رد مختصر في 4 نقاط.",
    auto: [
      { name: "بدون حروف صينية", test: (r) => !/[\u4e00-\u9fff]/.test(r), hint: "ممنوع أي حروف صينية في الرد" },
    ],
  },
  {
    id: "بنود عقد",
    dept: "management",
    question: "إيه أهم 3 بنود لازم تكون واضحة في عقد مع عميل جديد؟ رد مختصر في 3 نقاط.",
    auto: [
      { name: "بدون حروف صينية", test: (r) => !/[\u4e00-\u9fff]/.test(r), hint: "ممنوع أي حروف صينية في الرد" },
    ],
  },
  {
    id: "ألوان تصميم",
    dept: "design",
    question: "اقترح 3 ألوان للوغو مطعم بيصر مع سبب اختيار كل لون في سطر واحد.",
    auto: [
      { name: "عدد الألوان", test: (r) => (r.match(/\d/g) ?? []).length >= 3, hint: "المطلوب 3 ألوان مرقمة" },
      { name: "بدون حروف صينية", test: (r) => !/[\u4e00-\u9fff]/.test(r), hint: "ممنوع أي حروف صينية في الرد" },
    ],
  },
];

function extractJSON(s: string): Record<string, unknown> | null {
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a === -1 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

async function main() {
  // بوابة الدخول: جلسة أدمن قبل أي اختبار — البوابة بتمنع كل API بدون كوكي
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) throw new Error("محتاج ADMIN_PASSWORD في البيئة للدخول");
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`فشل تسجيل الدخول: ${loginRes.status}`);
  const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie.startsWith("kod_session=")) throw new Error("مفيش كوكي جلسة من الـ login");

  const officeRes = await fetch(`${BASE}/api/office`, { headers: { Cookie: cookie } });
  if (!officeRes.ok) throw new Error("السيرفر مش شغال على :3000");
  const office = await officeRes.json();
  const employees: { id: string; name: string; dept: string; role: string }[] = office.employees;

  console.log("=== تقييم جودة الموظفين (سيناريوهات ثابتة + حكم LLM) ===\n");
  const rows: string[] = [];
  let totalScore = 0;
  let totalAuto = 0;
  let autoPassed = 0;
  let judgeScores = 0;

  for (const s of SCENARIOS) {
    const emp = employees.find((e) => e.dept === s.dept);
    if (!emp) {
      console.log(`[${s.id}] مفيش موظف في قسم ${s.dept} — تخطي`);
      continue;
    }
    // عزل القياس: نمسح شات الموظف الفردي وذكرياته من التقييمات السابقة —
    // التاريخ الملوث كان بيوصل لردود منهارة ([[TASK]] فاضية) مش عيب الموديل نفسه
    await db.message.deleteMany({ where: { channel: "dm", employeeId: emp.id } });
    await db.employeeMemory.deleteMany({ where: { employeeId: emp.id } });

    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/chat/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ employeeId: emp.id, content: s.question }),
    });
    let ms = performance.now() - t0;
    const data = await res.json();
    let reply: string = data.reply ?? "";

    // المسار الحقيقي التاني: الطلب بيتحول لمهمة وكيل (OpenManus-style) — بنستنى النتيجة النهائية
    if (!reply && data.agentRunId) {
      const deadline = Date.now() + 240_000; // حتى 4 دقايق
      let run: { status?: string; result?: string; error?: string } | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const st = await fetch(`${BASE}/api/agent/${data.agentRunId}`, { headers: { Cookie: cookie } }).then((r) => r.json());
        run = st.run ?? null;
        if (run && ["done", "failed"].includes(run.status ?? "")) break;
      }
      if (!run) {
        console.log(`[${s.id}] مهمة وكيل ما رجعتش في الوقت — تخطي`);
        rows.push(`| ${s.id} | ${emp.name} | 200 | مهمة وكيل انتهت مهلتها | — | — | ${(performance.now() - t0).toFixed(0)}ms |`);
        continue;
      }
      if (run.status === "failed") {
        console.log(`[${s.id}] مهمة الوكيل فشلت: ${String(run.error ?? "").slice(0, 120)}`);
        rows.push(`| ${s.id} | ${emp.name} | 200 | مهمة وكيل فشلت | — | — | ${(performance.now() - t0).toFixed(0)}ms |`);
        continue;
      }
      reply = run.result ?? "";
      ms = performance.now() - t0; // الزمن الحقيقي شامل انتظار مهمة الوكيل
    }
    // المسار التالت: الموظف سلّم شغل بماركرات [[TASK]] — التسليم المحفوظ في Task.result هو الرد
    if (!reply && data.taskCreated?.id) {
      const task = await db.task.findUnique({ where: { id: data.taskCreated.id } });
      reply = task?.result ?? "";
    }
    if (!reply) {
      console.log(`[${s.id}] ${emp.name}: خطأ من السيرفر (${res.status}) — ${JSON.stringify(data).slice(0, 120)}`);
      rows.push(`| ${s.id} | ${emp.name} | ${res.status} | فشل | — | — | ${ms.toFixed(0)}ms |`);
      continue;
    }

    // الفحوصات التلقائية الصارمة
    const autoResults = (s.auto ?? []).map((a) => ({ name: a.name, ok: a.test(reply) }));
    const autoOk = autoResults.filter((r) => r.ok).length;
    totalAuto += autoResults.length;
    autoPassed += autoOk;

    // الحكم LLM
    const judge = await callLLM([
      {
        role: "system",
        content: `أنت حكم تقييم محايد لردود مساعدين ذكيين. قيّم الرد فقط، بدون أي كلام خارج الـ JSON.
المعايير من 1 (سيء جداً) لـ 5 (ممتاز):
- relevance: على موضوع السؤال فعلاً
- accuracy: صحيح معلوماتياً وحسابياً
- completeness: غطى المطلوب كله (عدد الخطوات أو البنود المطلوبة)
- dialect: عربي مصري طبيعي
- clean: بدون حشو أو تكرار أو لغات غريبة (أي حرف صيني = clean:1)
رد JSON فقط بهذا الشكل: {"relevance":n,"accuracy":n,"completeness":n,"dialect":n,"clean":n,"reason":"سطر واحد بالعربي"}`,
      },
      {
        role: "user",
        content: `السؤال:\n${s.question}\n\nالرد المُقيَّم:\n${reply.slice(0, 1500)}`,
      },
    ], { maxTokens: 400 });
    const j = extractJSON(judge.text) ?? {};
    const nums = ["relevance", "accuracy", "completeness", "dialect", "clean"].map((k) => Number(j[k]) || 0);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    totalScore += avg;
    judgeScores++;

    console.log(`[${s.id}] ${emp.name} (${s.dept}) — ${ms.toFixed(0)}ms`);
    console.log(`  فحوصات تلقائية: ${autoOk}/${autoResults.length} ${autoResults.map((r) => `${r.name}:${r.ok ? "✅" : "❌"}`).join(" ")}`);
    console.log(`  الحكم LLM: ${(avg).toFixed(1)}/5  (${nums.join("/")})  ${String(j.reason ?? "").slice(0, 80)}`);
    rows.push(
      `| ${s.id} | ${emp.name} | 200 | ${(avg).toFixed(1)}/5 | ${autoOk}/${autoResults.length} | ${String(j.reason ?? "").slice(0, 60).replace(/\|/g, "،")} | ${ms.toFixed(0)}ms |`
    );
  }

  const overall = judgeScores ? totalScore / judgeScores : 0;
  const autoRate = totalAuto ? (autoPassed / totalAuto) * 100 : 0;
  console.log(`\n=== النتيجة الإجمالية ===`);
  console.log(`حكم LLM متوسط: ${overall.toFixed(2)}/5 على ${judgeScores} سيناريوهات`);
  console.log(`فحوصات تلقائية: ${autoPassed}/${totalAuto} (${autoRate.toFixed(0)}%)`);

  const date = new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });
  const report = `# EVALS-REPORT.md — تقييم جودة ردود الموظفين

التشغيل: ${date} — ${judgeScores} سيناريوهات، كل رد من المسار الحقيقي (POST /api/chat/dm) والحكم LLM منفصل تماماً عن موظف الشات.

## النتائج

| السيناريو | الموظف | HTTP | حكم LLM | فحوصات تلقائية | سبب الحكم | الزمن |
|---|---|---|---|---|---|---|
${rows.join("\n")}

## الإجمالي

- **حكم LLM متوسط: ${overall.toFixed(2)}/5** على ${judgeScores} سيناريوهات
- **فحوصات تلقائية: ${autoPassed}/${totalAuto} (${autoRate.toFixed(0)}%)**
- التقييم ده هو الـ baseline الرسمي لأي تعديل جاي على الـ prompts — أي تغيير يتراجع بنفس السكريبت: \`bun run scripts/evals.ts\`
`;
  await import("fs").then((fs) => fs.promises.writeFile("docs/EVALS-REPORT.md", report, "utf-8"));
  console.log("\nالتقرير اتكتب في docs/EVALS-REPORT.md");
  process.exit(0);
}

main().catch((e) => {
  console.error("فشل التقييم:", e);
  process.exit(1);
});
