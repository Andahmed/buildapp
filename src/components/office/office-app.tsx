"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OfficeMap } from "./office-map";
import { ChatPanel, ChatTarget } from "./chat-panel";
import { MeetingsView } from "./meetings-view";
import { ApprovalsView } from "./approvals-view";
import { OrgChart } from "./org-chart";
import { ToolsView } from "./tools-view";
import { TasksView } from "./tasks-view";
import { KeysView } from "./keys-view";
import { GamesStudio } from "./games-studio";
import { HireDialog } from "./hire-dialog";
import { OfficeData, ActivityItem, timeAgo } from "./types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Code2,
  MessageSquare,
  Presentation,
  ClipboardCheck,
  Network,
  Wrench,
  UserPlus,
  Rocket,
  Users,
  Clipboard,
  Check,
  X,
  Plug,
  Handshake,
  GraduationCap,
  Loader2,
  Menu,
  Bot,
  KeyRound,
  Building2,
  LayoutDashboard,
  LogOut,
  Gamepad2,
} from "lucide-react";

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  rocket: Rocket,
  users: Users,
  clipboard: Clipboard,
  check: Check,
  x: X,
  plug: Plug,
  handshake: Handshake,
  graduation: GraduationCap,
  sparkles: Rocket,
};

type Tab = "office" | "tasks" | "chat" | "meetings" | "approvals" | "org" | "tools" | "keys" | "games";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "office", label: "الشركة", icon: Code2 },
  { id: "tasks", label: "المهام", icon: Bot },
  { id: "chat", label: "الشات", icon: MessageSquare },
  { id: "meetings", label: "الاجتماعات", icon: Presentation },
  { id: "approvals", label: "بانتظارك", icon: ClipboardCheck },
  { id: "org", label: "الهيكل", icon: Network },
  { id: "tools", label: "الأدوات", icon: Wrench },
  { id: "keys", label: "المفاتيح", icon: KeyRound },
  { id: "games", label: "استوديو الألعاب", icon: Gamepad2 },
];

export function OfficeApp() {
  const [data, setData] = useState<OfficeData | null>(null);
  const [tab, setTab] = useState<Tab>("office");
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const [typingMap, setTypingMap] = useState<Record<string, boolean>>({});
  const [hireOpen, setHireOpen] = useState(false);
  const [focusRunId, setFocusRunId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [brain, setBrain] = useState<{ brain: string; provider: string } | null>(null);
  const lastRefresh = useRef(0);

  const refreshOffice = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefresh.current < 800) return;
    lastRefresh.current = now;
    try {
      const res = await fetch("/api/office");
      const json = await res.json();
      setData(json);
    } catch {
      // تجاهل — المحاولة الجاية هتجيب البيانات
    }
  }, []);

  // معترض 401: أي API رجّع «غير مصرح» بنحوله لصفحة الدخول فوراً
  // (انتهت الجلسة أو الأدمن غير دست كلمة السر — مفيش أخطاء غامضة في الشاشة)
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (res.status === 401) window.location.href = "/login";
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // حتى لو فشل الطلب نمسح الكوكي محلياً بالتحويل
    }
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const first = setTimeout(refreshOffice, 50);
    const t = setInterval(refreshOffice, 30000);
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((j) => setBrain({ brain: j.brain as string, provider: j.provider as string }))
      .catch(() => {});
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refreshOffice]);

  const setTyping = useCallback((key: string, typing: boolean) => {
    setTypingMap((prev) => ({ ...prev, [key]: typing }));
  }, []);

  function openChatFromMap(id: string) {
    setChatTarget({ type: "dm", id });
    setTab("chat");
  }

  function goWithMenu(next: Tab) {
    setTab(next);
    setMenuOpen(false);
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f4ec]">
        <div className="flex flex-col items-center gap-3 text-stone-500">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="text-sm font-bold">بيجهز الشركة...</p>
        </div>
      </div>
    );
  }

  const pendingCount = data.tasks.filter((t) => t.status === "awaiting_approval").length;
  const typingIds = data.employees.filter((e) => typingMap[`emp-${e.id}`]).map((e) => e.id);
  const pendingIds = new Set(data.tasks.filter((t) => t.status === "awaiting_approval").map((t) => t.employeeId));

  const MENU_SECTIONS: { title: string; items: { tab: Tab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; desc: string }[] }[] = [
    {
      title: "الشغل اليومي",
      items: [
        { tab: "office", label: "أرضية الشركة", icon: Code2, desc: "الخريطة والموظفين والنشاط" },
        { tab: "tasks", label: "مهام الوكيل", icon: Bot, desc: "تنفيذ حقيقي بأسلوب OpenManus" },
        { tab: "chat", label: "الشات", icon: MessageSquare, desc: "كلمنا أو ارفع ملفات وصور" },
        { tab: "meetings", label: "الاجتماعات", icon: Presentation, desc: "اجتماع في القاعة الكبيرة" },
        { tab: "games", label: "استوديو الألعاب", icon: Gamepad2, desc: "أنشئ ألعاباً وجربها من الموبايل" },
      ],
    },
    {
      title: "الإدارة",
      items: [
        { tab: "approvals", label: "بانتظارك", icon: ClipboardCheck, badge: pendingCount, desc: "التسليمات اللي محتاجة موافقتك" },
        { tab: "org", label: "الهيكل التنظيمي", icon: Network, desc: "شجرة الشركة والأقسام" },
        { tab: "tools", label: "الأدوات المتصلة", icon: Wrench, desc: "بدائل مجانية مفتوحة المصدر" },
        { tab: "keys", label: "مفاتيح الذكاء الاصطناعي", icon: KeyRound, desc: "اربط OpenAI أو Gemini أو غيرهم" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8f4ec] pb-10">
      {/* الهيدر */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* زر المنيو */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm transition hover:border-emerald-500 hover:text-emerald-700"
                  aria-label="قائمة الشركة"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] overflow-y-auto p-0">
                <SheetHeader className="border-b border-stone-100 p-4 text-right">
                  <SheetTitle className="flex items-center gap-2 text-base">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                      <LayoutDashboard className="h-4 w-4" />
                    </span>
                    قائمة الشركة
                  </SheetTitle>
                </SheetHeader>
                <div className="p-3">
                  {MENU_SECTIONS.map((section) => (
                    <div key={section.title} className="mb-4">
                      <p className="mb-1.5 px-2 text-[10px] font-extrabold uppercase tracking-wide text-stone-400">{section.title}</p>
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const active = tab === item.tab;
                        return (
                          <button
                            key={item.tab}
                            onClick={() => goWithMenu(item.tab)}
                            className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-right transition ${active ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-stone-50"}`}
                          >
                            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-600"}`}>
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`flex items-center gap-1.5 text-sm font-bold ${active ? "text-emerald-800" : "text-stone-800"}`}>
                                {item.label}
                                {item.badge ? (
                                  <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-extrabold text-white">{item.badge}</span>
                                ) : null}
                              </span>
                              <span className="block truncate text-[10px] text-stone-400">{item.desc}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div className="rounded-xl border border-dashed border-stone-200 p-3">
                    <Button size="sm" onClick={() => { setMenuOpen(false); setHireOpen(true); }} className="w-full bg-emerald-600 hover:bg-emerald-700">
                      <UserPlus className="h-4 w-4" />
                      وظّف مطور جديد
                    </Button>
                    <p className="mt-2 text-center text-[10px] text-stone-400">شركة كود ذكي للتطوير البرمجي — 2026</p>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow">
              <Code2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-extrabold leading-tight text-stone-900 md:text-lg">شركة كود ذكي للتطوير البرمجي</h1>
              <p className="text-[11px] text-stone-500">شركة برمجة فريقها كله موظفين ذكاء اصطناعي — انت الرئيس التنفيذي</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {brain && (
              <button onClick={() => setTab("keys")} title="العقل اللي بيخدم الردود دلوقتي — دوس عشان تفتح إعدادات المفاتيح">
                <Badge variant="secondary" className="max-w-[220px] truncate bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
                  <span className="relative mr-1 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
                  </span>
                  العقل: {brain.brain}
                </Badge>
              </button>
            )}
            <Badge variant="secondary" className="bg-stone-100 text-stone-700">
              {data.employees.length} مهندس وموظف AI
            </Badge>
            {pendingCount > 0 && (
              <button onClick={() => setTab("approvals")}>
                <Badge className="animate-pulse bg-amber-500 text-white">
                  {pendingCount} بانتظار موافقتك
                </Badge>
              </button>
            )}
            {data.activeMeeting && (
              <button onClick={() => setTab("meetings")}>
                <Badge className="animate-pulse bg-emerald-600 text-white">ميتنج شغال</Badge>
              </button>
            )}
            <Button size="sm" onClick={() => setHireOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <UserPlus className="h-4 w-4" />
              وظّف مطور
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={logout}
              className="border-stone-300 text-stone-600 hover:bg-stone-50"
              title="قفل الجلسة والخروج"
            >
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>

        {/* التبويبات */}
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2" aria-label="أقسام الشركة">
          <div className="flex gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                    active ? "bg-stone-900 text-white shadow" : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {t.id === "approvals" && pendingCount > 0 && (
                    <span className={`rounded-full px-1.5 text-[10px] font-extrabold ${active ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-800"}`}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pt-5">
        {tab === "office" && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <OfficeMap
                employees={data.employees}
                meetingParticipantIds={data.activeMeeting?.participantIds ?? []}
                typingIds={typingIds}
                hasPendingTaskIds={pendingIds}
                onOpenChat={openChatFromMap}
                onOpenHire={() => setHireOpen(true)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("tasks")}
                  className="border-stone-900 text-stone-900 hover:bg-stone-100"
                >
                  <Bot className="h-4 w-4" />
                  شغّل مهمة حقيقية بمحرك OpenManus
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("meetings")}
                  className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                >
                  <Presentation className="h-4 w-4" />
                  ابدأ اجتماع في قاعة الاجتماعات
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab("chat")} className="border-stone-300 text-stone-700">
                  <MessageSquare className="h-4 w-4" />
                  شات الفريق
                </Button>
              </div>
            </div>

            {/* الشريط الجانبي: النشاط والتدريب */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                <h3 className="mb-3 text-sm font-extrabold text-stone-800">آخر نشاط في الشركة</h3>
                <ActivityFeed activities={data.activities} />
              </div>
              {data.trainings.length > 0 && (
                <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-extrabold text-stone-800">تدريبات نور الأخيرة</h3>
                  <div className="space-y-1.5">
                    {data.trainings.slice(0, 4).map((t) => (
                      <div key={t.id} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px]">
                        <span className="font-bold text-stone-700">{t.employee?.name}</span>
                        <span className="mx-1 rounded-full bg-amber-200 px-1.5 text-[10px] font-bold text-amber-900">{t.skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-4 text-xs leading-relaxed text-stone-500">
                <b className="text-stone-700">نصيحة:</b> من تبويب «المهام» تقدر تعطي أي مهندس مهمة حقيقية بيتنفذ فعلاً — بحث ويب، تشغيل كود، ملفات جاهزة للتحميل.
                ومن «الشات» ارفق ملفات وصور وكلمنا عادي.
              </div>
            </aside>
          </div>
        )}

        {tab === "tasks" && <TasksView employees={data.employees} focusRunId={focusRunId} />}

        {tab === "chat" && (
          <ChatPanel
            employees={data.employees}
            target={chatTarget}
            onTargetChange={setChatTarget}
            onTypingChange={setTyping}
            refreshOffice={refreshOffice}
            onAgentStarted={(runId) => {
              setFocusRunId(runId);
              setTab("tasks");
            }}
          />
        )}

        {tab === "meetings" && (
          <MeetingsView employees={data.employees} activeMeeting={data.activeMeeting} refreshOffice={refreshOffice} />
        )}

        {tab === "approvals" && <ApprovalsView tasks={data.tasks} refreshOffice={refreshOffice} />}

        {tab === "org" && <OrgChart employees={data.employees} onOpenChat={openChatFromMap} />}

        {tab === "tools" && (
          <ToolsView
            tools={data.tools}
            employees={data.employees}
            trainings={data.trainings}
            refreshOffice={refreshOffice}
            onOpenHire={() => setHireOpen(true)}
          />
        )}

        {tab === "keys" && <KeysView />}\n\n        {tab === "games" && <GamesStudio />}
      </main>

      <HireDialog
        open={hireOpen}
        onClose={() => setHireOpen(false)}
        refreshOffice={refreshOffice}
        onHired={() => {}}
      />
    </div>
  );
}

function ActivityFeed({ activities }: { activities: ActivityItem[] }) {
  if (activities.length === 0) {
    return <p className="text-xs text-stone-400">مفيش نشاط لسه — ابدأ كلّم الفريق</p>;
  }
  return (
    <div className="chat-scroll max-h-80 space-y-2 overflow-y-auto">
      {activities.map((a) => {
        const Icon = ACTIVITY_ICONS[a.icon] ?? Rocket;
        return (
          <div key={a.id} className="flex items-start gap-2 rounded-lg bg-stone-50 px-2.5 py-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <Icon className="h-3 w-3 text-emerald-700" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] leading-snug text-stone-700">{a.text}</p>
              <p className="text-[9px] text-stone-400">{timeAgo(a.createdAt)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
