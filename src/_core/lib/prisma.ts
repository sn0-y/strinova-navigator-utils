import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL ?? 'file:./prisma/bot.db';

const adapter = new PrismaPg({ url: connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma }