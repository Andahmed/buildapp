import { db } from "@/lib/db";
import { EMPLOYEES, TOOLS_SEED, buildSystemPrompt, PROMPTS_VERSION } from "@/lib/employees";
import { PROVIDER_PRESETS } from "@/lib/providers";
import { encryptSecret, isEncrypted } from "@/lib/crypto";

let seeded = false;

/** ترحيل المفاتيح القديمة النص الصريح → تشفير AES-256-GCM */
async function migrateKeyEncryption() {
  const keys = await db.providerKey.findMany();
  const plain = keys.filter((k) => !isEncrypted(k.apiKey) && k.apiKey.length > 0);
  if (plain.length > 0) {
    for (const k of plain) {
      await db.providerKey.update({ where: { id: k.id }, data: { apiKey: encryptSecret(k.apiKey) } });
    }
    await db.activity.create({
      data: { icon: "shield", text: `أمننا ${plain.length} مفتاح — كل المفاتيح بقت مشفرة في قاعدة البيانات` },
    });
  }
}

/** تحديث prompts الموظفين لآخر إصدار بدون مسح أي بيانات */
async function upgradePrompts() {
  const meta = await db.appMeta.findUnique({ where: { key: "promptsVersion" } });
  if (meta?.value === PROMPTS_VERSION) return;
  const employees = await db.employee.findMany();
  for (const e of employees) {
    const seed = EMPLOYEES.find((x) => x.name === e.name);
    if (!seed) continue; // موظف متوظف يدوي — برومبته بقي زي ما هو
    let skills: string[] = [];
    let tools: string[] = [];
    try { skills = JSON.parse(e.skills); } catch {}
    try { tools = JSON.parse(e.tools); } catch {}
    const toolNames = tools.map((t) => TOOLS_SEED.find((x) => x.id === t)?.name ?? t).join("، ");
    await db.employee.update({
      where: { id: e.id },
      data: {
        systemPrompt: buildSystemPrompt({
          name: seed.name,
          dept: seed.dept,
          role: e.role === seed.role ? seed.role : e.role,
          personality: e.personality,
          skills: skills.length ? skills : seed.skills,
          tools: tools.length ? tools : seed.tools,
          systemPrompt: seed.systemPrompt,
          toolNames,
        }),
      },
    });
  }
  await db.appMeta.upsert({
    where: { key: "promptsVersion" },
    update: { value: PROMPTS_VERSION },
    create: { key: "promptsVersion", value: PROMPTS_VERSION },
  });
  await db.activity.create({
    data: { icon: "sparkles", text: "عقول الموظفين اترفعت لأحدث إصدار — تفكير أعمق وردود أدق" },
  });
}

/** تصحيح مفاتيح غلط قديمة + تسجيل مفتاح Gemini من بيئة الخادم لو موجود */
async function seedProviderKeys() {
  // 1) تنظيف: مفتاح Gemini (بيقتبدأ بـ AQ. أو AIza) لو اتخزن غلط كمفتاح OpenAI
  const keys = await db.providerKey.findMany();
  const brokenOpenai = keys.filter(
    (k) => k.provider === "openai" && (k.apiKey.startsWith("AQ.") || k.apiKey.startsWith("AIza"))
  );
  if (brokenOpenai.length > 0) {
    await db.providerKey.deleteMany({ where: { id: { in: brokenOpenai.map((b) => b.id) } } });
    await db.activity.create({
      data: { icon: "plug", text: "اتصحح إعداد مفتاح Google Gemini — كان متسجل على المزود الغلط" },
    });
  }

  // 2) تسجيل مفتاح Gemini من بيئة الخادم (.env.local) لو مفيش مفتاح gemini متخزن — بيتخزن مشفر
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) {
    const envModel = process.env.GEMINI_DEFAULT_MODEL?.trim() || PROVIDER_PRESETS.gemini.model;
    const existingGemini = await db.providerKey.findFirst({ where: { provider: "gemini" } });
    if (!existingGemini) {
      const anyDefault = await db.providerKey.count({ where: { isDefault: true, enabled: true } });
      await db.providerKey.create({
        data: {
          provider: "gemini",
          apiKey: encryptSecret(envKey),
          baseUrl: PROVIDER_PRESETS.gemini.baseUrl,
          model: envModel,
          label: "مفتاح Gemini بتاع الرئيس التنفيذي",
          enabled: true,
          isDefault: anyDefault === 0,
        },
      });
      await db.activity.create({
        data: { icon: "plug", text: "مفتاح Google Gemini بتاعك اتربط بالشركة — عقل الموظفين بقى من إعداداتك" },
      });
    } else if (existingGemini.model !== envModel) {
      // شفاء ذاتي: اسم الموديل اتغير على جوجل — نحدث الموديل المحفوظ من بيئة الخادم
      await db.providerKey.update({ where: { id: existingGemini.id }, data: { model: envModel } });
    }
  }
}

export async function ensureSeeded() {
  if (seeded) return;
  const count = await db.employee.count();
  if (count === 0) {
    for (const e of EMPLOYEES) {
      await db.employee.create({
        data: {
          name: e.name,
          role: e.role,
          dept: e.dept,
          gender: e.gender,
          skin: e.skin,
          hair: e.hair,
          shirt: e.shirt,
          personality: e.personality,
          systemPrompt: buildSystemPrompt({
            name: e.name,
            role: e.role,
            dept: e.dept,
            personality: e.personality,
            skills: e.skills,
            tools: e.tools,
            systemPrompt: e.systemPrompt,
            toolNames: e.tools.map((t) => TOOLS_SEED.find((x) => x.id === t)?.name ?? t).join("، "),
          }),
          skills: JSON.stringify(e.skills),
          tools: JSON.stringify(e.tools),
          x: e.x,
          y: e.y,
        },
      });
    }
  }
  const toolCount = await db.tool.count();
  if (toolCount === 0) {
    for (const t of TOOLS_SEED) {
      await db.tool.create({ data: { ...t, connected: false } });
    }
  }
  const actCount = await db.activity.count();
  if (actCount === 0) {
    await db.activity.createMany({
      data: [
        { icon: "rocket", text: "افتتحت شركة كود ذكي للتطوير البرمجي رسمياً — قسم التطوير جاهز يشتغل" },
        { icon: "users", text: `${EMPLOYEES.length} مهندس واخصائي ذكاء اصطناعي انضموا لفريق الشركة` },
        { icon: "plug", text: "محرك OpenManus متصل — الموظفين بينفذوا مهام حقيقية دلوقتي" },
      ],
    });
  }
  await seedProviderKeys();
  await migrateKeyEncryption();
  await upgradePrompts();
  seeded = true;
}

export async function resetOffice() {
  // نبدأ بالجداول المرتبطة بالموظفين عشان ما نكسرش الـ Foreign Keys
  await db.employeeMemory.deleteMany();
  await db.fileChunk.deleteMany();
  await db.agentRun.deleteMany();
  await db.workspaceFile.deleteMany();
  await db.message.deleteMany();
  await db.task.deleteMany();
  await db.meeting.deleteMany();
  await db.training.deleteMany();
  await db.activity.deleteMany();
  await db.employee.deleteMany();
  await db.tool.deleteMany();
  seeded = false;
  await ensureSeeded();
}
