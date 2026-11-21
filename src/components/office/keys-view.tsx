"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2, Plus, Trash2, PlugZap, CheckCircle2, XCircle, ShieldCheck, ExternalLink } from "lucide-react";

interface ProviderKeyMeta {
  id: string;
  provider: string;
  label: string;
  apiKey: string; // متقنّع من السيرفر
  baseUrl: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
  lastStatus: string;
  createdAt: string;
}

interface BrainStatus {
  brain: string;
  provider: string;
  chain: string[];
  geminiEnv: boolean;
  geminiNote?: string;
}

const PRESETS: Record<string, { label: string; baseUrl: string; model: string; keyHint: string; docsUrl: string }> = {
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-3.8-flash", keyHint: "AIza... أو AQ.Ab...", docsUrl: "https://aistudio.google.com/apikey" },
  openrouter: { label: "OpenRouter (موديلات كتير + مجانية :free)", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", keyHint: "sk-or-...", docsUrl: "https://openrouter.ai/keys" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyHint: "sk-...", docsUrl: "https://platform.openai.com/api-keys" },
  groq: { label: "Groq (فيه طبقة مجانية)", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keyHint: "gsk_...", docsUrl: "https://console.groq.com/keys" },
  cerebras: { label: "Cerebras (أسرع استدلال مجاني)", baseUrl: "https://api.cerebras.ai/v1", model: "llama-3.3-70b", keyHint: "csk-...", docsUrl: "https://cloud.cerebras.ai" },
  sambanova: { label: "SambaNova (طبقة مجانية)", baseUrl: "https://api.sambanova.ai/v1", model: "Meta-Llama-3.3-70B-Instruct", keyHint: "...", docsUrl: "https://cloud.sambanova.ai" },
  cloudflare: { label: "Cloudflare Workers AI (مجاني بحدود)", baseUrl: "https://api.cloudflare.com/client/v4", model: "@cf/meta/llama-3.1-8b-instruct", keyHint: "مفتاح + غيّر الـ Base URL لحسابك", docsUrl: "https://dash.cloudflare.com/profile/api-tokens" },
  huggingface: { label: "Hugging Face Router (موديلات مجانية)", baseUrl: "https://router.huggingface.co/v1", model: "meta-llama/Llama-3.3-70B-Instruct", keyHint: "hf_...", docsUrl: "https://huggingface.co/settings/tokens" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", keyHint: "sk-...", docsUrl: "https://platform.deepseek.com" },
  mistral: { label: "Mistral (طبقة مجانية كبيرة)", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest", keyHint: "...", docsUrl: "https://console.mistral.ai/api-keys" },
  anthropic: { label: "Anthropic Claude", baseUrl: "https://api.anthropic.com", model: "claude-3-5-haiku-latest", keyHint: "sk-ant-...", docsUrl: "https://console.anthropic.com" },
  siliconflow: { label: "SiliconFlow (صيني — فيه مجانية)", baseUrl: "https://api.siliconflow.cn/v1", model: "Qwen/Qwen2.5-7B-Instruct", keyHint: "sk-...", docsUrl: "https://cloud.siliconflow.cn" },
  moonshot: { label: "Moonshot Kimi (صيني)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", keyHint: "sk-...", docsUrl: "https://platform.moonshot.cn" },
  zhipu: { label: "Zhipu GLM (صيني)", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", keyHint: "...", docsUrl: "https://open.bigmodel.cn" },
  custom: { label: "مخصص (OpenAI-Compatible)", baseUrl: "", model: "", keyHint: "المفتاح + Base URL + الموديل", docsUrl: "" },
};

export function KeysView() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ProviderKeyMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(PRESETS.gemini.baseUrl);
  const [model, setModel] = useState(PRESETS.gemini.model);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [brain, setBrain] = useState<BrainStatus | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const [res, statusRes] = await Promise.all([fetch("/api/keys"), fetch("/api/ai/status")]);
      const json = await res.json();
      setKeys(json.keys ?? []);
      const statusJson = await statusRes.json();
      setBrain(statusJson);
    } catch {
      // تجاهل
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  function pickProvider(p: string) {
    setProvider(p);
    const preset = PRESETS[p];
    if (preset) {
      setBaseUrl(preset.baseUrl);
      setModel(preset.model);
    }
  }

  async function addKey() {
    if (!apiKey.trim() || saving) return;
    if (provider === "custom" && !baseUrl.trim()) {
      toast({ title: "المزود المخصص محتاج Base URL", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim(), label: label.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "خطأ");
      toast({
        title: json.test?.ok ? "المفتاح اتحفظ واشتغل" : "المفتاح اتحفظ بس الفحص فشل",
        description: json.test?.message,
        variant: json.test?.ok ? "default" : "destructive",
      });
      setApiKey("");
      setLabel("");
      await fetchKeys();
    } catch (err) {
      toast({ title: "مشكلة في حفظ المفتاح", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function testExisting(key: ProviderKeyMeta) {
    setTesting(true);
    try {
      const res = await fetch("/api/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id }),
      });
      const json = await res.json();
      toast({ title: json.ok ? "المفتاح شغال" : "المفتاح مش شغال", description: json.message, variant: json.ok ? "default" : "destructive" });
      fetchKeys();
    } finally {
      setTesting(false);
    }
  }

  async function toggleKey(key: ProviderKeyMeta, enabled: boolean) {
    await fetch(`/api/keys/${key.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    fetchKeys();
  }

  async function makeDefault(key: ProviderKeyMeta) {
    await fetch(`/api/keys/${key.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    fetchKeys();
    toast({ title: "بقى المفتاح الافتراضي", description: "المحرك هيستخدمه في كل الشغل" });
  }

  async function deleteKey(key: ProviderKeyMeta) {
    if (!confirm("هتحذف المفتاح؟")) return;
    await fetch(`/api/keys/${key.id}`, { method: "DELETE" });
    fetchKeys();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* شرح */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-5 text-white shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
            <KeyRound className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-base font-extrabold">مفاتيح الذكاء الاصطناعي — اربط أي مزود تحبه</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-300">
              ضيف مفتاح Gemini أو OpenAI أو Claude أو OpenRouter أو Groq أو DeepSeek أو مزود صيني — وكل شغل الشركة (الشات، الوكيل OpenManus، الاجتماعات) هيشتغل بمفتاحك تلقائياً.
              لو المفتاح فشل أو مفيش مفاتيح — بيشتغل فوراً محرك مجاني مباشر بدون مفتاح، فالردود دايماً حقيقية.
            </p>
          </div>
        </div>
      </div>

      {/* العقل الشغال دلوقتي — حالة صادقة */}
      {brain && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
              </span>
              <h3 className="text-sm font-extrabold text-emerald-900">العقل الشغال دلوقتي: {brain.brain}</h3>
            </div>
            {brain.geminiEnv && <Badge className="bg-emerald-600 text-white">مفتاح Gemini على الخادم</Badge>}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-800">
            سلسلة الاحتياط التلقائي: {brain.chain.join(" ← ")}
          </p>
          {brain.geminiNote && <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{brain.geminiNote}</p>}
        </div>
      )}

      {/* إضافة مفتاح */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-bold text-stone-800">ضيف مفتاح جديد</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-600">المزود</label>
            <select
              value={provider}
              onChange={(e) => pickProvider(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 outline-none focus:border-emerald-500"
            >
              {Object.entries(PRESETS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-600">المفتاح (API Key)</label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={PRESETS[provider].keyHint}
              type="password"
              dir="ltr"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-600">Base URL {provider !== "custom" && "(اختياري للتغيير)"}</label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://..." dir="ltr" className="font-mono text-xs" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-600">الموديل</label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="model-name" dir="ltr" className="font-mono text-xs" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="تسمية اختيارية... مثال: مفتاح العمل" className="max-w-[220px]" />
          <Button onClick={addKey} disabled={!apiKey.trim() || saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            اربط المفتاح
          </Button>
          {PRESETS[provider].docsUrl && (
            <a
              href={PRESETS[provider].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
            >
              جيب مفتاح {PRESETS[provider].label}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {provider === "gemini" && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
            ملاحظة صادقة: مفتاح Gemini بيتفحص فعلياً عند الربط. لو السيرفر على منطقة جوجل مانعها هتشوف رسالة الحجب الجغرافي بوضوح — المفتاح سليم وشغال على جهازك في مصر،
            أو استخدم مفتاح OpenRouter (اختيار ذكي: بيوصلك لنفس موديلات Gemini وموديلات تانية كتير بمفتاح واحد).
          </p>
        )}
      </div>

      {/* المفاتيح المحفوظة */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-emerald-700" />
            <h3 className="font-bold text-stone-800">المفاتيح المتصلة</h3>
          </div>
          <Badge className="bg-stone-100 text-stone-700">{keys.filter((k) => k.enabled).length} شغال</Badge>
        </div>
        {loading && <div className="py-6 text-center text-sm text-stone-400">بيجيب المفاتيح...</div>}
        {!loading && keys.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-400">
            مفيش مفاتيح لسه — الشغل كله شغال بالمحرك المدمج المجاني، ولو عايز موديل تاني ضيف مفتاح فوق
          </div>
        )}
        <div className="space-y-2.5">
          {keys.map((k) => (
            <div key={k.id} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3.5 ${k.enabled ? "border-stone-200 bg-stone-50" : "border-stone-100 bg-white opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold text-stone-900">{PRESETS[k.provider]?.label ?? k.provider}</span>
                  {k.isDefault && <Badge className="bg-emerald-600 text-white">افتراضي</Badge>}
                  {k.label && <span className="text-[11px] text-stone-500">({k.label})</span>}
                  {k.lastStatus === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  {k.lastStatus === "failed" && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-500" dir="ltr">
                  <span className="rounded bg-stone-200 px-1.5 py-0.5 font-mono">{k.apiKey}</span>
                  {k.model && <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">{k.model}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => testExisting(k)}
                  disabled={testing}
                  className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-bold text-stone-600 transition hover:border-emerald-500 hover:text-emerald-700"
                >
                  فحص
                </button>
                {!k.isDefault && (
                  <button
                    onClick={() => makeDefault(k)}
                    className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-[11px] font-bold text-stone-600 transition hover:border-emerald-500 hover:text-emerald-700"
                  >
                    خليه افتراضي
                  </button>
                )}
                <Switch checked={k.enabled} onCheckedChange={(v) => toggleKey(k, v)} className="data-[state=checked]:bg-emerald-600" aria-label="تشغيل المفتاح" />
                <button onClick={() => deleteKey(k)} className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-600" aria-label="حذف المفتاح">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-stone-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          المفاتيح متخزنة في قاعدة بيانات الشركة المحلية وبس، وبتتقنّع في العرض — محدش يشوفها كاملة غيرك.
        </p>
      </div>
    </div>
  );
}
