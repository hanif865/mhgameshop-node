import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/error';
import { ok } from '../utils/response';
import { initiateDeposit } from '../services/deposit.service';

const router = Router();

const initiateSchema = z.object({
  amount: z.coerce.number().positive().min(10).max(1_000_000),
});

// POST /api/deposits/initiate — start an UddoktaPay add-funds payment.
router.post(
  '/initiate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = initiateSchema.parse(req.body);
    const result = await initiateDeposit(req.userId!, amount);
    return ok(res, result, 'Redirecting to payment...');
  }),
);

export default router;
