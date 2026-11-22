"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** مايك المتصفح (تحويل الكلام ل نص عربي) */
export function useSpeech(lang = "ar-EG") {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<unknown>(null);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    // فحص دعم المتصفح — قراءة لميزة خارجية مرة واحدة
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
  }, []);

  const start = useCallback(
    (onFinal: (t: string) => void) => {
      const W = window as unknown as Record<string, unknown>;
      const SR = (W.SpeechRecognition || W.webkitSpeechRecognition) as
        | (new () => {
            lang: string;
            interimResults: boolean;
            continuous: boolean;
            onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
            onend: () => void;
            onerror: () => void;
            start: () => void;
            stop: () => void;
          })
        | undefined;
      if (!SR) return;
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e) => {
        const t = Array.from(e.results as ArrayLike<ArrayLike<{ transcript: string }>>)
          .map((r) => r[0].transcript)
          .join(" ");
        if (t.trim()) onFinal(t.trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [lang]
  );

  const stop = useCallback(() => {
    const rec = recRef.current as { stop?: () => void } | null;
    try {
      rec?.stop?.();
    } catch {}
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

/** تشغيل صوت رد الموظف */
export async function playTTS(text: string, gender: string): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, gender }),
  });
  if (!res.ok) throw new Error("TTS failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}
