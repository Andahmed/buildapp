import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const keys = await db.providerKey.findMany();
  console.log("=== ProviderKeys:", keys.length);
  for (const k of keys) {
    console.log(`- ${k.provider} | label=${k.label} | model=${k.model} | baseUrl=${k.baseUrl} | enabled=${k.enabled} | isDefault=${k.isDefault} | lastStatus=${k.lastStatus} | keyLen=${k.apiKey.length} | keyPrefix=${k.apiKey.slice(0, 6)}...`);
  }
  const runs = await db.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 8 });
  console.log("=== AgentRuns:", runs.length);
  for (const r of runs) {
    console.log(`- ${r.id.slice(0, 8)} | status=${r.status} | provider=${r.provider} | model=${r.model} | steps=${r.currentStep} | err=${(r.error ?? "").slice(0, 80)}`);
    console.log(`  mission: ${r.mission.slice(0, 90)}`);
    console.log(`  result: ${(r.result ?? "").slice(0, 120)}`);
  }
  const logs = await db.agentLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
  console.log("=== Last AgentLogs:");
  for (const l of logs) console.log(`- [${l.level}] ${l.text.slice(0, 130)}`);
  const msgCount = await db.message.count();
  const taskCount = await db.task.count();
  const empCount = await db.employee.count();
  const wfCount = await db.workspaceFile.count();
  console.log(`=== counts: messages=${msgCount} tasks=${taskCount} employees=${empCount} workspaceFiles=${wfCount}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
