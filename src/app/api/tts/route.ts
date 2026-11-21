import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { text, gender } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const input = text.trim().replace(/\s+/g, " ").slice(0, 900);
    const voice = gender === "female" ? "tongtong" : "kazi";

    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input,
      voice,
      speed: 1.0,
      response_format: "wav",
      stream: false,
    });
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(new Uint8Array(arrayBuffer));

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS failed" },
      { status: 500 }
    );
  }
}
