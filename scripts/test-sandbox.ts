import { runPythonSandboxed } from "../src/lib/pysandbox";

const r1 = await runPythonSandboxed("print('calc:', 17*23)");
console.log("CALC:", r1.output.replace(/\n/g, " | "));
const r2 = await runPythonSandboxed("import socket\ns=socket.socket()\ns.connect(('8.8.8.8',53))\nprint('NET LEAKED')");
console.log("NET-BLOCK:", r2.output.includes("محجوبة") ? "network blocked ✓" : r2.output.slice(0, 120));
const r3 = await runPythonSandboxed("import requests\nprint(requests.get('http://example.com').status_code)");
console.log("REQ-BLOCK:", r3.output.includes("محجوبة") ? "requests blocked ✓" : r3.output.slice(0, 120));
const r4 = await runPythonSandboxed("while True: pass");
console.log("CPU-LIMIT:", r4.timedOut ? "killed by timeout ✓" : r4.output.slice(0, 80));
const r5 = await runPythonSandboxed("import os\nprint('SECRET:', os.environ.get('GEMINI_API_KEY', 'NOT_SET'))");
console.log("ENV-CLEAN:", r5.output.includes("NOT_SET") ? "env sanitized ✓" : "LEAKED!");
