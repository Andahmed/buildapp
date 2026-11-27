export interface Employee {
  id: string;
  name: string;
  role: string;
  dept: string;
  gender: string;
  skin: string;
  hair: string;
  shirt: string;
  personality: string;
  skills: string[];
  tools: string[];
  x: number;
  y: number;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  employeeId: string;
  title: string;
  status: "in_progress" | "awaiting_approval" | "approved" | "rejected";
  result?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: {
    name: string;
    dept: string;
    gender: string;
    skin: string;
    hair: string;
    shirt: string;
  };
}

export interface Msg {
  id: string;
  channel: string;
  employeeId?: string | null;
  role: string;
  senderName?: string | null;
  content: string;
  createdAt: string;
  provider?: string | null; // المحرك اللي رد (للعرض)
  model?: string | null; // الموديل اللي رد (للعرض)
  attachments?: unknown; // JSON string أو مصفوفة مرفقات
}

export interface MeetingItem {
  id: string;
  topic: string;
  participantIds: string[];
  status: "active" | "ended";
  summary?: string | null;
  createdAt: string;
}

export interface TrainingItem {
  id: string;
  employeeId: string;
  skill: string;
  summary: string;
  createdAt: string;
  employee?: { name: string };
}

export interface ActivityItem {
  id: string;
  icon: string;
  text: string;
  createdAt: string;
}

export interface ToolItem {
  id: string;
  name: string;
  category: string;
  desc: string;
  connected: boolean;
}

export interface OfficeData {
  employees: Employee[];
  tasks: TaskItem[];
  activities: ActivityItem[];
  trainings: TrainingItem[];
  tools: ToolItem[];
  activeMeeting: MeetingItem | null;
}

export const DEPT_LABELS: Record<string, string> = {
  management: "الإدارة والمنتج",
  finance: "المالية والمحاسبة",
  hr: "الموارد البشرية والتدريب",
  tech: "قسم التطوير",
  design: "التصميم وتجربة المستخدم",
  marketing: "التسويق والنمو",
};

export const DEPT_COLORS: Record<string, string> = {
  management: "#d97706",
  finance: "#0d9488",
  hr: "#e11d48",
  tech: "#059669",
  design: "#db2777",
  marketing: "#7c3aed",
};

// فكرة الفيديو: بدل ما ندفع اشتراكات غالية — بدائل مفتوحة المصدر مجانية من GitHub
export const TOOL_ALTERNATIVES: Record<
  string,
  { replaces: string; savesUsd: number; repo?: string }
> = {
  openmanus: { replaces: "اشتراك Manus المدفوع (الوكيل الغالي)", savesUsd: 39, repo: "FoundationAgents/OpenManus" },
  ollama: { replaces: "اشتراكات ChatGPT Plus وClaude Pro", savesUsd: 20, repo: "ollama/ollama" },
  open_webui: { replaces: "واجهات الدردشة المدفوعة للفرق", savesUsd: 15, repo: "open-webui/open-webui" },
  comfyui: { replaces: "اشتراك Midjourney", savesUsd: 10, repo: "comfyanonymous/ComfyUI" },
  whisper: { replaces: "أدوات تفريغ الصوت المدفوعة زي Otter", savesUsd: 17, repo: "openai/whisper" },
  n8n: { replaces: "اشتراكات Zapier وMake", savesUsd: 20, repo: "n8n-io/n8n" },
  supabase: { replaces: "الخطط المدفوعة بتاعة Firebase", savesUsd: 25, repo: "supabase/supabase" },
  penpot: { replaces: "اشتراك Figma المهني", savesUsd: 12, repo: "penpot/penpot" },
  excalidraw: { replaces: "اشتراك Lucidchart", savesUsd: 8, repo: "excalidraw/excalidraw" },
  gimp: { replaces: "اشتراك Adobe Photoshop", savesUsd: 20, repo: "GNOME/gimp" },
  kdenlive: { replaces: "اشتراك Adobe Premiere", savesUsd: 23, repo: "KDE/kdenlive" },
  calcom: { replaces: "اشتراك Calendly", savesUsd: 10, repo: "calcom/cal.com" },
  bitwarden: { replaces: "اشتراك 1Password", savesUsd: 4, repo: "bitwarden/server" },
};

export const TOTAL_MONTHLY_SAVINGS = Object.values(TOOL_ALTERNATIVES).reduce(
  (sum, t) => sum + t.savesUsd,
  0
);

export function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 45) return "الآن";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return m === 1 ? "منذ دقيقة" : m === 2 ? "منذ دقيقتين" : `منذ ${m} دقيقة`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return h === 1 ? "منذ ساعة" : h === 2 ? "منذ ساعتين" : `منذ ${h} ساعة`;
  }
  const d = Math.floor(diff / 86400);
  return d === 1 ? "منذ يوم" : d === 2 ? "منذ يومين" : `منذ ${d} يوم`;
}
