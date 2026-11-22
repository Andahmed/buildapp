import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

function parseEmployee(e: {
  id: string; name: string; role: string; dept: string; gender: string;
  skin: string; hair: string; shirt: string; personality: string;
  skills: string; tools: string; x: number; y: number; createdAt: Date;
}) {
  let skills: string[] = [];
  let tools: string[] = [];
  try { skills = JSON.parse(e.skills); } catch {}
  try { tools = JSON.parse(e.tools); } catch {}
  return { ...e, skills, tools };
}

export async function GET() {
  await ensureSeeded();
  const [employees, tasks, activities, trainings, tools, activeMeeting] =
    await Promise.all([
      db.employee.findMany({ orderBy: { createdAt: "asc" } }),
      db.task.findMany({
        orderBy: { updatedAt: "desc" },
        take: 120,
        include: { employee: { select: { name: true, dept: true, gender: true, skin: true, hair: true, shirt: true } } },
      }),
      db.activity.findMany({ orderBy: { createdAt: "desc" }, take: 18 }),
      db.training.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { employee: { select: { name: true } } },
      }),
      db.tool.findMany({ orderBy: { id: "asc" } }),
      db.meeting.findFirst({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const meetingParticipants = activeMeeting
    ? ((): string[] => {
        try { return JSON.parse(activeMeeting.participantIds); } catch { return []; }
      })()
    : [];

  return NextResponse.json({
    employees: employees.map(parseEmployee),
    tasks,
    activities,
    trainings,
    tools,
    activeMeeting: activeMeeting
      ? { ...activeMeeting, participantIds: meetingParticipants }
      : null,
  });
}
