import ZAI from "z-ai-web-dev-sdk";

async function main() {
  const zai = await ZAI.create();
  const candidates = ["glm-4.6v", "glm-4.5v", "glm-4v-plus", "glm-4v"];
  for (const model of candidates) {
    try {
      const completion = await zai.chat.completions.createVision({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "ما هي هذه الصورة؟ سطر واحد." },
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAb0lEQVR4nO3PMQEAAAgDoJc/uIwejgHRsTT//wkAqluPvr4OwLsAqG4QgLpBAPoGAegbBKBvEIC+QQD6BgHoGwSgbxCAvkEA+gYB6BsEoG8QgL5BAPoGAegbBKBvEIC+QQD6BgHoGwSgb7cBXOcFI0M7AAAAAElFTkSuQmCC" } },
          ],
        }],
      });
      const content = completion?.choices?.[0]?.message?.content ?? "";
      console.log(`${model} OK:`, content.slice(0, 100));
    } catch (e) {
      console.log(`${model} FAIL:`, e instanceof Error ? e.message.slice(0, 120) : e);
    }
  }
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
