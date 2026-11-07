import { createPrismaClient } from "./prisma-client";

/*
 * הטיפוס נגזר מ-createPrismaClient ולא מ-PrismaClient הגנרי, כי הלקוח
 * מוגדר עם `omit` על passcodeHash. עם הטיפוס הגנרי TypeScript היה מאמין
 * שהשדה קיים בכל שאילתה בזמן שבריצה הוא undefined — בדיוק ההפך ממה
 * שההשמטה באה להשיג.
 */
type AppPrismaClient = ReturnType<typeof createPrismaClient>;

// ב-dev ה-hot reload של Next יוצר מופע חדש בכל טעינה, ולכן שומרים אותו על globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
