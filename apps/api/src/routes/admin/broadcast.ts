import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok } from '../../utils/response';
import { broadcast, notifyUser } from '../../services/notification.service';

/** /api/admin/broadcast — সব (বা একজন) লিঙ্ক করা ইউজারকে টেলিগ্রামে বার্তা */
const router = Router();

// কতজনকে পাঠানো যাবে
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const reachable = await prisma.user.count({ where: { telegramId: { not: null }, status: 1 } });
    const total = await prisma.user.count();
    return ok(res, { reachable, total });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        message: z.string().trim().min(1).max(4000),
        // একজনকে পাঠাতে চাইলে (ইমেইল / আইডি / telegram id)
        user: z.string().trim().optional(),
      })
      .parse(req.body);

    if (b.user) {
      const target = await prisma.user.findFirst({
        where: {
          OR: [
            { email: b.user.toLowerCase() },
            { telegramId: b.user },
            ...(Number.isInteger(Number(b.user)) ? [{ id: Number(b.user) }] : []),
          ],
        },
        select: { id: true, name: true, telegramId: true },
      });
      if (!target) throw new HttpError(404, 'User not found.');
      if (!target.telegramId) throw new HttpError(422, `${target.name} এর টেলিগ্রাম লিঙ্ক করা নেই।`);
      const sent = await notifyUser(target.id, b.message);
      return ok(res, { sent: sent ? 1 : 0, failed: sent ? 0 : 1, total: 1 }, 'Sent.');
    }

    const r = await broadcast(b.message);
    return ok(res, r, `Sent to ${r.sent} of ${r.total}.`);
  }),
);

export default router;
