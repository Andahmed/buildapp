import { StreamChunk } from "@/lib/providers";

// ============ مساعد SSE — يحول generator لمstream Response ============

export function sseResponse(gen: AsyncGenerator<SSEEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const ev of gen) {
          const data = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
          controller.enqueue(encoder.encode(`event: ${ev.event}\ndata: ${data}\n\n`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 300) : "خطأ غير معروف";
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
        } catch {
          // الستريم اتقفل
        }
      } finally {
        try {
          controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
        } catch {
          // ماتأثرش
        }
        controller.close();
      }
    },
    cancel() {
      // المستخدم قفل الصفحة — بنوقف التوليد
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export interface SSEEvent {
  event: string;
  data: unknown;
}

/** حوّل streamLLM لمstream رسالة موظف واحدة مع حفظ الناتج في القاعدة */
export interface DMStreamOptions {
  employeeName: string;
  onSave: (reply: string, provider: string) => Promise<void>;
  onText?: (full: string) => Promise<void>;
}

export async function* dmSSE(gen: AsyncGenerator<StreamChunk>, opts: DMStreamOptions): AsyncGenerator<SSEEvent> {
  let full = "";
  let provider = "unknown";
  yield { event: "start", data: { employee: opts.employeeName } };
  for await (const chunk of gen) {
    if (chunk.meta) {
      provider = chunk.meta.provider;
      yield { event: "meta", data: { provider: chunk.meta.provider, model: chunk.meta.model } };
    }
    if (chunk.delta) {
      full += chunk.delta;
      yield { event: "delta", data: { text: chunk.delta } };
    }
  }
  if (!full.trim()) {
    yield { event: "error", data: { error: "الرد الفوري طلع فاضي — جرب تاني" } };
    return;
  }
  await opts.onSave(full, provider);
  yield { event: "done", data: { reply: full, provider } };
}
