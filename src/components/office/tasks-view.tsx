"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmployeeAvatar } from "./avatar";
import { Employee } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, Send, FileText, Download, CheckCircle2, XCircle, Circle, PlayCircle, Trash2, Github, Search, FilePen, ImagePlus, Terminal, Globe } from "lucide-react";

interface AgentFileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
}

interface AgentStepMeta {
  id: string;
  index: number;
  title: string;
  status: string;
  output: string;
}

interface AgentLogMeta {
  id: string;
  level: string;
  text: string;
  createdAt: string;
}

interface AgentRunMeta {
  id: string;
  mission: string;
  status: string;
  provider: string;
  model: string;
  currentStep: number;
  result: string | null;
  error: string | null;
  createdAt: string;
  employee: { name: string; role: string; skin: string; hair: string; shirt: string; gender: string };
  steps: AgentStepMeta[];
  logs?: AgentLogMeta[];
  files: AgentFileMeta[];
}

interface TasksViewProps {
  employees: Employee[];
  focusRunId?: string | null;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  queued: { label: "في الطابور", cls: "bg-stone-200 text-stone-700" },
  planning: { label: "بيخطط", cls: "bg-amber-100 text-amber-800" },
  running: { label: "بينفذ", cls: "bg-emerald-100 text-emerald-800" },
  done: { label: "خلصت", cls: "bg-emerald-600 text-white" },
  failed: { label: "فشلت", cls: "bg-red-100 text-red-700" },
};

const MISSION_TEMPLATES = [
  "دوّر على أحدث أسعار استضافة VPS واعمل تقرير مقارنة جاهز بملف",
  "اكتب سكريبت Python يحسب ميزانية الشركة من جدول وأحفظه كملف جاهز",
  "اعمل تقرير تحليل لسوق تطبيقات الموبايل في مصر مع مصادر",
  "صمم صورة لوجو لشركة برمجة بألوان أخضر وأبيض",
];

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web_search: Search,
  page_reader: Globe,
  python: Terminal,
  write_file: FilePen,
  image_gen: ImagePlus,
  finish: CheckCircle2,
};

export function TasksView({ employees, focusRunId }: TasksViewProps) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<AgentRunMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [starting, setStarting] = useState(false);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const techEmployees = employees.filter((e) => ["tech", "design", "marketing", "management"].includes(e.dept));

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/agent");
      const json = await res.json();
      setRuns(json.runs ?? []);
    } catch {
      // تجاهل
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    if (focusRunId) setOpenRunId(focusRunId);
  }, [fetchRuns, focusRunId]);

  // Polling حي أثناء تنفيذ أي مهمة
  const hasActive = runs.some((r) => ["queued", "planning", "running"].includes(r.status));
  useEffect(() => {
    if (hasActive) {
      if (!pollRef.current) {
        pollRef.current = setInterval(fetchRuns, 2200);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasActive, fetchRuns]);

  async function startMission() {
    if (!mission.trim() || !employeeId || starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, mission: mission.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "خطأ");
      setMission("");
      setOpenRunId(json.runId);
      toast({ title: "المهمة بدأت", description: "الوكيل بيخطط وينفذ دلوقتي — تابع تحت" });
      await fetchRuns();
    } catch (err) {
      toast({ title: "المهمة مش بدأت", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function deleteRun(id: string) {
    await fetch(`/api/agent/${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* بانر المحرك */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600">
              <Bot className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-base font-extrabold">محرك تنفيذ المهام — بأسلوب OpenManus</h3>
              <p className="text-xs text-stone-300">مهمة حقيقية: خطة → تنفيذ بأدوات فعلياً (بحث ويب، Python، ملفات، صور) → تسليم جاهز للتحميل</p>
            </div>
          </div>
          <a
            href="https://github.com/FoundationAgents/OpenManus"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-stone-600 px-3 py-1.5 text-xs font-bold text-stone-200 transition hover:border-white hover:text-white"
          >
            <Github className="h-3.5 w-3.5" />
            FoundationAgents/OpenManus
          </a>
        </div>
      </div>

      {/* مهمة جديدة */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-bold text-stone-800">مهمة جديدة للوكيل</h3>
        <textarea
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          rows={3}
          placeholder="اكتب المهمة بالتفصيل... مثال: ابحث عن أفضل 5 استضافات لمشاريع Next.js واعمل تقرير مقارنة في ملف جاهز"
          className="w-full resize-none rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MISSION_TEMPLATES.map((t) => (
            <button
              key={t}
              onClick={() => setMission(t)}
              className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600 transition hover:border-emerald-500 hover:text-emerald-700"
            >
              {t.slice(0, 48)}...
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 outline-none focus:border-emerald-500"
          >
            <option value="">اختار الموظف المنفذ...</option>
            {techEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.role}
              </option>
            ))}
          </select>
          <Button onClick={startMission} disabled={!mission.trim() || !employeeId || starting} className="bg-emerald-600 hover:bg-emerald-700">
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            ابدأ التنفيذ الحقيقي
          </Button>
        </div>
      </div>

      {/* قائمة المهام */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            بيجهز المهام...
          </div>
        )}
        {!loading && runs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-400">
            مفيش مهام لسه — اكتب مهمة فوق وخلّي الوكيل يشتغل فعلاً
          </div>
        )}
        {runs.map((run) => {
          const st = STATUS_STYLES[run.status] ?? STATUS_STYLES.queued;
          const active = ["queued", "planning", "running"].includes(run.status);
          const open = openRunId === run.id;
          return (
            <div key={run.id} className={`rounded-2xl border bg-white shadow-sm transition ${active ? "border-emerald-300" : "border-stone-200"}`}>
              {/* رأس المهمة */}
              <button className="flex w-full items-center gap-3 p-4 text-right" onClick={() => setOpenRunId(open ? null : run.id)}>
                <span className="rounded-full border border-stone-200">
                  <EmployeeAvatar skin={run.employee.skin} hair={run.employee.hair} shirt={run.employee.shirt} gender={run.employee.gender} size={40} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-stone-900">{run.mission}</span>
                    <Badge className={st.cls}>{st.label}</Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-stone-500">
                    {run.employee.name} — {run.employee.role} · {(run.steps ?? []).filter((s) => s.status === "done").length}/{(run.steps ?? []).length} خطوات
                    {(run.files ?? []).length > 0 && ` · ${(run.files ?? []).length} ملف جاهز`}
                  </div>
                </div>
                {active && <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />}
              </button>

              {open && (
                <div className="space-y-4 border-t border-stone-100 p-4">
                  {/* الخطة والخطوات */}
                  {(run.steps ?? []).length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-extrabold text-stone-500">الخطة والتنفيذ الفعلي</h4>
                      <div className="space-y-2">
                        {(run.steps ?? []).map((step) => (
                          <div key={step.id} className={`rounded-xl border p-3 ${step.status === "running" ? "border-emerald-300 bg-emerald-50" : step.status === "failed" ? "border-red-200 bg-red-50" : step.status === "done" ? "border-stone-200 bg-stone-50" : "border-dashed border-stone-200 bg-white"}`}>
                            <div className="flex items-center gap-2">
                              {step.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                              {step.status === "running" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />}
                              {step.status === "failed" && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                              {step.status === "pending" && <Circle className="h-4 w-4 shrink-0 text-stone-300" />}
                              <span className="text-sm font-bold text-stone-800">
                                {step.index + 1}. {step.title}
                              </span>
                            </div>
                            {step.output && <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] leading-relaxed text-stone-600 ring-1 ring-stone-100">{step.output}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* اللوجات المباشرة */}
                  {(run.logs ?? []).length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-extrabold text-stone-500">سجل التنفيذ المباشر</h4>
                      <div className="chat-scroll max-h-64 space-y-1 overflow-y-auto rounded-xl bg-stone-900 p-3 font-mono text-[11px] leading-relaxed" dir="rtl">
                        {(run.logs ?? []).slice(-40).map((log) => (
                          <div key={log.id} className={log.level === "error" ? "text-red-400" : log.level === "tool" ? "text-amber-300" : log.level === "result" ? "text-emerald-300" : "text-stone-300"}>
                            {log.level === "tool" && <PlayCircle className="mr-1 inline h-3 w-3" />}
                            {log.text}
                          </div>
                        ))}
                        {active && (
                          <div className="text-stone-500">
                            <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
                            <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />{" "}
                            <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* الملفات */}
                  {(run.files ?? []).length > 0 && (
                    <div>
                      <h4 className="mb-2 text-xs font-extrabold text-stone-500">ملفات التسليم ({(run.files ?? []).length})</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(run.files ?? []).map((f) => (
                          <a
                            key={f.id}
                            href={`/api/files/${f.id}?download=1`}
                            className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 transition hover:border-emerald-500 hover:bg-white"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              {f.mime.startsWith("image/") ? (
                                 
                                <img src={`/api/files/${f.id}`} alt={f.name} className="h-9 w-9 rounded-lg object-cover" />
                              ) : (
                                <FileText className="h-4 w-4 shrink-0 text-emerald-700" />
                              )}
                              <span className="truncate text-xs font-bold text-stone-800">{f.name}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-emerald-800">
                              {Math.ceil(f.size / 1024)}KB
                              <Download className="h-3 w-3" />
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* النتيجة النهائية */}
                  {run.result && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-extrabold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4" />
                        التسليم النهائي
                      </h4>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{run.result}</p>
                      <p className="mt-2 text-[10px] text-stone-400">المهمة مسجلة كمان في تبويب «بانتظارك» عشان توافق عليها رسمياً.</p>
                    </div>
                  )}

                  {run.error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      حصل خطأ: {run.error}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-stone-400">
                    <span>
                      {run.status === "done" ? "خلصت" : "بتشتغل"} عبر:{" "}
                      {run.provider === "zai"
                        ? "المحرك المدمج GLM (مجاني)"
                        : run.provider === "pollinations"
                          ? "محرك مجاني مباشر بدون مفتاح"
                          : `${run.provider}${run.model ? ` (${run.model})` : ""}`}
                    </span>
                    <button
                      onClick={() => deleteRun(run.id)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-stone-400 transition hover:bg-red-50 hover:text-red-600"
                      title="شيل المهمة من السجل"
                    >
                      <Trash2 className="h-3 w-3" />
                      شيل من السجل
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
