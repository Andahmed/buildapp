"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Gamepad2, Sparkles, Loader2, Download, RefreshCw, Trash2, WandSparkles, Plus, Play, Code2, History } from "lucide-react";

type GameSummary = { id: string; title: string; prompt: string; createdAt: string; updatedAt: string; versions: { version: number }[] };
type GameProject = { id: string; title: string; prompt: string; html: string; createdAt?: string; updatedAt?: string };

const IDEAS = [
  "لعبة منصات ثنائية الأبعاد، اجمع النجوم وتجنب العقبات",
  "لعبة ذاكرة عربية لقلب البطاقات ومطابقة الأزواج",
  "لعبة سباق سيارات من أعلى الشاشة مع تحكم باللمس",
];

export function GamesStudio() {
  const [projects, setProjects] = useState<GameSummary[]>([]);
  const [active, setActive] = useState<GameProject | null>(null);
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/games");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحميل المشاريع");
      setProjects(json.projects || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل المشاريع");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  async function createGame() {
    if (prompt.trim().length < 8) { setError("اكتب وصف اللعبة بشكل أوضح."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, title }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل إنشاء اللعبة");
      setActive(json.project); setTitle(""); setPrompt(""); setShowCode(false); setNotice("اتعملت اللعبة واتحفظ الإصدار الأول.");
      await loadProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : "حصل خطأ أثناء الإنشاء");
    } finally { setBusy(false); }
  }

  async function openGame(id: string) {
    setError(""); setNotice("");
    try {
      const res = await fetch(`/api/games/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر فتح اللعبة");
      setActive(json.project); setShowCode(false); setPreviewKey((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر فتح اللعبة"); }
  }

  async function refineGame() {
    if (!active || editPrompt.trim().length < 4) { setError("اكتب التعديل المطلوب."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/games/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: editPrompt }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "فشل تعديل اللعبة");
      setActive(json.project); setEditPrompt(""); setShowCode(false); setPreviewKey((v) => v + 1);
      setNotice(`تم حفظ التعديل كالإصدار ${json.version}.`);
      await loadProjects();
    } catch (e) { setError(e instanceof Error ? e.message : "فشل تعديل اللعبة"); }
    finally { setBusy(false); }
  }

  async function deleteGame(id: string) {
    if (!window.confirm("متأكد إنك عايز تحذف المشروع وكل إصداراته؟")) return;
    const res = await fetch(`/api/games/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("تعذر حذف المشروع."); return; }
    if (active?.id === id) setActive(null);
    setNotice("تم حذف المشروع.");
    await loadProjects();
  }

  return (
    <div dir="rtl" className="space-y-4 pb-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4 text-white shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"><Gamepad2 className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">استوديو الألعاب</h2><Badge className="border-emerald-300/20 bg-emerald-400/15 text-emerald-200">نسخة تجريبية</Badge></div>
            <p className="mt-1 text-sm leading-6 text-slate-300">اكتب فكرتك، وخلّي محرك الذكاء الاصطناعي يبني لعبة HTML5 تقدر تجربها وتطوّرها من الموبايل.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2"><Sparkles className="mx-auto mb-1 h-4 w-4 text-emerald-300" />إنشاء بالوصف</div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2"><Play className="mx-auto mb-1 h-4 w-4 text-emerald-300" />معاينة فورية</div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-2"><History className="mx-auto mb-1 h-4 w-4 text-emerald-300" />إصدارات محفوظة</div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}<button className="mr-2 font-bold underline" onClick={() => setError("")}>إغلاق</button></div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {!active ? (
            <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center gap-2"><WandSparkles className="h-5 w-5 text-emerald-600" /><h3 className="font-extrabold text-stone-900">ابدأ لعبة جديدة</h3></div>
              <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="game-title">اسم اللعبة (اختياري)</label>
              <Input id="game-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: مغامرة الكنز" maxLength={80} className="mb-3" />
              <label className="mb-1.5 block text-xs font-bold text-stone-600" htmlFor="game-prompt">وصف اللعبة</label>
              <Textarea id="game-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="اوصف اللعبة: نوعها، طريقة اللعب، الشخصية، الهدف، الألوان..." rows={5} maxLength={4000} className="resize-y" />
              <div className="mt-2 flex flex-wrap gap-2">
                {IDEAS.map((idea) => <button key={idea} onClick={() => setPrompt(idea)} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-600 hover:border-emerald-300 hover:text-emerald-700">+ فكرة جاهزة</button>)}
              </div>
              <Button onClick={createGame} disabled={busy || prompt.trim().length < 8} className="mt-4 h-11 w-full bg-emerald-600 font-bold hover:bg-emerald-700">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري بناء اللعبة...</> : <><Sparkles className="h-4 w-4" /> ابنِ اللعبة بالذكاء الاصطناعي</>}
              </Button>
              <p className="mt-2 text-center text-[10px] leading-5 text-stone-400">يعتمد الإنشاء على محركات الذكاء الاصطناعي ومفاتيحها المضافة في تبويب «المفاتيح». وقت الإنشاء يختلف حسب المحرك.</p>
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 p-3">
                <div className="min-w-0"><h3 className="truncate font-extrabold text-stone-900">{active.title}</h3><p className="text-[10px] text-stone-400">مشروع HTML5 · معاينة معزولة</p></div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setShowCode((v) => !v)}><Code2 className="h-4 w-4" />{showCode ? "المعاينة" : "الكود"}</Button>
                  <Button size="sm" variant="outline" onClick={() => setPreviewKey((v) => v + 1)}><RefreshCw className="h-4 w-4" /></Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" asChild><a href={`/api/games/${active.id}/export`}><Download className="h-4 w-4" />تصدير HTML</a></Button>
                </div>
              </div>
              {showCode ? (
                <pre className="max-h-[65vh] overflow-auto bg-slate-950 p-4 text-left text-xs leading-6 text-emerald-100" dir="ltr"><code>{active.html}</code></pre>
              ) : (
                <div className="bg-stone-100 p-2 sm:p-3">
                  <div className="mx-auto aspect-[9/16] max-h-[680px] w-full max-w-[390px] overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-inner">
                    <iframe key={previewKey} title={active.title} srcDoc={active.html} sandbox="allow-scripts" referrerPolicy="no-referrer" className="h-full w-full border-0" />
                  </div>
                  <p className="mt-2 text-center text-[10px] text-stone-500">اللعبة تعمل داخل إطار معزول لحماية صفحة الشركة.</p>
                </div>
              )}
              <div className="space-y-2 border-t border-stone-100 p-3">
                <label htmlFor="game-edit" className="flex items-center gap-2 text-sm font-extrabold text-stone-800"><WandSparkles className="h-4 w-4 text-emerald-600" /> اطلب تعديل على اللعبة</label>
                <Textarea id="game-edit" value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} rows={3} maxLength={2000} placeholder="مثلاً: أضف 3 مستويات، وحسّن شكل الشخصية، وخلي التحكم باللمس..." />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={refineGame} disabled={busy || editPrompt.trim().length < 4} className="min-h-10 flex-1 bg-emerald-600 hover:bg-emerald-700">{busy ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري التعديل...</> : "نفّذ التعديل واحفظ إصداراً جديداً"}</Button>
                  <Button variant="outline" onClick={() => setActive(null)}>مشروع جديد</Button>
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-3">
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-extrabold text-stone-900">مشاريعي</h3><Button size="sm" variant="ghost" onClick={() => void loadProjects()} aria-label="تحديث المشاريع"><RefreshCw className="h-4 w-4" /></Button></div>
            {loading ? <div className="flex items-center justify-center py-8 text-stone-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : projects.length === 0 ? (
              <div className="py-7 text-center text-xs text-stone-400"><Gamepad2 className="mx-auto mb-2 h-8 w-8 opacity-40" />لسه مفيش ألعاب محفوظة</div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <div key={project.id} className={`flex items-center gap-2 rounded-xl border p-2.5 ${active?.id === project.id ? "border-emerald-300 bg-emerald-50" : "border-stone-100 bg-stone-50"}`}>
                    <button onClick={() => void openGame(project.id)} className="min-w-0 flex-1 text-right">
                      <span className="block truncate text-sm font-bold text-stone-800">{project.title}</span>
                      <span className="block text-[10px] text-stone-400">الإصدار {project.versions?.[0]?.version ?? 1} · {new Date(project.updatedAt).toLocaleDateString("ar-EG")}</span>
                    </button>
                    <button onClick={() => void deleteGame(project.id)} className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-600" aria-label={`حذف ${project.title}`}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white/70 p-3 text-xs leading-6 text-stone-500">
            <b className="text-stone-700">حدود النسخة الأولى:</b>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>ينشئ ألعاب ويب HTML5 قابلة للتشغيل على الهاتف.</li>
              <li>يحفظ المشاريع وسجل الإصدارات في قاعدة بيانات BuildApp.</li>
              <li>يصدّر ملف HTML مستقل يمكن فتحه أو مشاركته.</li>
              <li>تصدير APK أصلي غير متاح في هذه المرحلة.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
