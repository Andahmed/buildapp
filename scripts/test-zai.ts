import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  console.log("--- ZAI chat ---");
  try {
    const c = await zai.chat.completions.create({
      messages: [{ role: "user", content: "رد بكلمة واحدة: تمام" }],
      thinking: { type: "disabled" },
    });
    console.log("chat OK:", (c.choices?.[0]?.message?.content ?? "").slice(0, 80));
  } catch (e) {
    console.log("chat FAIL:", e instanceof Error ? e.message.slice(0, 150) : e);
  }
  console.log("--- ZAI web_search ---");
  try {
    const r = await zai.functions.invoke("web_search", { query: "OpenManus github", num: 3 });
    console.log("search OK:", JSON.stringify((r ?? []).map((x: { name: string }) => x.name)).slice(0, 200));
  } catch (e) {
    console.log("search FAIL:", e instanceof Error ? e.message.slice(0, 150) : e);
  }
  console.log("--- ZAI page_reader ---");
  try {
    const p = await zai.functions.invoke("page_reader", { url: "https://example.com" });
    console.log("page OK:", String(p?.data?.title ?? "").slice(0, 80));
  } catch (e) {
    console.log("page FAIL:", e instanceof Error ? e.message.slice(0, 150) : e);
  }
  console.log("--- ZAI image_gen ---");
  try {
    const img = await zai.images.generations.create({ prompt: "a tiny red cube on white background", size: "1024x1024" });
    const b64 = img?.data?.[0]?.base64 ?? "";
    console.log("image OK, base64 length:", b64.length);
  } catch (e) {
    console.log("image FAIL:", e instanceof Error ? e.message.slice(0, 150) : e);
  }
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
