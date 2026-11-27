/**
 * اختبار فعلي للمهارات الجديدة (v3.5-skills) على المسار الحقيقي POST /api/chat/dm:
 * - مازن (Backend): باج حقيقي → لازم يظهر التصحيح المنهجي (إعادة إنتاج/عزل/فرضية/إصلاح/اختبار)
 * - سلمى (QA): باج حقيقي → لازم يظهر قالب الباج (خطوات/متوقع/فعلي/خطورة)
 * الدليل بيتسجل في tool-results/ وبيتطبع كاملاً.
 * التشغيل: ADMIN_PASSWORD=... bun run scripts/test-skills-demo.ts
 */
import { db } from "../src/lib/db";

const BASE = "http://localhost:3000";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!PASSWORD) throw new Error("محتاج ADMIN_PASSWORD");

const TASKS: { name: string; file: string; question: string }[] = [
  {
    name: "مازن",
    file: "tool-results/skills-demo-mazn-backend.txt",
    question:
      "باج حقيقي عندنا: endpoint /api/files/upload بيقع 500 أحياناً لما المستخدم يرفع ملف اسمه فيه مسافات، وأحياناً بيرفع عادي. اتصرف كأن الملف قدامك واكتبلي إزاي تحلها خطوة خطوة.",
  },
  {
    name: "سلمى",
    file: "tool-results/skills-demo-salma-qa.txt",
    question:
      "لما المستخدم يرفع PDF أكبر من 10 ميجا على شاشة الملفات، التطبيق بيفضل عالق على سبينر من غير رسالة خطأ ولا يلغي الرفع. اكتبلي تقرير الباج ده جاهز أبعته للمطور.",
  },
];

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`فشل الدخول: ${login.status}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const office = await fetch(`${BASE}/api/office`, { headers: { Cookie: cookie } });
  const { employees } = (await office.json()) as { employees: { id: string; name: string }[] };

  for (const t of TASKS) {
    const emp = employees.find((e) => e.name === t.name);
    if (!emp) throw new Error(`مفيش موظف ${t.name}`);

    // عزل: نمسح محادثة الموظف عشان الرد يطلع من المهارة الجديدة بدون تلوث
    await db.message.deleteMany({ where: { channel: "dm", employeeId: emp.id } });

    const res = await fetch(`${BASE}/api/chat/dm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ employeeId: emp.id, content: t.question }),
    });
    const data = (await res.json()) as { reply?: string; taskCreated?: { id: string }; agentRunId?: string };
    let reply = data.reply ?? "";
    if (!reply && data.taskCreated?.id) {
      const task = await db.task.findUnique({ where: { id: data.taskCreated.id } });
      reply = task?.result ?? "";
    }
    const header = `===== ${t.name} (${t.file}) =====\nالسؤال: ${t.question}\n\nالرد:\n${reply}\n`;
    const { writeFileSync, appendFileSync } = await import("fs");
    try { appendFileSync(t.file, header + "\n"); } catch { writeFileSync(t.file, header); }
    console.log(header);
    // فحوصات المهارة
    if (t.name === "مازن") {
      const checks = {
        "خطوات إعادة إنتاج/عزل": /إعادة إنتاج|أعِد|عزل/.test(reply),
        "فرضية واضحة": /فرضية|السبب/.test(reply),
        "اختبار يمنع التكرار": /اختبار|test/i.test(reply) && /يمنع|تكرار|regression/i.test(reply),
      };
      console.log("فحوص مازن:", JSON.stringify(checks, null, 2));
      appendFileSync(t.file, "فحوص: " + JSON.stringify(checks) + "\n");
    } else {
      const checks = {
        "خطوات مرقمة": /\b1\b|\b١\b/.test(reply),
        "المتوقع": /متوقع/.test(reply),
        "الفعلي": /فعلي/.test(reply),
        "الخطورة": /خطورة|Critical|High|Medium|Low/i.test(reply),
        "البيئة": /بيئة|environment/i.test(reply),
      };
      console.log("فحوص سلمى:", JSON.stringify(checks, null, 2));
      appendFileSync(t.file, "فحوص: " + JSON.stringify(checks) + "\n");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  });
