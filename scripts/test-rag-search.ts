import { searchChunks } from "../src/lib/rag";
const hits = await searchChunks("إيه ميزانية مشروع سُفرة؟", 2);
console.log("HITS:", hits.length, hits.length ? "\n→" + hits[0].slice(0, 150) : "");
