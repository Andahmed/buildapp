import { promises as dns } from "dns";
import net from "net";

// ============ حماية من SSRF في page_reader وأي جلب URL ============
// منع الوصول للعناوين الداخلية: localhost، 127.x، 10.x، 192.168.x، 172.16-31.x،
// 169.254.x (بيانات السحابة)، 0.0.0.0، و IPv6 الداخلي — بفحص الـ DNS نفسه كمان
// عشان نمنع DNS rebinding.

const BLOCKED_HOSTNAMES = new Set([
  "localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback",
  "metadata", "metadata.google.internal", "instance-data",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10/8
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true;        // 192.168/16
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                      // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === "::" || addr === "::1") return true;
  if (addr.startsWith("fe80") || addr.startsWith("fc") || addr.startsWith("fd")) return true; // link-local + ULA
  if (addr.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1)
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export interface SafeUrl {
  ok: true;
  url: string;
  host: string;
}
export interface UnsafeUrl {
  ok: false;
  reason: string;
}

/** فحص كامل: scheme + hostname + كل عناوين الـ DNS المُحلولة */
export async function checkPublicUrl(rawUrl: string): Promise<SafeUrl | UnsafeUrl> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "الرابط مش صحيح" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `البروتوكول ${u.protocol} ممنوع — http/https بس` };
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: "العنوان ده داخلي وممنوع قراءته" };
  }
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, reason: "العنوان ده داخلي وممنوع قراءته" };
  }
  // لو الـ hostname نفسه IP مباشرة
  if (net.isIPv4(host)) {
    if (isPrivateIPv4(host)) return { ok: false, reason: "عناوين الشبكات الداخلية ممنوعة" };
  } else if (net.isIPv6(host)) {
    const bare = host.replace(/^\[|\]$/g, "");
    if (isPrivateIPv6(bare)) return { ok: false, reason: "عناوين الشبكات الداخلية ممنوعة" };
  } else {
    // hostname — بنحل الـ DNS ونتأكد إن كل العناوين عامة (منع DNS rebinding)
    try {
      const addrs = await dns.lookup(host, { all: true, verbatim: true });
      if (addrs.length === 0) return { ok: false, reason: "العنوان مش بيعرف يتحل" };
      for (const a of addrs) {
        if (net.isIPv4(a.address) && isPrivateIPv4(a.address)) {
          return { ok: false, reason: "الرابط بيحول لعنوان داخلي — ممنوع" };
        }
        if (net.isIPv6(a.address) && isPrivateIPv6(a.address)) {
          return { ok: false, reason: "الرابط بيحول لعنوان داخلي — ممنوع" };
        }
      }
    } catch {
      return { ok: false, reason: "فشل تحليل عنوان الرابط" };
    }
  }
  return { ok: true, url: u.toString(), host };
}
