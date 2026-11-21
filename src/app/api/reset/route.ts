import { NextResponse } from "next/server";
import { resetOffice } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function POST() {
  await resetOffice();
  return NextResponse.json({ ok: true });
}
