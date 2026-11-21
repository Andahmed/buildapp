import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// log: ['query'] كان بيطبع كل استعلام SQL في اللوج — ضجيج يبطئ كل endpoint
// وبيملأ dev.log بميجا بايت. خليته بس للتحذيرات والأخطاء الفعلية.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
