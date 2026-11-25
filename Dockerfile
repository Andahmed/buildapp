# ============ Production image (Bun + Next standalone + Prisma/SQLite) ============
# The database is stored on the persistent volume mounted at /data.

FROM oven/bun:1 AS base
WORKDIR /app

# Install the complete dependency graph once, using the committed lockfile.
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the application and generate the Prisma client.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun run build

# Runtime image.
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/data/custom.db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Prisma CLI loads @prisma/config, which loads effect; effect in turn
# requires fast-check (and pure-rand). Copying only prisma/@prisma/effect
# omitted transitive packages. Keep the complete installed dependency tree
# so every direct and transitive Prisma CLI dependency is present at runtime.
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

# Ensure the database schema exists on the persistent volume before serving.
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun server.js"]
