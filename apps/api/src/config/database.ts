// Re-export the shared Prisma singleton so API code imports from one place.
import { prisma } from '@mhgs/database';

export { prisma };
export default prisma;
