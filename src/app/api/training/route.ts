import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { extractJSON } from "@/lib/ai";
import { callLLM } from "@/lib/providers";
import { COMPANY_NAME } from "@/lib/employees";

export const dynamic = "force-dynamic";

// جلسة تدريب يومية — نور تدرب الفريق
export async function POST() {
  await ensureSeeded();
  const employees = await db.employee.findMany({ orderBy: { createdAt: "asc" } });
  if (employees.length === 0) {
    return NextResponse.json({ error: "مفيش موظفين للتدريب" }, { status: 400 });
  }

  const names = employees.map((e) => `- ${e.name}: ${e.role}`).join("\n");
  const system = `أنت نور، مدربة الفريق التقني في ${COMPANY_NAME} — شركة برمجة. بتعمل جلسة تدريب يومية: بتختار 4 موظفين وتدرب كل واحد على سكيل جديد مفيد لشغله تحديداً (تقنيات، Git، اختبارات، أدوات AI مفتوحة المصدر).
فريقك:
${names}
ردك لازم يكون JSON بس بدون أي كلام زيادة:
[{"name":"اسم الموظف","skill":"اسم المهارة الجديدة","summary":"تمرين عملي قصير بيمسّك يطبقه (سطرين لثلاثة)"}]`;

  let raw: string;
  try {
    raw = (await callLLM([{ role: "system", content: system }, { role: "user", content: "اعمل جلسة تدريب النهاردة للفريق." }])).text;
  } catch {
    return NextResponse.json({ error: "نور مش قادرة تجهز الجلسة، جرب تاني" }, { status: 502 });
  }

  const parsed = extractJSON<{ name: string; skill: string; summary: string }[]>(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return NextResponse.json({ error: "تعذر تجهيز الجلسة — جرب تاني" }, { status: 422 });
  }

  const created: { employeeName: string; skill: string; summary: string }[] = [];
  for (const item of parsed.slice(0, 5)) {
    const emp = employees.find((e) => e.name === item.name);
    if (!emp || !item.skill?.trim()) continue;
    await db.training.create({
      data: {
        employeeId: emp.id,
        skill: item.skill.slice(0, 80),
        summary: (item.summary || "").slice(0, 500),
      },
    });
    created.push({ employeeName: emp.name, skill: item.skill, summary: item.summary || "" });
  }

  if (created.length) {
    await db.activity.create({
      data: {
        icon: "graduation",
        text: `نور عقدت جلسة تدريب: ${created.map((c) => `${c.employeeName} (${c.skill})`).join("، ")}`,
      },
    });
  }

  return NextResponse.json({ trainings: created });
}
