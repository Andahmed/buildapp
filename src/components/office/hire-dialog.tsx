"use client";

import { useState } from "react";
import { EmployeeAvatar } from "./avatar";
import { Employee } from "./types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, UserPlus, Sparkles } from "lucide-react";

const EXAMPLES = [
  "محتاج مطور React يجدد لوحة تحكم العملاء بتاعتنا",
  "عايز مهندس DevOps يدير النشر والسيرفرات بتاعة المشاريع",
  "محتاج مهندس اختبار QA يفحص المنتجات قبل تسليمها للعملاء",
];

interface HireDialogProps {
  open: boolean;
  onClose: () => void;
  refreshOffice: () => void;
  onHired: (emp: Employee) => void;
}

export function HireDialog({ open, onClose, refreshOffice, onHired }: HireDialogProps) {
  const { toast } = useToast();
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [hired, setHired] = useState<Employee | null>(null);

  async function hire() {
    if (!desc.trim() || loading) return;
    setLoading(true);
    setHired(null);
    try {
      const res = await fetch("/api/hr/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: desc.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setHired(json.employee);
      refreshOffice();
      onHired(json.employee);
      toast({ title: "مهندس جديد انضم لفريق التطوير", description: `${json.employee.name} — ${json.employee.role}` });
    } catch (err) {
      toast({
        title: "ليلى معرفتش تعيّن دلوقتي",
        description: err instanceof Error ? err.message : "جرب صياغة تانية",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setDesc("");
    setHired(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-700" />
            وظّف موظف AI جديد
          </DialogTitle>
        </DialogHeader>

        {!hired ? (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-stone-500">
              اكتب الوصف الوظيفي و<b className="text-stone-700">ليلى (HR)</b> هتختار الكفاءة المناسبة لفريق التطوير، تحدد شخصيته ومهاراته وأدواته، وتضيفه للشركة فوراً — بيتدرّب على أدواتنا مفتوحة المصدر على طول.
            </p>
            <Textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={4}
              placeholder="مثال: محتاج مهندس أندرويد يبني تطبيق موبايل للعملاء..."
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setDesc(ex)}
                  className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-600 transition hover:border-emerald-500 hover:text-emerald-700"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {ex.slice(0, 42)}...
                </button>
              ))}
            </div>
            <Button onClick={hire} disabled={!desc.trim() || loading} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "ليلى بتدور على الكفاءة المناسبة..." : "ابعت الوصف الوظيفي لليلى"}
            </Button>
          </div>
        ) : (
          <div className="pop-in space-y-4 text-center">
            <div className="mx-auto w-fit rounded-full border-4 border-emerald-500 bg-emerald-50 p-2">
              <EmployeeAvatar skin={hired.skin} hair={hired.hair} shirt={hired.shirt} gender={hired.gender} size={72} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-stone-900">{hired.name}</h3>
              <p className="text-sm font-bold text-emerald-700">{hired.role}</p>
              <p className="mt-1 text-xs text-stone-500">{hired.personality}</p>
            </div>
            {hired.skills.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {hired.skills.map((s) => (
                  <span key={s} className="rounded-full bg-stone-100 px-2 py-1 text-[11px] font-bold text-stone-600">{s}</span>
                ))}
              </div>
            )}
            <Button onClick={close} className="w-full bg-emerald-600 hover:bg-emerald-700">
              ابدأ شغل مع {hired.name}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
