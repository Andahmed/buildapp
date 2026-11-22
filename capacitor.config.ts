import type { CapacitorConfig } from '@capacitor/cli';

/**
 * إعداد غلاف الأندرويد (Capacitor Shell APK).
 *
 * مهم وبصراحة: التطبيق بتاعنا سيرفر-سايد (API routes + SSE + Prisma/SQLite)
 * فمش ممكن يتلف ثابت جوا الـ APK. الـ APK هنا غلاف أصلي (WebView) حوالين
 * نسخة الـ PWA المنشورة على HTTPS — نفس طريقة "تطبيق موقع موجود".
 *
 * خطوتك الوحيدة قبل البناء: بدّل الرابط تحت برابط النشر الفعلي (HTTPS إلزامي)،
 * مثال: 'https://office.yourdomain.com' (طُرق النشر كلها في docs/DEPLOY.md).
 *
 * أول شاشة في الـ APK هتكون صفحة تسجيل الدخول (/login) — اكتب ADMIN_PASSWORD
 * والجلسة هتفضل مفتوحة 7 أيام في الـ WebView.
 */
const config: CapacitorConfig = {
  appId: 'com.coddhaki.office',
  appName: 'كود ذكي',
  webDir: 'cap-www',
  server: {
    // TODO(الرئيس التنفيذي): ضع رابط نشر التطبيق الحقيقي هنا قبل بناء الـ APK
    url: 'https://kod-dhaki.example.com',
    androidScheme: 'https',
    // السماح بالتنقل داخل نفس الدومين فقط
    allowNavigation: ['kod-dhaki.example.com'],
  },
};

export default config;
