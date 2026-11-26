"use client";

import { useCallback, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mountPhaserPreview, PHASER_VERSION, type PhaserPreviewHandle } from "@/lib/integrations/phaser-preview";

/**
 * Phaser smoke-test preview for the Games Studio.
 * Client-only. The existing HTML5 iframe preview stays the default;
 * this component verifies the Phaser runtime mounts, renders, and
 * cleans up correctly inside BuildApp.
 */

type Props = {
  onClose: () => void;
};

type MountState = "idle" | "loading" | "ready" | "error";

export function PhaserSmokeTest({ onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<PhaserPreviewHandle | null>(null);
  const [state, setState] = useState<MountState>("idle");
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    const container = containerRef.current;
    if (!container || handleRef.current) return;
    setState("loading");
    setError("");
    try {
      handleRef.current = await mountPhaserPreview(container, {
        width: 390,
        height: 700,
        backgroundColor: "#101826",
        createScene: (scene) => {
          const title = scene.add.text(24, 26, "Phaser 4 on BuildApp", {
            fontFamily: "Arial",
            fontSize: "18px",
            color: "#6ee7b7",
          });
          const dot = scene.add.circle(195, 360, 14, 0x6ee7b7);
          scene.tweens.add({
            targets: [title, dot],
            y: "+=40",
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut",
          });
          scene.input.on("pointerdown", (p: { x: number; y: number }) => {
            scene.add.circle(p.x, p.y, 8, 0xffffff).setDepth(1);
          });
        },
      });
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تشغيل Phaser");
      setState("error");
    }
  }, []);

  const stop = useCallback(() => {
    handleRef.current?.destroy();
    handleRef.current = null;
    setState("idle");
  }, []);

  return (
    <div dir="rtl" className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold text-stone-900">اختبار Phaser {PHASER_VERSION}</h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">تجريبي · client-side</Badge>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-bold text-stone-500 hover:bg-stone-100">
            إغلاق
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-stone-500">
        يتحقق أن محرك Phaser يعمل داخل BuildApp دون التأثير على مسار HTML5 الحالي. المعاينة تعمل في المتصفح فقط.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => void run()}
          disabled={state === "loading" || state === "ready"}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {state === "loading" ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
          {state === "ready" ? "يعمل الآن" : state === "loading" ? "جاري التحميل..." : "تشغيل الاختبار"}
        </button>
        {state === "ready" && (
          <button onClick={stop} className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50">
            إيقاف وتنظيف
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      <div ref={containerRef} className="mt-3 min-h-[140px] overflow-hidden rounded-xl border border-stone-200 bg-stone-50" />
      {state === "ready" && (
        <p className="mt-2 text-[10px] text-stone-400">
          اضغط داخل اللوحة: كل ضغطة تُنشئ دائرة — تأكيد أن اللمس والإدخال يعملان. اضغط «إيقاف وتنظيف» للتأكد من نظافة التفكيك.
        </p>
      )}
    </div>
  );
}