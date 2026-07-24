import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok } from '../../utils/response';
import { listSubmissions, reviewSubmission } from '../../services/creator.service';

/** /api/admin/creator/* — ক্রিয়েটর জমা দেখা ও অনুমোদন (সেশন-অথ) */
const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? '');
    return ok(res, await listSubmissions(status));
  }),
);

router.post(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const b = z
      .object({
        action: z.enum(['approve', 'reject']),
        bonus: z.coerce.number().min(0).optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(req.body);
    try {
      const r = await reviewSubmission(req.userId!, Number(req.params.id), b.action, {
        bonus: b.bonus,
        note: b.note ?? null,
      });
      return ok(res, r, b.action === 'approve' ? 'Approved.' : 'Rejected.');
    } catch (e) {
      throw new HttpError(422, (e as Error).message);
    }
  }),
);

export default router;
