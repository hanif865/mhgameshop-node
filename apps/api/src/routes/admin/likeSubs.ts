import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok, paginated, parsePagination } from '../../utils/response';
import {
  listLikeSubscriptions,
  cancelLikeSubscription,
} from '../../services/like-subscription.service';

const router = Router();

// GET /api/admin/like-subscriptions?page=&perPage=&status=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, perPage, skip, take } = parsePagination(req.query);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { items, total } = await listLikeSubscriptions({ status, skip, take });
    return paginated(res, items, { page, perPage, total });
  }),
);

// POST /api/admin/like-subscriptions/:id/cancel
router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(422, 'Invalid id.');
    const done = await cancelLikeSubscription(id);
    if (!done) throw new HttpError(404, 'Active subscription not found.');
    return ok(res, null, 'Subscription cancelled.');
  }),
);

export default router;
