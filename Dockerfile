# ============ كود ذكي — صورة إنتاج (Bun + Next standalone + Prisma/SQLite) ============
# نفس الصورة شغالة على Railway و Fly.io و Render وأي Docker عادي.
# القاعدة بتتخزن على volume دايم مثبّت على /data — انظر docs/DEPLOY.md

FROM oven/bun:1 AS base
WORKDIR /app

# ---- طبقة الاعتماديات ----
# بدون --frozen-lockfile عمداً: package.json اتحدّث (ترقية Next 16.4.6 + إزالة
# next-auth غير المستخدمة — خطوة 21/22 من فحص الأمان) و bun.lock في المستودع
# لسه على النسخة القديمة. bun install هنا بيمزج الاثنين ويحدّث الـ lock داخل
# الصورة. النسخ ثابتة بالـ exact pin في package.json للإطار الأساسي (next).
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install

# ---- طبقة البناء ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun run build

# ---- طبقة التشغيل ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# القاعدة على الـ volume الدايم — ممكن تتكتب فوقيها بـ DATABASE_URL من المنصة
ENV DATABASE_URL=file:/data/custom.db
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# CLI + محركات Prisma عشان db push على الـ volume عند الإقلاع الأول
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
EXPOSE 3000
# عند كل إقلاع: نتأكد إن جداول القاعدة موجودة على الـ volume، ثم نشغّل السيرفر
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun server.js"]
