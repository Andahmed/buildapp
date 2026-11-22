/**
 * اختبار + قياس الـ Preflight (فكرة من Habr — مقالة Bitrix24: فحص ميزانية التوكنات قبل الضرب).
 * التشغيل: bun run scripts/test-preflight.ts
 *
 * القياس قبل/بعد:
 * - قبل: الطلب الأكبر من النافذة كان بينضرب المحرك فعلاً → 400/مهلة حتى 45ث + 3 محاولات backoff
 *   (موثق في لوجات الجلسة السابقة وTASKS-DONE.md B1).
 * - بعد: رفض محلي أثناء بناء السلسلة — بنقيس زمن القرار + إن مفيش أي طلب HTTP حصل.
 */
import { preflightWindowOk, estimateTokensForTest, type LLMMessage } from "../src/lib/providers";

function msg(role: LLMMessage["role"], content: string): LLMMessage {
  return { role, content };
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

console.log("=== فحوصات الـ Preflight ===");

// 1) التقدير: 30,000 حرف عربي ≈ 10,000 توكن (محافظ 3 حروف/توكن)
const bigText = "ا".repeat(30_000);
const est = estimateTokensForTest([msg("user", bigText)]);
check(`تقدير 30k حرف → ${est} توكن (متوقع 10000)`, est === 10_000);

// 2) محرك صغير (pollinations نافذة 8k): 10k + 2048 رد > 8k → رفض
const pf1 = preflightWindowOk("pollinations", 10_000, 2048);
check(`pollinations (10k إدخال + 2k رد) → مرفوض (نافذة ${pf1.window})`, pf1.ok === false);

// 3) محرك كبير (gemini نافذة 80k): نفس الطلب → مقبول
const pf2 = preflightWindowOk("gemini", 10_000, 4096);
check(`gemini (10k إدخال + 4k رد) → مقبول (نافذة ${pf2.window})`, pf2.ok === true);

// 4) محرك غير معروف → النافذة الافتراضية 16k
const pf3 = preflightWindowOk("enginemaghour", 15_000, 2_000);
check(`محرك غير معروف (15k + 2k) → مرفوض بالنافذة الافتراضية ${pf3.window}`, pf3.ok === false && pf3.window === 16_000);

// 5) طلب عادي صغير (شات عادي ~2k حرف) → الكل مقبول
const small = estimateTokensForTest([
  msg("system", "أنت مهندس برمجيات في شركة كود ذكي. ".repeat(20)),
  msg("user", "اعمل لي خطة نشر تطبيق ويب"),
]);
const pf4 = preflightWindowOk("pollinations", small, 2048);
check(`طلب عادي (${small} توكن) → مقبول حتى على pollinations`, pf4.ok === true);

// 6) القياس الفعلي: زمن القرار للرفض المحلي
console.log("\n=== القياس ===");
const messages: LLMMessage[] = [
  msg("system", "نظام الوكيل بتاع شركة كود ذكي. ".repeat(50)),
  msg("user", "ا".repeat(90_000)), // ~30k توكن — أكبر من كل النوافذ المجانية
];
const t0 = performance.now();
const estBig = estimateTokensForTest(messages);
const decision = preflightWindowOk("pollinations", estBig, 2048);
const decisionMs = performance.now() - t0;
console.log(`  تقدير مدخلات ضخمة (${messages.reduce((a, m) => a + m.content.length, 0)} حرف) → ${estBig} توكن`);
console.log(`  قرار الرفض المحلي: ${decisionMs.toFixed(3)}ms (ok=${decision.ok})`);
check("زمن القرار المحلي < 1ms", decisionMs < 1);
check("الطلب الضخم مرفوض على pollinations", decision.ok === false);

console.log(`\n=== النتيجة: ${pass} نجح / ${fail} فشل ===`);
process.exit(fail === 0 ? 0 : 1);
