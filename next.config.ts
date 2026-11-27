import type { NextConfig } from "next";

// ============ الهيدرز الأمنية (خطوة 14 من فحص الأمان قبل الإطلاق) ============
// ملاحظة: مفيش X-Frame-Options: DENY — التطبيق بيتبنى عمداً ليعمل داخل iframe
// (كوكي CHIPS Partitioned في src/lib/auth.ts)، فبنسمح للـ frame-ancestors بـ *.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-ancestors *",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // تعطيل محرك تحسين الصور (خطوة 21): بيقفل ثغرات RCE الحرجة في /_next/image
  // (GHSA-2xp9-vwfh-vxw4 + GHSA-2464-fhr4-w9xw + SSRF GHSA-cjq9-62q9-8jv4)
  // — التطبيق مش بيستخدم next/image أصلاً فمفيش أي تأثير على الشكل.
  images: { unoptimized: true },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
