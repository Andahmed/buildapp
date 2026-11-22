import { checkPublicUrl } from "../src/lib/net-guard";
const tests = [
  "http://localhost:3000/api/office",
  "http://127.0.0.1:3000/",
  "http://192.168.1.1/router",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.5/internal",
  "file:///etc/passwd",
  "http://[::1]/",
];
for (const t of tests) {
  const r = await checkPublicUrl(t);
  console.log(r.ok ? "ALLOWED(!)" : "BLOCKED ✓", "←", t, r.ok ? "" : `(${r.reason.slice(0, 40)})`);
}
const ok = await checkPublicUrl("https://github.com/FoundationAgents/OpenManus");
console.log(ok.ok ? "PUBLIC OK ✓" : "FALSE POSITIVE: " + ok.reason, "← https://github.com/...");
