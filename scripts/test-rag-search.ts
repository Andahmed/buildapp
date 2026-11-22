/**
 * بنشمارك بحث RAG — قبل/بعد (TF vs BM25-lite)
 * بيزرع أجزاء اختبار + مشتتات، يشغل 6 استعلامات، ويتحقق إن الجزء الصح هو الأول، ثم ينضف.
 * التشغيل: bun run scripts/test-rag-search.ts
 */
import { searchChunks } from "../src/lib/rag";
import { db } from "../src/lib/db";

const TAG = `ragbench-${Date.now()}`;
const TARGETS: { query: string; expectFragment: string; chunk: string }[] = [
  {
    query: "إيه ميزانية مشروع سُفرة؟",
    expectFragment: "45 ألف جنيه",
    chunk: "مشروع تطبيق توصيل أكل اسمه سُفرة. الميزانية المعتمدة للمشروع 45 ألف جنيه. فريق المشروع: مازن باك إند وياسين فرونت إند.",
  },
  {
    query: "مين مسؤول حملة التسويق على انستجرام؟",
    expectFragment: "سلمى",
    chunk: "حملة التسويق على انستجرام بتكون بإشراف سلمى، والميزانية الإعلانية 8 آلاف جنيه لشهر ديسمبر.",
  },
  {
    query: "سيرفر الإنتاج عليه كام ذاكرة RAM؟",
    expectFragment: "16 جيجا",
    chunk: "سيرفر الإنتاج الرئيسي عليه 16 جيجا RAM و4 أنوية، مع نسخة احتياطية يومية الساعة 3 فجراً.",
  },
  {
    query: "موعد تسليم موقع العميل الشركة الجديد؟",
    expectFragment: "15 يناير",
    chunk: "اتفاقية العميل الجديد: تسليم موقع الشركة النهائي يوم 15 يناير 2027، وعقوبة التأخير 2% أسبوعياً.",
  },
  {
    // استعلام ملتبس: "الميزانية" موجودة في 3 أجزاء مختلفة — IDF لازم يرفع "الإعلانية" النادرة
    query: "الميزانية بتاعة الإعلان كام؟",
    expectFragment: "سلمى",
    chunk: "حملة التسويق على انستجرام بتكون بإشراف سلمى، والميزانية الإعلانية 8 آلاف جنيه لشهر ديسمبر.",
  },
];

const DISTRACTORS = [
  "اجتماع الموارد البشرية يوم الخميس لمراجعة عقود التدريب الداخلي وتقييم أداء المتدربين الجدد.",
  "تقرير المبيعات: نمو المبيعات الربع الأخير 12% مقارنة بالربع السابق، وأعلى الأرباح من فرع الإسكندرية.",
  "بروتوكول الأمان الداخلي: كلمات المرور بتتغير كل 90 يوم وممنوع مشاركة حسابات الأدمن.",
  "دليل استخدام المبرمجين: أسلوب الكود لازم TypeScript صارم مع ESLint ونظيف من أي console.log.",
  "مصاريف التشغيل الشهرية: كهرباء وإنترنت ومياه حوالي 3,200 جنيه، ومكتب جديد في المعادي.",
  "اجتماع الفريق التقني كل صباح إثنين 10 صباحاً على جوجل ميت لمراجعة مهام الأسبوع.",
  "الخط الساخن للعملاء شغال من 9 الصبح لـ 10 بالليل، ووقت الاستجابة المستهدف أقل من دقيقتين.",
  "سياسة الإجازات السنوية 21 يوم، والإجازات المرضية بتتطلب تقرير طبي بعد 3 أيام.",
  "هيكل قاعدة البيانات: جدول الموظفين والمهام والاجتماعات والرسائل مع فهارس على الأعمدة الأساسية.",
  "أهداف الشركة السنوية: التوسع في السوق الخليجي وإطلاق نسخة موبايل من منصة المكتب الذكية.",
  "قائمة الموردين المعتمدين: شركة الإمداد للقرطاسية وشركة الشبكات لتركيبات الكوابل والراوترات.",
  "مذكرات اجتماع المجلس: اعتماد منح أداء ربع سنوية للموظفين المتفوقين بنسبة 10% من الراتب.",
];

async function main() {
  const all = [...TARGETS.map((t) => t.chunk), ...DISTRACTORS];
  await db.fileChunk.createMany({
    data: all.map((text, idx) => ({ fileId: TAG, idx, text })),
  });

  let top1Correct = 0;
  const timings: number[] = [];
  console.log("=== بنشمارك بحث RAG ===");
  for (const t of TARGETS) {
    const t0 = performance.now();
    const hits = await searchChunks(t.query, 3);
    timings.push(performance.now() - t0);
    const first = hits[0] ?? "";
    const ok = first.includes(t.expectFragment);
    if (ok) top1Correct++;
    console.log(`سؤال: ${t.query}`);
    console.log(`  نتيجة #1 ${ok ? "صح ✅" : "غلط ❌"} ${first ? "→ " + first.slice(0, 70).replace(/\n/g, " ") : "(فاضي)"}`);
    console.log(`  عدد النتائج: ${hits.length} | زمن: ${timings[timings.length - 1].toFixed(1)}ms`);
  }
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`\nالنتيجة: top-1 صحيح ${top1Correct}/${TARGETS.length} | متوسط زمن البحث ${avg.toFixed(1)}ms`);
  await db.fileChunk.deleteMany({ where: { fileId: TAG } });
  process.exit(0);
}

main().catch((e) => {
  console.error("فشل البنشمارك:", e);
  process.exit(1);
});
