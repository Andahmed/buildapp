import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { callLLM } from "@/lib/providers";
import { extractJSON } from "@/lib/ai";
import { saveBufferToDisk, readSavedFile, guessMimeFromName } from "@/lib/files";
import { runPythonSandboxed } from "@/lib/pysandbox";
import { checkPublicUrl } from "@/lib/net-guard";
import { searchChunks } from "@/lib/rag";

// ============ محرك الوكيل المفتوح — بأسلوب OpenManus ============
// دورة حقيقية: خطة (Plan) → تنفيذ خطوة بخطوة بأدوات فعلية (Act) → ملاحظة النتيجة (Observe) → التسليم النهائي (Deliver)
// الأدوات الحقيقية: بحث ويب، قراءة صفحات، تشغيل كود Python فعلي، كتابة ملفات، توليد صور.
// المرجع المفتوح المصدر: github.com/FoundationAgents/OpenManus

const ACTIVE_RUNS = new Set<string>();
const MAX_STEPS = 8;

/** تنظيف المهام المعلقة: لو السيرفر اتعمل له ريستارت والشغل اتقطع — بنعلنها فاشلة بصدق بدل ما تفضل طالعة "بينفذ" للأبد */
async function sweepStaleRuns() {
  try {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    const res = await db.agentRun.updateMany({
      where: { status: { in: ["queued", "planning", "running"] }, updatedAt: { lt: staleBefore } },
      data: { status: "failed", error: "المهمة اتوقفت لأن السيرفر اتعمل له إعادة تشغيل أثناء التنفيذ — ابدأها من جديد وهتكمل عادي." },
    });
    if (res.count > 0) console.log(`[agent] تم تنظيف ${res.count} مهمة معلقة من تشغيل قديم`);
  } catch {
    // تجاهل
  }
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
};

/** بحث Bing HTML — احتياطي حقيقي لو محرك البحث الأساسي وقع */
async function bingSearch(query: string, num: number): Promise<string> {
  const res = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${num + 5}`, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`bing blocked (${res.status})`);
  const html = await res.text();
  const results: string[] = [];
  const re = /<li class="b_algo"[\s\S]*?<h2><a[^>]*href="(https?:\/\/[^"#]+)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && results.length < num) {
    const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const snippet = m[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 260);
    if (!title) continue;
    results.push(`${results.length + 1}. ${title}\n   ${m[1]}\n   ${snippet}`);
  }
  if (results.length === 0) throw new Error("bing مافيش نتائج مفهومة");
  return results.join("\n");
}

/** بحث Wikipedia API — احتياطي أخضر للاسئلة المعرفية */
async function wikipediaSearch(query: string, num: number): Promise<string> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${num}`,
    { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  const json = await res.json();
  const items = (json?.query?.search ?? []) as { title: string; snippet: string }[];
  if (items.length === 0) throw new Error("wikipedia مافيش نتائج");
  return items
    .map(
      (r, i) =>
        `${i + 1}. ${r.title}\n   https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}\n   ${r.snippet.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").slice(0, 240)}`
    )
    .join("\n");
}

async function searchWeb(query: string, num: number): Promise<string> {
  const engines: { name: string; run: () => Promise<string> }[] = [
    {
      name: "zai",
      run: async () => {
        const zai = await ZAI.create();
        const results = await zai.functions.invoke("web_search", { query, num });
        const lines = (results || [])
          .slice(0, 6)
          .map((r, i) => `${i + 1}. ${r.name}\n   ${r.url}\n   ${String(r.snippet || "").slice(0, 300)}`)
          .join("\n");
        if (!lines.trim()) throw new Error("نتائج فاضية");
        return lines;
      },
    },
    { name: "bing", run: () => bingSearch(query, num) },
    { name: "wikipedia", run: () => wikipediaSearch(query, num) },
  ];
  const errs: string[] = [];
  for (const eng of engines) {
    try {
      return await eng.run();
    } catch (e) {
      errs.push(`${eng.name}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
    }
  }
  throw new Error(`كل محركات البحث فشلت (${errs.join(" | ")})`);
}

type ToolName = "web_search" | "page_reader" | "python" | "write_file" | "image_gen" | "finish";

const TOOL_DOCS = `الأدوات المتاحة فعلياً (اختر واحدة في كل خطوة — الاسم حرفياً زي ما هو مكتوب):
1. web_search — بحث حقيقي في الإنترنت. args: {"query": "نص البحث", "num": 5}
2. page_reader — قراءة محتوى صفحة ويب كاملة. args: {"url": "https://..."}
3. python — تشغيل كود Python حقيقي ومعاك الناتج (حسابات، معالجة نصوص، تحليل). args: {"code": "print(2+2)"}
4. write_file — إنشاء ملف تسليم حقيقي (كود، تقرير، نص). أي ملف لازم يتعمل بيها بالظبط. args: {"name": "report.md", "content": "محتوى الملف"}
5. image_gen — توليد صورة بالذكاء الاصطناعي. args: {"prompt": "وصف الصورة", "size": "1024x1024"}
6. finish — إنهاء المهمة وتسليم الخلاصة النهائية. args: {"summary": "ملخص الشغل النهائي بالعربي"}

مهم جداً: لو المطلوب ملف أو تسليم مكتوب، استخدم write_file فعلاً ببالمحتوى الكامل، ولو الخطوة محتاجة معلومة من النت استخدم web_search، ولو حسابات استخدم python.`;

async function addLog(runId: string, level: "info" | "tool" | "result" | "error", text: string) {
  await db.agentLog.create({ data: { runId, level, text: text.slice(0, 2000) } });
}

async function setRun(runId: string, data: { status?: string; currentStep?: number; result?: string; error?: string; provider?: string; model?: string }) {
  await db.agentRun.update({ where: { id: runId }, data });
}

async function runTool(
  tool: ToolName,
  args: Record<string, unknown>,
  runId: string,
  tmpDir: string
): Promise<{ output: string; fileIds?: string[] }> {
  switch (tool) {
    case "web_search": {
      const query = String(args.query ?? "").slice(0, 300);
      if (!query) throw new Error("web_search محتاج query");
      return { output: await searchWeb(query, 5) };
    }
    case "page_reader": {
      const url = String(args.url ?? "");
      // حماية SSRF: منع العناوين الداخلية (localhost، 192.168.x، 169.254.x، 10.x...) مع فحص الـ DNS
      const guard = await checkPublicUrl(url);
      if (!guard.ok) throw new Error(`page_reader: ${guard.reason}`);
      // المحاولة الأولى: قارئ الصفحات المدمج — المحاولة التانية: fetch مباشر وتنظيف HTML
      try {
        const zai = await ZAI.create();
        const page = await zai.functions.invoke("page_reader", { url: guard.url });
        const html = page?.data?.html ?? "";
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (text.length > 80) {
          return { output: `العنوان: ${page?.data?.title ?? ""}\n\n${text.slice(0, 5000)}` };
        }
        throw new Error("قراءة فاضية");
      } catch {
        const res = await fetch(guard.url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error(`فشل فتح الصفحة (${res.status})`);
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return { output: `العنوان: (قراءة مباشرة)\n\n${text.slice(0, 5000)}` };
      }
    }
    case "python": {
      const code = String(args.code ?? "");
      if (!code.trim()) throw new Error("python محتاج code");
      // عزل كامل: مجلد مؤقت + حظر شبكة + حدود CPU/ذاكرة/ملفات + مهلة قاتلة
      const res = await runPythonSandboxed(code, 30000);
      const note = res.timedOut ? "" : res.isolated ? "" : "\n(ملاحظة: العزل النظامي الكامل مش متاح على السيرفر ده)";
      return { output: res.output + note };
    }
    case "write_file": {
      const name = String(args.name ?? "file.txt").replace(/[\\/\x00-\x1f]/g, "_").slice(0, 80) || "file.txt";
      const content = String(args.content ?? "");
      if (!content.trim()) throw new Error("write_file محتاج content");
      const buf = Buffer.from(content, "utf-8");
      const meta = await saveBufferToDisk(buf, name, guessMimeFromName(name));
      await db.workspaceFile.create({
        data: { runId, name: meta.name, mime: meta.mime, size: meta.size, diskName: meta.diskName, kind: "output" },
      });
      return { output: `اتعمل الملف «${meta.name}» (${Math.ceil(meta.size / 1024)} كيلوبايت) وجاهز للتحميل من لوحة المهمة.` };
    }
    case "image_gen": {
      const prompt = String(args.prompt ?? "").slice(0, 800);
      if (!prompt) throw new Error("image_gen محتاج prompt");
      const size = ["1024x1024", "1344x768", "768x1344"].includes(String(args.size)) ? (String(args.size) as "1024x1024") : "1024x1024";
      let b64 = "";
      try {
        const zai = await ZAI.create();
        const res = await zai.images.generations.create({ prompt, size });
        b64 = res?.data?.[0]?.base64 ?? "";
      } catch {
        // احتياطي حقيقي: محرك الصور المجاني المباشر (بدون مفتاح)
        const [w, h] = size.split("x");
        const pUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&seed=${Date.now() % 1000000}`;
        const pRes = await fetch(pUrl, { signal: AbortSignal.timeout(120000) });
        if (!pRes.ok) throw new Error(`محركا الصور فشلا (${pRes.status})`);
        const buf = Buffer.from(await pRes.arrayBuffer());
        if (buf.length < 1000) throw new Error("محركا الصور فشلا (ناتج فاضي)");
        const meta = await saveBufferToDisk(buf, `image-${Date.now()}.png`, "image/png");
        await db.workspaceFile.create({
          data: { runId, name: meta.name, mime: meta.mime, size: meta.size, diskName: meta.diskName, kind: "output" },
        });
        return { output: `الصورة اتعملت بالمحرك المجاني المباشر واتخزنت كملف «${meta.name}» — هتلاقيها في ملفات المهمة.` };
      }
      if (!b64) throw new Error("توليد الصورة رجع فاضي");
      const meta = await saveBufferToDisk(Buffer.from(b64, "base64"), `image-${Date.now()}.png`, "image/png");
      await db.workspaceFile.create({
        data: { runId, name: meta.name, mime: meta.mime, size: meta.size, diskName: meta.diskName, kind: "output" },
      });
      return { output: `الصورة اتعملت واتخزنت كملف «${meta.name}» — هتلاقيها في ملفات المهمة.` };
    }
    default:
      throw new Error("أداة مش معروفة");
  }
}

function buildActMessages(mission: string, employeeName: string, employeeRole: string, planSteps: { title: string; tool: string }[], stepIndex: number, observations: string[], fileNames: string[]) {
  const planText = planSteps.map((s, i) => `${i + 1}. ${s.title} [الأداة: ${s.tool}]`).join("\n");
  const obsText =
    observations.length > 0
      ? observations.map((o, i) => `[نتيجة الخطوة ${i + 1}]\n${o.slice(0, 1800)}`).join("\n\n")
      : "(لسه مفيش نتائج من خطوات سابقة)";
  const filesText = fileNames.length ? `الملفات اللي اتعملت لحد دلوقتي: ${fileNames.join("، ")}` : "لسه مفيش ملفات.";
  const system = `أنت ${employeeName} (${employeeRole}) في شركة كود ذكي للتطوير البرمجي، شغال كمهمة تنفيذ حقيقية بأسلوب OpenManus: كل خطوة لازم تعمل فيها إجراء فعلي بأداة حقيقية.
${TOOL_DOCS}
ردك لازم يكون JSON واحد بس بدون أي كلام زيادة:
لو هتستخدم أداة: {"action":"tool","tool":"اسم الأداة","args":{...}}
لو الشغل خلص وتسلم: {"action":"finish","args":{"summary":"خلاصة نهائية مفيدة بالعربي بالتفصيل"}}`;
  const user = `المهمة من الرئيس التنفيذي: ${mission}

الخطة المعتمدة:
${planText}

إنت دلوقتي على الخطوة ${stepIndex + 1} من ${planSteps.length}: «${planSteps[stepIndex]?.title ?? ""}»
الأداة المعتمدة للخطوة دي: ${planSteps[stepIndex]?.tool ?? "finish"} — استخدمها هي بالظبط إلا لو فعلاً مش مناسبة.

نتائج الخطوات اللي فاتت:
${obsText}

${filesText}

قرر: إما تنفذ الخطوة دي بالأداة المعتمدة، أو — لو المهمة اكتملت عملياً — سلّم بـ finish.`;
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

const KNOWN_TOOLS: ToolName[] = ["web_search", "page_reader", "python", "write_file", "image_gen", "finish"];

/** هل المهمة نفسها بتطلب ملف تسليم؟ بنفحص نص المهمة مباشرة — مش بنعتمد على الخطة */
const MISSION_FILE_RE = /(ملف|تقرير|report|deliverable|\.md|\.txt|\.csv|\.json|\.py|\.js|\.ts|\.html|\.css|سكريبت|سكرين شوت|صورة)/i;

function missionNeedsFile(mission: string, planSteps: { title: string; tool: string }[]): boolean {
  return planSteps.some((s) => s.tool === "write_file") || MISSION_FILE_RE.test(mission);
}

/** اسم ملف التسليم المتوقع من نص المهمة — لو مفيش، بنطلع deliverable.md */
function guessDeliverableName(mission: string): string {
  const m = mission.match(/([\w\u0600-\u06FF-]+\.(?:md|txt|csv|json|py|js|ts|html|css|sh))/i);
  return m ? m[1] : "deliverable.md";
}

/**
 * ضمانة الشغل الحقيقي: لو الخطة مطلوب فيها ملف تسليم ولسه مفيش ولا ملف اتعمل —
 * بنجبر الوكيل يكتبه فعلياً، ولو ما كتبش بنكتبه بنفسنا من نتائج الخطوات (صفر كلام بدون تنفيذ).
 */
async function ensureDeliverableFile(
  runId: string,
  mission: string,
  actMessages: { role: "system" | "user"; content: string }[],
  observations: string[],
  tmpDir: string
): Promise<boolean> {
  const filesCount = await db.workspaceFile.count({ where: { runId } });
  if (filesCount > 0) return true; // فيه ملفات بالفعل — تمام
  await addLog(runId, "info", "التسليم مطلوب فيه ملف ولسه مفيش ملف اتعمل فعلياً — بنجبر الوكيل يكتبه فعلاً قبل أي كلام");

  const forcedRes = await callLLM(
    [
      ...actMessages,
      {
        role: "user" as const,
        content:
          'ممنوع التسليم دلوقتي. لازم تنفذ أداة write_file فعلياً بمحتوى الملف الكامل الحقيقي دلوقتي. رد JSON بس: {"action":"tool","tool":"write_file","args":{"name":"اسم الملف.الامتداد","content":"محتوى الملف كامل"}}',
      },
    ],
    { temperature: 0.2, maxTokens: 3000, preferFree: true }
  );
  const forced = extractJSON<{ action?: string; tool?: string; args?: Record<string, unknown> }>(forcedRes.text);
  if (forced?.action === "tool" && forced.tool === "write_file") {
    try {
      await addLog(runId, "tool", "جاري كتابة ملف التسليم فعلياً...");
      const { output } = await runTool("write_file", forced.args ?? {}, runId, tmpDir);
      observations.push(output);
      await addLog(runId, "result", output.slice(0, 400));
      return true;
    } catch {
      // هنكمل للتوليد التلقائي تحت
    }
  }

  // محاولة أخيرة مضمونة 100%: نكتب الملف بنفسنا من نتائج الخطوات
  const fileName = guessDeliverableName(mission);
  await addLog(runId, "info", `بكتب ملف التسليم «${fileName}» مباشرة من نتائج الخطوات (ضمانة تسليم حقيقي)...`);
  const contentRes = await callLLM(
    [
      { role: "system" as const, content: "اكتب محتوى الملف المطلوب كاملاً — نص الملف نفسه فقط بدون أي مقدمات أو كلام حوله." },
      {
        role: "user" as const,
        content: `المهمة: ${mission}\nاكتب محتوى ملف اسمه ${fileName} اعتماداً على نتائج الخطوات دي:\n${observations.map((o) => `- ${o.slice(0, 900)}`).join("\n")}`,
      },
    ],
    { maxTokens: 3000, preferFree: true }
  );
  const content = contentRes.text.trim();
  if (!content) return false;
  const { output } = await runTool("write_file", { name: fileName, content }, runId, tmpDir);
  observations.push(output);
  await addLog(runId, "result", output.slice(0, 400));
  return true;
}

function isValidAct(act: { action?: string; tool?: string } | null): boolean {
  if (!act?.action) return false;
  if (act.action === "finish") return true;
  return act.action === "tool" && !!act.tool && KNOWN_TOOLS.includes(act.tool as ToolName);
}

async function executeRun(runId: string, tmpDir: string) {
  try {
    const run = await db.agentRun.findUnique({ where: { id: runId }, include: { employee: true } });
    if (!run) return;

    // ===== المرحلة 1: التخطيط =====
    await setRun(runId, { status: "planning" });
    await addLog(runId, "info", `بدأت المهمة — ${run.employee.name} بيحلل المطلوب ويبني الخطة...`);

    // ===== RAG: أجزاء من ملفات الشركة ليها علاقة بالمهمة (بتتندجب قبل التخطيط) =====
    let ragContext = "";
    try {
      const chunks = await searchChunks(run.mission, 2);
      if (chunks.length > 0) {
        ragContext = `\nمن ملفات الشركة المشفوعة (أجزاء ليها علاقة):\n${chunks.join("\n---\n").slice(0, 1600)}`;
        await addLog(runId, "info", "لقيت معلومات من ملفات الشركة المشفوعة ودخلتها في التخطيط");
      }
    } catch {
      // اختياري
    }
    // قايمة الزملاء للتفويض
    const allEmployees = await db.employee.findMany({ select: { id: true, name: true, role: true, dept: true } });
    const teamRoster = allEmployees
      .filter((e) => e.id !== run.employeeId)
      .slice(0, 12)
      .map((e) => `${e.name} (${e.role})`)
      .join("، ");

    const planMessages = [
      {
        role: "system" as const,
        content: `أنت مخطط مهام لوكيل تنفيذ بأسلوب OpenManus. حوّل المهمة لخطة عملية من 3 لـ 5 خطوات، كل خطوة فعلية قابلة للتنفيذ بأداة محددة.
حدد الأداة المناسبة لكل خطوة من دول بالظبط:
- web_search: لو الخطوة محتاجة معلومات من الإنترنت
- page_reader: لو محتاج قراءة صفحة محددة
- python: حسابات أو معالجة بيانات أو تجربة كود
- write_file: لو الخطوة بتعمل أو تسلّم أي ملف (كود، تقرير، نص، ملخص)
- image_gen: لو الخطوة بتطلع صورة
- finish: الخلاصة النهائية وتسليم الشغل — دي لازم تكون آخر خطوة دايماً

قاعدة مهمة: أي خطوة فيها (اعمل ملف / تقرير / سكريبت / تسليم مكتوب) لازم أداتها write_file.

لو المهمة كبيرة وممكن تتقسم لأجزاء زملائك يتنفذوها، ضيف delegations (أقصى 2):
ردك لازم يكون JSON بس:
{"steps":[{"title":"عنوان قصير بالعربي","tool":"اسم الأداة"}],"delegations":[{"to":"اسم موظف","task":"وصف المهمة الفرعية"}]}
لو مفيش تفويض مناسب سيب delegations فاضية [].`,
      },
      {
        role: "user" as const,
        content: `المهمة: ${run.mission}\nالموظف المنفذ: ${run.employee.name} — ${run.employee.role}${ragContext}\nزميلاك المتاحين للتفويض: ${teamRoster}`,
      },
    ];

    const planRes = await callLLM(planMessages, { temperature: 0.3, maxTokens: 1500, preferFree: true });
    const planData = extractJSON<{ steps?: { title?: string; tool?: string }[]; delegations?: { to?: string; task?: string }[] }>(planRes.text);
    const planSteps = (planData?.steps ?? [])
      .map((s) => ({ title: String(s.title ?? "").trim().slice(0, 150), tool: String(s.tool ?? "").trim() }))
      .filter((s) => s.title)
      .slice(0, 5);
    if (planSteps.length === 0) {
      planSteps.push({ title: "تحليل المهمة وتجهيز التسليم النهائي", tool: "write_file" });
    }
    // خلي آخر خطوة دايماً finish
    planSteps[planSteps.length - 1].tool = "finish";
    const titles = planSteps.map((s) => s.title);

    await db.agentStep.createMany({
      data: titles.map((title, i) => ({ runId, index: i, title: title.slice(0, 150) })),
    });
    await setRun(runId, { status: "running", provider: planRes.provider, model: planRes.model, currentStep: 0 });
    await addLog(runId, "info", `الخطة جاهزة (${titles.length} خطوات) — ${planRes.provider === "zai" ? "المحرك المدمج" : planRes.provider}`);

    // ===== تفويض حقيقي: مهام فرعية لزملاء — بتتسجل كتاسكات بانتظار موافقتهم =====
    const delegations = Array.isArray(planData?.delegations) ? planData.delegations.slice(0, 2) : [];
    for (const d of delegations) {
      const toName = String(d?.to ?? "").trim();
      const subTask = String(d?.task ?? "").trim().slice(0, 200);
      if (!toName || !subTask) continue;
      const peer = allEmployees.find((e) => e.name === toName || toName.includes(e.name));
      if (!peer || peer.id === run.employeeId) continue;
      await db.task.create({
        data: { employeeId: peer.id, title: `[مفوضة من ${run.employee.name}] ${subTask}`, status: "awaiting_approval", result: `المهمة دي اتفوضت ليك ضمن مهمة أكبر: «${run.mission.slice(0, 120)}». نفذها وسلم النتيجة للرئيس التنفيذي.` },
      });
      await addLog(runId, "info", `فوّض ${peer.name} (${peer.role}) بمهمة فرعية: ${subTask}`);
    }
    if (delegations.length > 0) {
      await db.activity.create({
        data: { icon: "users", text: `${run.employee.name} فوّض ${delegations.length} مهام فرعية لزملائه — هتلاقيها في المهام` },
      });
    }

    // ===== المرحلة 2: التنفيذ خطوة بخطوة =====
    const observations: string[] = [];
    let finalResult: string | null = null;

    for (let i = 0; i < Math.min(titles.length, MAX_STEPS); i++) {
      const step = (await db.agentStep.findMany({ where: { runId }, orderBy: { index: "asc" } }))[i];
      if (!step) break;
      await db.agentStep.update({ where: { id: step.id }, data: { status: "running" } });
      await setRun(runId, { currentStep: i });
      await addLog(runId, "info", `الخطوة ${i + 1}: ${step.title}`);

      const files = await db.workspaceFile.findMany({ where: { runId } });
      const actMessages = buildActMessages(
        run.mission,
        run.employee.name,
        run.employee.role,
        planSteps,
        i,
        observations,
        files.map((f) => f.name)
      );

      const actRes = await callLLM(actMessages, { temperature: 0.3, maxTokens: 3000, preferFree: true });
      let act = extractJSON<{ action?: string; tool?: string; args?: Record<string, unknown> }>(actRes.text);

      // إعادة محاولة تصحيحية لو الرد مش مفهوم أو الأداة مش من القايمة
      if (!isValidAct(act)) {
        await addLog(runId, "info", "الرد الأول مش مفهوم — بيحاول تاني بدقة أكتر...");
        const retryRes = await callLLM(
          [
            ...actMessages,
            {
              role: "user" as const,
              content:
                "ردك السابق مش مفهوم. لازم رد JSON واحد بس بالشكل ده: {\"action\":\"tool\",\"tool\":\"اسم أداة من القايمة\",\"args\":{...}} أو {\"action\":\"finish\",\"args\":{\"summary\":\"...\"}}. اسم الأداة لازم يكون حرفياً واحد من: web_search أو page_reader أو python أو write_file أو image_gen أو finish.",
            },
          ],
          { temperature: 0.1, maxTokens: 3000, preferFree: true }
        );
        act = extractJSON<{ action?: string; tool?: string; args?: Record<string, unknown> }>(retryRes.text);
      }

      if (!isValidAct(act)) {
        await db.agentStep.update({ where: { id: step.id }, data: { status: "failed", output: "رد غير مفهوم من المحرك" } });
        await addLog(runId, "error", "الخطوة فشلت — رد غير مفهوم، بننتقل للخطوة اللي بعدها");
        observations.push(`(الخطوة ${i + 1} فشلت في التنفيذ)`);
        continue;
      }

      const finalAct = act as { action: string; tool?: string; args?: Record<string, unknown> };

      if (finalAct.action === "finish") {
        if (missionNeedsFile(run.mission, planSteps)) {
          const ok = await ensureDeliverableFile(runId, run.mission, actMessages, observations, tmpDir);
          if (!ok) {
            await db.agentStep.update({ where: { id: step.id }, data: { status: "failed", output: "تعذر إنتاج ملف التسليم فعلياً" } });
            await addLog(runId, "error", "التسليم مرفوض — مفيش ملف حقيقي اتعمل، بنكمل باقي الخطوات");
            observations.push("(تعذر إنتاج ملف التسليم)");
            continue;
          }
        }
        const summary = String(finalAct.args?.summary ?? "").trim() || "المهمة اكتملت";
        await db.agentStep.update({ where: { id: step.id }, data: { status: "done", output: summary } });
        finalResult = summary;
        break;
      }

      const tool = finalAct.tool as ToolName;
      await addLog(runId, "tool", `جاري التنفيذ بأداة ${tool}...`);
      try {
        const { output } = await runTool(tool, finalAct.args ?? {}, runId, tmpDir);
        observations.push(output);
        await db.agentStep.update({ where: { id: step.id }, data: { status: "done", output: output.slice(0, 1800) } });
        await addLog(runId, "result", output.slice(0, 900) || "(تم) ");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        observations.push(`(أداة ${tool} فشلت: ${msg})`);
        await db.agentStep.update({ where: { id: step.id }, data: { status: "failed", output: msg.slice(0, 1500) } });
        await addLog(runId, "error", `أداة ${tool} فشلت: ${msg.slice(0, 300)}`);
      }
    }

    // ===== المرحلة 2.5: مراجعة ذاتية وتصحيح (Self-Review & Correct) =====
    // بتعمل مراجعة لنتايج الخطوات قبل التسليم، ولو لقيت نواقص جوهرية بينفذ لحد خطوتين تصحيح
    if (observations.length > 0 && !finalResult) {
      try {
        await addLog(runId, "info", "مراجعة ذاتية: بفحص الشغل قبل التسليم...");
        const reviewRes = await callLLM(
          [
            {
              role: "system" as const,
              content:
                'أنت مراجع جودة صارم. قيّم: هل نتايج الخطوات دي بتغطي المهمة بالكامل؟ رد JSON بس: {"verdict":"ok"} لو مكتملة، أو {"verdict":"gaps","missing":"وصف النواقص بالعربي في سطرين"} لو فيها نواقص جوهرية بس. ما تطلعش نواقص ثانوية أو تحسينات شكلية.',
            },
            {
              role: "user" as const,
              content: `المهمة: ${run.mission}\nنتايج الخطوات:\n${observations.map((o) => `- ${o.slice(0, 700)}`).join("\n")}\nالملفات المنتجة: ${(await db.workspaceFile.findMany({ where: { runId } })).map((f) => f.name).join("، ") || "مفيش"}`,
            },
          ],
          { temperature: 0.2, maxTokens: 600, preferFree: true }
        );
        const review = extractJSON<{ verdict?: string; missing?: string }>(reviewRes.text);
        if (review?.verdict === "gaps" && review.missing?.trim()) {
          await addLog(runId, "info", `المراجعة لقيت نواقص: ${review.missing.slice(0, 220)} — بنصلح دلوقتي...`);
          // خطوتين تصحيح كحد أقصى
          for (let fix = 0; fix < 2; fix++) {
            const fixRes = await callLLM(
              [
                {
                  role: "system" as const,
                  content: `${TOOL_DOCS}\nردك JSON واحد بس: {"action":"tool","tool":"اسم الأداة","args":{...}} — نفّذ إجراء واحد فعلي يسد النواقص.`,
                },
                {
                  role: "user" as const,
                  content: `المهمة: ${run.mission}\nالنواقص المطلوب سدها: ${review.missing}\nاللي اتعمل لحد دلوقتي:\n${observations.map((o) => `- ${o.slice(0, 600)}`).join("\n")}`,
                },
              ],
              { temperature: 0.3, maxTokens: 2500, preferFree: true }
            );
            const fixAct = extractJSON<{ action?: string; tool?: string; args?: Record<string, unknown> }>(fixRes.text);
            if (isValidAct(fixAct) && fixAct?.action === "tool") {
              await addLog(runId, "tool", `تصحيح ${fix + 1}: تنفيذ ${fixAct.tool}...`);
              try {
                const { output } = await runTool(fixAct.tool as ToolName, fixAct.args ?? {}, runId, tmpDir);
                observations.push(`(تصحيح المراجعة) ${output}`);
                await addLog(runId, "result", output.slice(0, 400));
              } catch (e) {
                await addLog(runId, "error", `خطوة التصحيح فشلت: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
                break;
              }
            } else {
              break; // مش عارف يصلح بأداة — نكمل للتسليم
            }
          }
          await addLog(runId, "info", "خلصنا التصحيح — بتجهز التسليم النهائي");
        } else {
          await addLog(runId, "info", "المراجعة: الشغل مكتمل بدون نواقص جوهرية");
        }
      } catch {
        // المراجعة نفسها فشلت — ما نوقفش التسليم بسببها
        await addLog(runId, "info", "مراجعة ذاتية: اتخطت (المحرك مش متاح دلوقتي)");
      }
    }

    // ===== المرحلة 3: التسليم النهائي =====
    if (!finalResult) {
      await addLog(runId, "info", "بتجهز الخلاصة النهائية...");
      // نفس ضمانة الملف: بنفحص نص المهمة نفسها مش الخطة بس
      if (missionNeedsFile(run.mission, planSteps)) {
        const lastActMsgs = buildActMessages(run.mission, run.employee.name, run.employee.role, planSteps, Math.max(0, planSteps.length - 1), observations, []);
        await ensureDeliverableFile(runId, run.mission, lastActMsgs, observations, tmpDir);
      }
      const files = await db.workspaceFile.findMany({ where: { runId } });
      const finishRes = await callLLM(
        [
          {
            role: "system" as const,
            content:
              "لخص نتيجة المهمة للرئيس التنفيذي بالعربي المصري: ايه اتعمل، وايه الملفات الجاهزة، وتوصية عملية واحدة. رد نص مباشر بدون JSON وبدون ماركرات.",
          },
          {
            role: "user" as const,
            content: `المهمة: ${run.mission}\nنتائج الخطوات:\n${observations.map((o) => `- ${o.slice(0, 800)}`).join("\n")}\nالملفات: ${files.map((f) => f.name).join("، ") || "مفيش"}`,
          },
        ],
        { maxTokens: 2000, preferFree: true }
      );
      finalResult = finishRes.text.trim();
    }

    await setRun(runId, { status: "done", result: finalResult });
    await addLog(runId, "result", "المهمة خلصت — التسليم جاهز في لوحة المهمة");

    // ===== ذاكرة طويلة المدى: الموظف يفتكر شغله السابق =====
    try {
      await db.employeeMemory.create({
        data: {
          employeeId: run.employeeId,
          kind: "long",
          content: `خلصت مهمة «${run.mission.slice(0, 80)}» بنجاح — الخلاصة: ${String(finalResult).slice(0, 350)}`,
        },
      });
      // نحتفظ بآخر 5 ذكريات طويلة لكل موظف
      const mems = await db.employeeMemory.findMany({
        where: { employeeId: run.employeeId, kind: "long" },
        orderBy: { createdAt: "desc" },
        skip: 5,
      });
      if (mems.length > 0) {
        await db.employeeMemory.deleteMany({ where: { id: { in: mems.map((m) => m.id) } } });
      }
    } catch {
      // اختياري
    }

    // تسجيل المهمة كـ Task للموافقة
    await db.task.create({
      data: {
        employeeId: run.employeeId,
        title: run.mission.slice(0, 80),
        status: "awaiting_approval",
        result: finalResult,
      },
    });
    await db.activity.create({
      data: { icon: "rocket", text: `${run.employee.name} خلّص مهمة «${run.mission.slice(0, 40)}» — بانتظار موافقتك` },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setRun(runId, { status: "failed", error: msg.slice(0, 800) }).catch(() => {});
    await addLog(runId, "error", `المهمة فشلت: ${msg.slice(0, 500)}`).catch(() => {});
  } finally {
    ACTIVE_RUNS.delete(runId);
  }
}

/** يبدأ مهمة وكيل جديدة — بيرجع فوراً والتنفيذ بيستمر في الخلفية */
export async function startAgentRun(employeeId: string, mission: string): Promise<string> {
  await sweepStaleRuns();
  const run = await db.agentRun.create({
    data: { employeeId, mission: mission.slice(0, 2000), status: "queued" },
  });
  await addLog(run.id, "info", "المهمة اتسجلت ودخلت طابور التنفيذ");
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `agent-${run.id.slice(0, 8)}-`));
  if (!ACTIVE_RUNS.has(run.id)) {
    ACTIVE_RUNS.add(run.id);
    void executeRun(run.id, tmpDir);
  }
  return run.id;
}

/** تحويل ملف مرفوع لـ data URL للرؤية */
export async function fileToDataUrl(diskName: string, mime: string): Promise<string | null> {
  const buf = await readSavedFile(diskName);
  if (!buf) return null;
  return `data:${mime || guessMimeFromName(diskName)};base64,${buf.toString("base64")}`;
}
