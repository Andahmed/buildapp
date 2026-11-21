import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { extractJSON } from "@/lib/ai";
import { callLLM } from "@/lib/providers";
import { FREE_DESKS, Dept, TOOLS_SEED, buildSystemPrompt, DEPT_LEAD, COMPANY_NAME } from "@/lib/employees";
import { DEPT_LABELS } from "@/components/office/types";

export const dynamic = "force-dynamic";

const VALID_TOOLS = TOOLS_SEED.map((t) => t.id);
const VALID_DEPTS: Dept[] = ["management", "finance", "hr", "marketing", "tech", "design"];

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const { jobDescription } = await req.json();
  if (!jobDescription?.trim()) {
    return NextResponse.json({ error: "jobDescription required" }, { status: 400 });
  }

  const system = `أنت ليلى، مديرة الموارد البشرية في ${COMPANY_NAME} — شركة برمجة. الرئيس التنفيذي بيبعتلك وصف وظيفي وانت بتعيّن موظف ذكاء اصطناعي جديد بتكوّنه بالمواصفات دي.
اختر اسماً مصرياً مناسباً للجنس وللقسم، واكتب شخصية بتجعل شغله مميز، وخلي مهاراته تناسب شركة برمجة.
الأقسام المتاحة: management (الإدارة والمنتج) | finance (المالية) | hr (الموارد البشرية) | tech (قسم التطوير: مطورين وDevOps وQA ومهندسي AI) | design (التصميم وتجربة المستخدم) | marketing (التسويق والنمو).
الأدوات المتاحة للربط (اختار من ديه بس): ${VALID_TOOLS.join(", ")}.
اكتب systemPrompt بالعامية المصرية بيوصف دوره بالتفصيل وإزاي يشتغل وبيسلّم.
ردك لازم يكون JSON بس بدون أي كلام زيادة بالشكل ده:
{
  "name": "الاسم",
  "role": "المسمى الوظيفي بالعربي",
  "dept": "واحد من الأقسام",
  "gender": "male أو female",
  "personality": "جملة عن شخصيته",
  "skills": ["3 مهارات"],
  "tools": ["أدوات من القائمة"],
  "systemPrompt": "وصف دوره ونمط شغله بالمصري (من 3 لـ 5 جمل)",
  "welcomeReply": "جملة ترحيب بيقولها للرئيس التنفيذي بنفسه بعد التعيين"
}`;

  let raw: string;
  try {
    raw = (await callLLM([{ role: "system", content: system }, { role: "user", content: jobDescription.trim() }])).text;
  } catch {
    return NextResponse.json({ error: "ليلى مش قادرة توصل لعقلها دلوقتي، جرب تاني" }, { status: 502 });
  }

  const data = extractJSON<{
    name: string; role: string; dept: string; gender: string;
    personality: string; skills: string[]; tools: string[];
    systemPrompt: string; welcomeReply: string;
  }>(raw);

  if (!data?.name || !data?.role || !VALID_DEPTS.includes(data.dept as Dept)) {
    return NextResponse.json({ error: "ليلى ماعرفتش تحدد المواصفات — جرب صياغة تانية" }, { status: 422 });
  }

  // مكان المكتب — مع fallback آمن لو القسم مفيهوش مكاتب
  const dept = data.dept as Dept;
  const employees = await db.employee.findMany();
  const taken = new Set(employees.map((e) => `${e.x},${e.y}`));
  const free = FREE_DESKS[dept]?.find((d) => !taken.has(`${d.x},${d.y}`));
  const fallback = FREE_DESKS[dept]?.[0] ?? { x: 50, y: 90 };
  const pos = free ?? { x: fallback.x + 6, y: fallback.y };

  const tools = (data.tools || []).filter((t) => VALID_TOOLS.includes(t)).slice(0, 4);
  const gender = data.gender === "female" ? "female" : "male";
  const hairStyles = gender === "female" ? ["long", "hijab", "bun"] : ["short"];
  const hairStyle = hairStyles[Math.floor(Math.random() * hairStyles.length)] as "long" | "hijab" | "bun" | "short";
  const skinTones = ["#eab892", "#c98850", "#f0c8a0"];
  const shirtTones = ["#0d9488", "#7c3aed", "#db2777", "#ea580c", "#059669", "#b45309"];
  const hairTones = ["#1c1917", "#292524", "#44403c", "#3f2412"];

  const sysPrompt = buildSystemPrompt({
    name: data.name,
    role: data.role,
    personality: data.personality || "زميل شغل نشيط",
    skills: data.skills?.slice(0, 5) || [],
    tools,
    systemPrompt: data.systemPrompt || "بتشتغل حسب الطلب اللي جالك من الرئيس التنفيذي وبتسلّم شغل جاهز.",
    toolNames: tools.map((t) => TOOLS_SEED.find((x) => x.id === t)?.name ?? t).join("، "),
  });

  const employee = await db.employee.create({
    data: {
      name: data.name.slice(0, 20),
      role: data.role.slice(0, 60),
      dept,
      gender,
      skin: skinTones[Math.floor(Math.random() * skinTones.length)],
      hair: hairTones[Math.floor(Math.random() * hairTones.length)],
      shirt: shirtTones[Math.floor(Math.random() * shirtTones.length)],
      personality: data.personality || "زميل شغل نشيط",
      systemPrompt: sysPrompt,
      skills: JSON.stringify((data.skills || []).slice(0, 5)),
      tools: JSON.stringify(tools),
      x: pos.x,
      y: pos.y,
    },
  });

  if (data.welcomeReply?.trim()) {
    await db.message.create({
      data: {
        channel: "dm",
        employeeId: employee.id,
        role: "employee",
        senderName: employee.name,
        content: data.welcomeReply.trim(),
      },
    });
  }

  await db.activity.create({
    data: {
      icon: "users",
      text: `ليلى عيّنت ${employee.name} — ${employee.role} (${DEPT_LABELS[dept] ?? dept})`,
    },
  });

  return NextResponse.json({ employee });
}
