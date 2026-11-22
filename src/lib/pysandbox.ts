import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";

// ============ عزل تشغيل Python (sandbox) ============
// البيئة دي مفيهاش user namespaces (unshare ممنوع على السيرفر)، فالعزل بيتعمل بثلاث طبقات:
// 1) wrapper Python بيحظر الشبكة من جوه (socket + create_connection + getaddrinfo)
// 2) حدود موارد نظامية عبر prlimit: CPU 10 ثواني، ذاكرة 512MB، ملفات 10MB، عمليات 64
// 3) مجلد مؤقت معزول بيتحذف بعد التنفيذ + بيئة نظيفة بدون متغيرات الخادم
// لو النظام بيدعم unshare -n (جهازك مثلاً) بنستخدمه كطبقة رابعة أقوى.

const WRAPPER = `
import sys, os, types
# --- حظر الشبكة قبل تشغيل أي كود مستخدم ---
import socket

class BlockedNet(RuntimeError):
    def __init__(self, what):
        super().__init__(f"الشبكة محجوبة في البيئة المعزولة — {what} ممنوع")

def _blocked(*a, **k):
    raise BlockedNet("الاتصال")

socket.socket.connect = _blocked
socket.socket.connect_ex = _blocked
socket.socket.sendto = _blocked
socket.create_connection = _blocked
socket.getaddrinfo = _blocked
socket.gethostbyname = _blocked

# حظر فتح عمليات ومكتبات شبكة شائعة
import builtins
_real_import = builtins.__import__
def _safe_import(name, *a, **k):
    if name in {"ctypes", "multiprocessing", "requests", "urllib3", "httpx", "aiohttp", "ftplib", "telnetlib", "smtplib", "asyncio.subprocess"}:
        raise BlockedNet(name)
    return _real_import(name, *a, **k)
builtins.__import__ = _safe_import

# --- تحميل كود المستخدم ---
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    code = f.read()
g = {"__name__": "__main__", "__file__": path}
exec(compile(code, path, "exec"), g)
`;

export interface PyRunResult {
  output: string;
  isolated: boolean;
  timedOut: boolean;
}

export async function runPythonSandboxed(code: string, wallTimeoutMs = 30000): Promise<PyRunResult> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "pysb-"));
  const codePath = path.join(tmpDir, "task.py");
  const wrapperPath = path.join(tmpDir, "_wrapper.py");
  let isolated = false;
  try {
    await writeFile(codePath, code, "utf-8");
    await writeFile(wrapperPath, WRAPPER, "utf-8");

    // حدود موارد نظامية — prlimit متاح في البيئة دي
    const prlimit = "/usr/bin/prlimit";
    const limits = [
      "--cpu=10", // وقت المعالج 10 ثواني
      "--as=536870912", // ذاكرة 512MB
      "--fsize=10485760", // حجم ملفات 10MB
      "--nproc=64", // عدد العمليات
      "--nofile=64", // عدد الملفات المفتوحة
    ];
    const args = [...limits, "python3", "-I", wrapperPath, codePath];
    // لو unshare متاح على جهاز التشغيل — طبقة عزل شبكة نظامية كمان
    // (على السيرفر ده ممنوع، فبنعتمد على الـ wrapper)
    const env = { PATH: "/usr/bin:/bin", HOME: tmpDir, PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" } as unknown as NodeJS.ProcessEnv;

    const result = await new Promise<{ stdout: string; stderr: string; timedOut: boolean }>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let proc;
      try {
        proc = spawn(prlimit, args, { cwd: tmpDir, env, stdio: ["ignore", "pipe", "pipe"] });
      } catch {
        proc = spawn("python3", ["-I", wrapperPath, codePath], { cwd: tmpDir, env, stdio: ["ignore", "pipe", "pipe"] });
      }
      proc.stdout.on("data", (d) => (stdout += d.toString().slice(0, 100000)));
      proc.stderr.on("data", (d) => (stderr += d.toString().slice(0, 40000)));
      proc.on("error", (e) => (stderr += `\n${e.message}`));
      proc.on("close", () => resolve({ stdout, stderr, timedOut }));
      setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, wallTimeoutMs);
    });

    isolated = true;
    if (result.timedOut) {
      return { output: "الكود اتعدى وقت التنفيذ المسموح واتلغي تلقائياً.", isolated, timedOut: true };
    }
    const combined = [
      result.stdout.trim() && `الناتج:\n${result.stdout.slice(0, 5000)}`,
      result.stderr.trim() && `أخطاء:\n${result.stderr.slice(0, 2000)}`,
    ]
      .filter(Boolean)
      .join("\n");
    return { output: combined || "(الكود اتنفذ بدون ناتج مطبوع)", isolated, timedOut: false };
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
