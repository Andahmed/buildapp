import { NextResponse } from "next/server";
import { ashnaAllowedModels } from "@/lib/ashna-guard";

/**
 * Server-side AshnaAI model catalogue proxy.
 * The API key is never returned to the browser. AshnaAI's model catalogue
 * lists model IDs, not reliable free/paid entitlement metadata; callers must
 * not infer that a model is free from its presence here.
 *
 * Cost guard: if ASHNA_ALLOWED_MODELS is set, only those IDs are returned.
 * An empty/unset list means the owner explicitly allows the whole catalogue.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.ASHNA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AshnaAI is not configured", models: [] },
      { status: 503 },
    );
  }

  try {
    const response = await fetch("https://api.ashna.ai/v1/api/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null) as
      | { data?: Array<{ id?: string; owned_by?: string }> ; error?: { message?: string } }
      | null;

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "AshnaAI model catalogue request failed", models: [] },
        { status: response.status },
      );
    }

    const allowed = ashnaAllowedModels();
    const models = (payload?.data ?? [])
      .filter((item): item is { id: string; owned_by?: string } => typeof item.id === "string" && item.id.length > 0)
      .filter((item) => allowed.size === 0 || allowed.has(item.id))
      .map((item) => ({ id: item.id, provider: item.owned_by ?? "unknown" }))
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));

    return NextResponse.json(
      { models, pricing: "not-provided-by-model-catalogue" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to reach AshnaAI", models: [] },
      { status: 502 },
    );
  }
}
