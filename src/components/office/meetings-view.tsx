"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmployeeAvatar } from "./avatar";
import { Employee, MeetingItem, Msg } from "./types";
import { useSpeech, playTTS } from "./use-speech";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Send, Loader2, Volume2, PhoneOff, Presentation, FileText } from "lucide-react";

interface MeetingsViewProps {
  employees: Employee[];
  activeMeeting: MeetingItem | null;
  refreshOffice: () => void;
}

export function MeetingsView({ employees, activeMeeting, refreshOffice }: MeetingsViewProps) {
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { listening, supported, start, stop } = useSpeech();

  const participants = activeMeeting
    ? employees.filter((e) => activeMeeting.participantIds.includes(e.id))
    : [];

  const scrollBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 60);
  }, []);

  useEffect(() => {
    if (!activeMeeting) {
      setMessages([]);
      return;
    }
    fetch(`/api/meetings/message?meetingId=${activeMeeting.id}`)
      .then((r) => r.json())
      .then((json) => setMessages(json.messages ?? []))
      .catch(() => {});
  }, [activeMeeting]);

  async function startMeeting() {
    if (!topic.trim() || selectedIds.length === 0) return;
    setStarting(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), participantIds: selectedIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTopic("");
      setSelectedIds([]);
      refreshOffice();
      toast({ title: "الاجتماع بدأ", description: "الفريق دخل قاعة الاجتماعات" });
    } catch (err) {
      toast({ title: "حصلت مشكلة", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function sendMeetingMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending || !activeMeeting) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}`, channel: "meeting", role: "ceo", senderName: "أنت", content, createdAt: new Date().toISOString() },
    ]);
    scrollBottom();
    try {
      const res = await fetch("/api/meetings/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: activeMeeting.id, content, stream: true }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("event-stream")) {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        for (const r of json.replies ?? []) {
          setMessages((prev) => [
            ...prev,
            { id: `m-${Math.random()}`, channel: "meeting", role: "employee", senderName: r.senderName, content: r.content, createdAt: new Date().toISOString() },
          ]);
          if (autoSpeak) {
            const emp = participants.find((p) => p.name === r.senderName);
            playTTS(r.content, emp?.gender ?? "male").catch(() => {});
          }
          if (r.taskCreated) refreshOffice();
        }
        scrollBottom();
        return;
      }
      // ===== البث المباشر =====
      if (!res.body) throw new Error("البث مش متاح");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let curEvent = "message";
      let streamed = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const line of parts) {
          const t = line.trim();
          if (!t) { curEvent = "message"; continue; }
          if (t.startsWith("event:")) { curEvent = t.slice(6).trim(); continue; }
          if (!t.startsWith("data:")) continue;
          let data: any = t.slice(5).trim();
          try { data = JSON.parse(data); } catch {}
          if (curEvent === "delta") {
            streamed += data?.text ?? "";
            setStreamingText(streamed);
            scrollBottom();
          } else if (curEvent === "reply") {
            setMessages((prev) => [
              ...prev,
              { id: `m-${Math.random()}`, channel: "meeting", role: "employee", senderName: data?.senderName, content: data?.content, createdAt: new Date().toISOString() },
            ]);
            setStreamingText("");
            scrollBottom();
            if (autoSpeak) {
              const emp = participants.find((p) => p.name === data?.senderName);
              playTTS(data?.content ?? "", emp?.gender ?? "male").catch(() => {});
            }
            if (data?.taskCreated) refreshOffice();
          } else if (curEvent === "error") {
            throw new Error(data?.error || "فشل البث");
          }
        }
      }
    } catch (err) {
      toast({ title: "حصلت مشكلة", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSending(false);
      setStreamingText("");
      scrollBottom();
    }
  }

  async function endMeeting() {
    if (!activeMeeting) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/meetings?meetingId=${activeMeeting.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      refreshOffice();
      toast({ title: "الاجتماع انتهى", description: "التلخيص اتحفظ في سجل الاجتماعات" });
    } catch (err) {
      toast({ title: "حصلت مشكلة", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEnding(false);
    }
  }

  function handleMic() {
    if (listening) {
      stop();
      return;
    }
    start((t) => setInput((prev) => (prev ? `${prev} ${t}` : t)));
  }

  async function speak(m: Msg) {
    if (playingId) return;
    setPlayingId(m.id);
    try {
      const emp = participants.find((p) => p.name === m.senderName);
      await playTTS(m.content, emp?.gender ?? "male");
    } catch {
      toast({ title: "الصوت مش متاح دلوقتي", variant: "destructive" });
    } finally {
      setPlayingId(null);
    }
  }

  // ===== اجتماع شغال =====
  if (activeMeeting) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-4">
            <div className="flex items-center gap-2">
              <Badge className="animate-pulse bg-emerald-600 text-white">ميتنج شغال</Badge>
              <h3 className="font-bold text-stone-800">{activeMeeting.topic}</h3>
            </div>
            <Button onClick={endMeeting} disabled={ending} variant="destructive" size="sm">
              {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
              إنهاء الاجتماع
            </Button>
          </div>

          {/* المشاركين حول الطاولة */}
          <div className="flex flex-wrap items-end justify-center gap-5 bg-[#f5efe4] px-4 py-6">
            {participants.map((p) => (
              <div key={p.id} className="flex flex-col items-center">
                <span className="rounded-full border-2 border-emerald-500 bg-white p-1 shadow-md employee-meeting">
                  <EmployeeAvatar skin={p.skin} hair={p.hair} shirt={p.shirt} gender={p.gender} size={46} />
                </span>
                <span className="mt-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-700 shadow-sm">{p.name}</span>
              </div>
            ))}
          </div>

          {/* الرسائل */}
          <div ref={scrollRef} className="chat-scroll h-72 space-y-2.5 overflow-y-auto border-t border-stone-100 bg-[#faf6ee] p-4">
            {messages.map((m) => {
              const mine = m.role === "ceo";
              return (
                <div key={m.id} className={`pop-in flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className="flex max-w-[85%] flex-col gap-1">
                    {!mine && <span className="px-1 text-[10px] font-bold text-stone-500">{m.senderName}</span>}
                    <div className={`flex items-end gap-1.5 ${mine ? "flex-row" : "flex-row-reverse"}`}>
                      <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${mine ? "rounded-tl-md bg-emerald-600 text-white" : "rounded-tr-md border border-stone-200 bg-white text-stone-800"}`}>
                        {m.content}
                      </div>
                      {!mine && (
                        <button onClick={() => speak(m)} className="text-stone-400 hover:text-emerald-600" title="اسمع">
                          {playingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {sending && !streamingText && (
              <div className="flex justify-end">
                <div className="flex gap-1 rounded-2xl border border-stone-200 bg-white px-3 py-2.5">
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
                  <span className="typing-dot h-1.5 w-1.5 rounded-full bg-stone-400" />
                </div>
              </div>
            )}
            {sending && streamingText && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-md border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap text-stone-800">
                  {streamingText}
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-emerald-600 align-middle" />
                </div>
              </div>
            )}
          </div>

          {/* الإدخال + المايك */}
          <div className="space-y-2 border-t border-stone-100 p-3">
            <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-stone-500">
              <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} className="accent-emerald-600" />
              افتح مايك الموظفين (الردود بصوت عالي)
            </label>
            <div className="flex gap-2">
              <Button
                onClick={handleMic}
                disabled={!supported}
                size="icon"
                className={listening ? "animate-pulse bg-red-600 hover:bg-red-700" : "bg-stone-200 text-stone-700 hover:bg-stone-300"}
                title={supported ? "اتكلم في المايك" : "المايك مش مدعوم في المتصفح ده"}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMeetingMessage()} placeholder={listening ? "بتسمعك..." : "اتكلم مع المشاركين..."} disabled={sending} />
              <Button onClick={() => sendMeetingMessage()} disabled={sending || !input.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {!supported && <p className="text-[11px] text-stone-400">المايك مدعوم على Chrome — لكن تقدر تكتب عادي.</p>}
          </div>
        </div>
      </div>
    );
  }

  // ===== بدء اجتماع جديد =====
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Presentation className="h-5 w-5 text-emerald-700" />
          <h3 className="font-bold text-stone-800">ابدأ اجتماع في قاعة الاجتماعات</h3>
        </div>
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="موضوع الاجتماع — مثال: خطة حملة شهر ديسمبر"
          className="mb-4"
        />
        <p className="mb-2 text-xs font-semibold text-stone-500">اختار المشاركين (لحد 5):</p>
        <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {employees.map((e) => {
            const on = selectedIds.includes(e.id);
            return (
              <button
                key={e.id}
                onClick={() => setSelectedIds((prev) => (on ? prev.filter((i) => i !== e.id) : prev.length >= 5 ? prev : [...prev, e.id]))}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition ${on ? "border-emerald-500 bg-emerald-50" : "border-stone-200 bg-white hover:border-stone-300"}`}
              >
                <EmployeeAvatar skin={e.skin} hair={e.hair} shirt={e.shirt} gender={e.gender} size={36} />
                <span className="max-w-full truncate text-[10px] font-bold text-stone-700">{e.name}</span>
              </button>
            );
          })}
        </div>
        <Button onClick={startMeeting} disabled={!topic.trim() || selectedIds.length === 0 || starting} className="bg-emerald-600 hover:bg-emerald-700">
          {starting && <Loader2 className="h-4 w-4 animate-spin" />}
          ابدأ الاجتماع ({selectedIds.length} مشاركين)
        </Button>
      </div>

      <PastMeetings />
    </div>
  );
}

function PastMeetings() {
  const [meetings, setMeetings] = useState<(MeetingItem & { summary?: string | null })[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((json) => setMeetings(json.meetings ?? []))
      .catch(() => {});
  }, []);

  if (meetings.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-5 w-5 text-stone-500" />
        <h3 className="font-bold text-stone-800">سجل الاجتماعات</h3>
      </div>
      <div className="space-y-2">
        {meetings.map((m) => (
          <div key={m.id} className="rounded-xl border border-stone-100 bg-stone-50 p-3">
            <button className="flex w-full items-center justify-between text-right" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
              <span className="text-sm font-bold text-stone-700">{m.topic}</span>
              <Badge variant={m.status === "active" ? "default" : "secondary"} className={m.status === "active" ? "bg-emerald-600" : ""}>
                {m.status === "active" ? "شغال" : "خلص"}
              </Badge>
            </button>
            {expanded === m.id && m.summary && (
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">{m.summary}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
