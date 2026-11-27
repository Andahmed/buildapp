"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmployeeAvatar } from "./avatar";
import { Employee, Msg, DEPT_LABELS, DEPT_COLORS } from "./types";
import { playTTS } from "./use-speech";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Volume2, Loader2, Users, MessagesSquare, Paperclip, X, Bot, FileText, Download } from "lucide-react";

export interface ChatTarget {
  type: "dm" | "team";
  id?: string;
}

interface AttachmentMeta {
  id: string;
  name: string;
  mime: string;
  url?: string;
}

const DM_SUGGESTIONS = [
  "إيه أخبار الشغل النهاردة؟",
  "اعطني تقرير سريع بحالة شغلك",
  "اقترح علي فكرة تحسّن منتجنا",
];
const TEAM_SUGGESTIONS = [
  "إيه خطة الشغل النهاردة يا فريق؟",
  "حد عنده اقتراح للمشروع الجديد؟",
  "ملخص سريع من كل قسم",
];

interface ChatPanelProps {
  employees: Employee[];
  target: ChatTarget | null;
  onTargetChange: (t: ChatTarget | null) => void;
  onTypingChange: (key: string, typing: boolean) => void;
  refreshOffice: () => void;
  onAgentStarted?: (runId: string) => void;
}

/** قراءة استجابة SSE سطر سطر — بترجع events جاهزة للمعالجة */
async function* sseEvents(res: Response): AsyncGenerator<{ event: string; data: any }> {
  if (!res.body) throw new Error("الاستجابة مش بتدعم البث المباشر");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let curEvent = "message";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      const t = line.trim();
      if (!t) {
        curEvent = "message";
        continue;
      }
      if (t.startsWith("event:")) {
        curEvent = t.slice(6).trim();
      } else if (t.startsWith("data:")) {
        const payload = t.slice(5).trim();
        let data: any = payload;
        try {
          data = JSON.parse(payload);
        } catch {
          // نص عادي
        }
        yield { event: curEvent, data };
      }
    }
  }
}

function parseAttachments(m: Msg): AttachmentMeta[] {
  try {
    const raw = (m as unknown as { attachments?: string | AttachmentMeta[] }).attachments;
    if (!raw) return [];
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function ChatPanel({ employees, target, onTargetChange, onTypingChange, refreshOffice, onAgentStarted }: ChatPanelProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamProvider, setStreamProvider] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = target?.type === "dm" ? employees.find((e) => e.id === target.id) ?? null : null;
  const isTeam = target?.type === "team";

  const scrollBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 60);
  }, []);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    const url = target.type === "team" ? "/api/chat/team" : `/api/chat/dm?employeeId=${target.id}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setMessages(json.messages ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
        scrollBottom();
      });
    return () => {
      cancelled = true;
    };
  }, [target, scrollBottom]);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: AttachmentMeta[] = [];
      for (const f of Array.from(files).slice(0, 3)) {
        const form = new FormData();
        form.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "فشل الرفع");
        uploaded.push(json.file);
      }
      setAttachments((prev) => [...prev, ...uploaded].slice(0, 4));
    } catch (err) {
      toast({ title: "فشل رفع الملف", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function send(text?: string, opts?: { runAsAgent?: boolean }) {
    const content = (text ?? input).trim();
    const hasAttach = attachments.length > 0;
    if ((!content && !hasAttach) || sending || !target) return;
    setInput("");
    const sentAttachments = [...attachments];
    setAttachments([]);
    setSending(true);
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`,
      channel: target.type,
      role: "ceo",
      senderName: "أنت",
      content: content || "(مرفق)",
      createdAt: new Date().toISOString(),
      attachments: sentAttachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime })) as never,
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollBottom();
    const typingKey = target.type === "dm" ? `emp-${target.id}` : "team";
    onTypingChange(typingKey, true);

    try {
      if (target.type === "dm") {
        const res = await fetch("/api/chat/dm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: target.id,
            content,
            attachmentIds: sentAttachments.map((a) => a.id),
            runAsAgent: opts?.runAsAgent ?? false,
            stream: !(opts?.runAsAgent ?? false),
          }),
        });

        // وضع الوكيل — JSON عادي
        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "error");
          setMessages((prev) => [
            ...prev,
            {
              id: `r-${Date.now()}`,
              channel: "dm",
              role: "employee",
              senderName: selected?.name ?? "",
              content: `يا فندم، استلمت المهمة وبشتغل عليها دلوقتي بمحرك OpenManus (خطة → أدوات → تسليم). تابع التقدم لحظة بلحظة من تبويب «المهام» — والمخرجات والملفات هتوصلك هناك جاهزة للتحميل.`,
              createdAt: new Date().toISOString(),
            },
          ]);
          toast({ title: "الوكيل بدأ التنفيذ", description: "تابع التقدم في تبويب المهام" });
          onAgentStarted?.(json.agentRunId);
          scrollBottom();
          return;
        }

        // ===== البث المباشر — الرد بيتكتب قدامك لحظة بلحظة =====
        if (!res.ok) throw new Error("فشل الاتصال");
        let streamed = "";
        for await (const ev of sseEvents(res)) {
          if (ev.event === "meta") {
            setStreamProvider(ev.data?.provider ?? "");
          } else if (ev.event === "delta") {
            streamed += ev.data?.text ?? "";
            setStreamingText(streamed);
            scrollBottom();
          } else if (ev.event === "done") {
            const reply: string = ev.data?.reply ?? streamed;
            setMessages((prev) => [
              ...prev,
              {
                id: `r-${Date.now()}`,
                channel: "dm",
                role: "employee",
                senderName: selected?.name ?? "",
                content: reply,
                createdAt: new Date().toISOString(),
                provider: ev.data?.provider ?? "",
                model: ev.data?.model ?? "",
              },
            ]);
            setStreamingText("");
            setStreamProvider("");
          } else if (ev.event === "task") {
            toast({ title: "شغل جديد بانتظارك", description: `${selected?.name} سلّم «${ev.data?.task ?? "مهمة"}» — شوفها في تبويب بانتظارك` });
            refreshOffice();
          } else if (ev.event === "error") {
            throw new Error(ev.data?.error || "فشل البث");
          }
        }
        if (!streamed.trim()) throw new Error("الرد طلع فاضي — جرب تاني");
      } else {
        const res = await fetch("/api/chat/team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, stream: true }),
        });
        if (!res.ok && !(res.headers.get("content-type") ?? "").includes("event-stream")) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "error");
        }
        let streamed = "";
        for await (const ev of sseEvents(res)) {
          if (ev.event === "meta") {
            setStreamProvider(ev.data?.provider ?? "");
          } else if (ev.event === "delta") {
            streamed += ev.data?.text ?? "";
            setStreamingText(streamed);
            scrollBottom();
          } else if (ev.event === "reply") {
            setMessages((prev) => [
              ...prev,
              {
                id: `r-${Math.random()}`,
                channel: "team",
                role: "employee",
                senderName: ev.data?.senderName,
                content: ev.data?.content,
                createdAt: new Date().toISOString(),
                provider: ev.data?.provider ?? "",
                model: ev.data?.model ?? "",
              },
            ]);
            setStreamingText("");
            scrollBottom();
            if (ev.data?.taskCreated) refreshOffice();
          } else if (ev.event === "done") {
            setStreamingText("");
            setStreamProvider("");
            if ((ev.data?.count ?? 0) > 0) refreshOffice();
          } else if (ev.event === "error") {
            throw new Error(ev.data?.error || "فشل البث");
          }
        }
        if (!streamed.trim()) throw new Error("الفريق مش رد — جرب تاني");
      }
    } catch (err) {
      toast({
        title: "حصلت مشكلة",
        description: err instanceof Error ? err.message : "جرب تاني",
        variant: "destructive",
      });
    } finally {
      setSending(false);
      setStreamingText("");
      setStreamProvider("");
      onTypingChange(typingKey, false);
      scrollBottom();
    }
  }

  async function speak(m: Msg) {
    if (playingId) return;
    setPlayingId(m.id);
    try {
      await playTTS(m.content, selected?.gender ?? "male");
    } catch {
      toast({ title: "الصوت مش متاح دلوقتي", variant: "destructive" });
    } finally {
      setPlayingId(null);
    }
  }

  function renderAttachments(msg: Msg, mine: boolean) {
    const atts = parseAttachments(msg);
    if (atts.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {atts.map((a) => {
          const url = a.url ?? `/api/files/${a.id}`;
          if (a.mime?.startsWith("image/")) {
            return (
              <a key={a.id} href={url} target="_blank" rel="noopener noreferrer">
                { }
                <img
                  src={url}
                  alt={a.name}
                  className="h-28 max-w-[220px] rounded-xl border border-stone-300 object-cover shadow-sm transition hover:scale-[1.02]"
                />
              </a>
            );
          }
          return (
            <a
              key={a.id}
              href={`${url}?download=1`}
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold shadow-sm transition hover:scale-[1.02] ${
                mine ? "border-emerald-400 bg-emerald-500/20 text-white" : "border-stone-300 bg-white text-stone-700"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              {a.name}
              <Download className="h-3 w-3" />
            </a>
          );
        })}
      </div>
    );
  }

  // ===== قائمة المحادثات (للموبايل والديسكتوب) =====
  function ConversationList() {
    return (
      <div className={`chat-scroll overflow-y-auto md:h-[calc(100vh-190px)] ${target ? "hidden md:block" : "block"}`}>
        <button
          onClick={() => onTargetChange({ type: "team" })}
          className={`flex w-full items-center gap-3 border-b border-stone-100 p-3 text-right transition hover:bg-amber-50 ${isTeam ? "bg-amber-50" : ""}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
            <Users className="h-5 w-5 text-amber-700" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-stone-800">شات الفريق</span>
            <span className="block text-xs text-stone-500">كل الموظفين في جروب واحد</span>
          </span>
        </button>
        {employees.map((e) => (
          <button
            key={e.id}
            onClick={() => onTargetChange({ type: "dm", id: e.id })}
            className={`flex w-full items-center gap-3 border-b border-stone-100 p-3 text-right transition hover:bg-amber-50 ${target?.type === "dm" && target.id === e.id ? "bg-amber-50" : ""}`}
          >
            <span className="rounded-full border border-stone-200 bg-white">
              <EmployeeAvatar skin={e.skin} hair={e.hair} shirt={e.shirt} gender={e.gender} size={44} />
            </span>
            <span className="flex-1 overflow-hidden">
              <span className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-stone-800">{e.name}</span>
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ backgroundColor: DEPT_COLORS[e.dept] ?? "#78716c" }}>
                  {DEPT_LABELS[e.dept]}
                </span>
              </span>
              <span className="block truncate text-xs text-stone-500">{e.role}</span>
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[300px_1fr]">
      {/* القائمة */}
      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <ConversationList />
      </div>

      {/* المحادثة */}
      <div className={`flex min-h-[420px] flex-col rounded-2xl border border-stone-200 bg-white shadow-sm md:h-[calc(100vh-190px)] ${target ? "flex" : "hidden md:flex"}`}>
        {!target || (!selected && !isTeam) ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-stone-400">
            <MessagesSquare className="h-10 w-10" />
            <p className="text-sm font-semibold">اختار موظف أو شات الفريق وابدأ اتكلم</p>
          </div>
        ) : (
          <>
            {/* هيدر المحادثة */}
            <div className="flex items-center gap-3 border-b border-stone-100 p-3">
              <button
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 md:hidden"
                onClick={() => onTargetChange(null)}
                aria-label="رجوع"
              >
                →
              </button>
              {isTeam ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                  <Users className="h-5 w-5 text-amber-700" />
                </span>
              ) : (
                selected && (
                  <span className="rounded-full border border-stone-200">
                    <EmployeeAvatar skin={selected.skin} hair={selected.hair} shirt={selected.shirt} gender={selected.gender} size={40} />
                  </span>
                )
              )}
              <div className="flex-1">
                <div className="text-sm font-bold text-stone-800">{isTeam ? "شات الفريق" : `${selected?.name} — ${selected?.role}`}</div>
                <div className="text-[11px] text-emerald-600">{sending ? "بيكتب..." : "متصل"}</div>
              </div>
              {!isTeam && (
                <Button
                  size="sm"
                  onClick={() => send(input.trim() || "نفّذ المهمة دي كاملة وسلّم الشغل جاهز", { runAsAgent: true })}
                  disabled={sending}
                  title="تنفيذ حقيقي بمحرك OpenManus: خطة → أدوات → ملفات جاهزة"
                  className="bg-stone-900 hover:bg-stone-800"
                >
                  <Bot className="h-4 w-4" />
                  نفّذ كمهمة
                </Button>
              )}
            </div>

            {/* الرسائل */}
            <div ref={scrollRef} className="chat-scroll flex-1 space-y-2.5 overflow-y-auto bg-[#faf6ee] p-4">
              {loading && <div className="text-center text-xs text-stone-400">بيجيب المحادثة...</div>}
              {!loading && messages.length === 0 && (
                <div className="pt-8 text-center text-xs text-stone-400">
                  مفيش رسايل لسه — ابدأ الكلام أو ارفع ملف وصورة
                </div>
              )}
              {messages.map((m) => {
                const mine = m.role === "ceo";
                return (
                  <div key={m.id} className={`pop-in flex ${mine ? "justify-start" : "justify-end"} flex-row`}>
                    {/* في RTL: justify-start = يمين */}
                    <div className={`max-w-[85%] lg:max-w-[70%] ${mine ? "items-start" : "items-end"} flex flex-col gap-1`}>
                      {!mine && isTeam && (
                        <span className="px-1 text-[10px] font-bold text-stone-500">{m.senderName}</span>
                      )}
                      {renderAttachments(m, mine)}
                      <div className={`flex items-end gap-1.5 ${mine ? "flex-row" : "flex-row-reverse"}`}>
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                            mine
                              ? "rounded-tl-md bg-emerald-600 text-white"
                              : "rounded-tr-md border border-stone-200 bg-white text-stone-800"
                          }`}
                        >
                          {m.content}
                        </div>
                        {!mine && (
                          <button
                            onClick={() => speak(m)}
                            className="text-stone-400 transition hover:text-emerald-600"
                            title="اسمع الرد"
                            aria-label="اسمع الرد"
                          >
                            {playingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                      {!mine && m.provider && m.provider !== "unknown" && (
                        <span className="px-1 text-[9px] text-stone-400" dir="ltr">
                          عبر {m.provider}{m.model ? ` • ${m.model}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {sending && !streamingText && (
                <div className="flex justify-end">
                  <div className="flex gap-1 rounded-2xl border border-stone-200 bg-white px-3 py-2.5 shadow-sm">
                    <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-stone-400" />
                    <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-stone-400" />
                    <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-stone-400" />
                  </div>
                </div>
              )}
              {sending && streamingText && (
                <div className="pop-in flex justify-end">
                  <div className="max-w-[85%] lg:max-w-[70%] flex flex-col items-end gap-1">
                    {isTeam && <span className="px-1 text-[10px] font-bold text-stone-400">الفريق بيكتب...</span>}
                    <div className="rounded-2xl rounded-tr-md border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap shadow-sm text-stone-800">
                      {streamingText}
                      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-emerald-600 align-middle" />
                    </div>
                    {streamProvider && (
                      <span className="px-1 text-[9px] text-stone-400">عبر {streamProvider}</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* اقتراحات + الإدخال */}
            <div className="border-t border-stone-100 p-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(isTeam ? TEAM_SUGGESTIONS : [...DM_SUGGESTIONS, "كمّل الشغل وابعتلي النتيجة النهائية"]).map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={sending}
                    className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600 transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* معاينة المرفقات */}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {attachments.map((a) => (
                    <span key={a.id} className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 py-1 pl-1 pr-2.5 text-[11px] font-bold text-stone-700">
                      {a.mime.startsWith("image/") ? (
                         
                        <img src={a.url ?? `/api/files/${a.id}`} alt={a.name} className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-stone-500" />
                      )}
                      <span className="max-w-[120px] truncate">{a.name}</span>
                      <button
                        onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                        className="rounded-full p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                        aria-label="شيل المرفق"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.csv,.json,.py,.js,.ts,.html,.css,.doc,.docx,.xls,.xlsx,.zip"
                  className="hidden"
                  onChange={(e) => uploadFiles(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || uploading}
                  className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white px-2.5 text-stone-500 transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
                  title="ارفع ملف أو صورة (لحد 8 ميجا)"
                  aria-label="ارفع ملف"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                  placeholder={isTeam ? "اكتب للفريق كله..." : selected ? `اكتب لـ ${selected.name}... أو ارفق ملف/صورة` : ""}
                  disabled={sending}
                />
                <Button onClick={() => send()} disabled={sending || (!input.trim() && attachments.length === 0)} className="bg-emerald-600 hover:bg-emerald-700">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
