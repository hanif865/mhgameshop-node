import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../middleware/error';
import { ok } from '../../utils/response';
import { clearSettingsCache } from '../../utils/settings';

const router = Router();

// GET /api/admin/settings — all settings as a flat key-value object.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.setting.findMany();
    const obj: Record<string, string | null> = {};
    for (const r of rows) obj[r.key] = r.value;
    return ok(res, obj);
  }),
);

// PUT /api/admin/settings — bulk upsert { key: value, ... }.
const schema = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const payload = schema.parse(req.body);
    const entries = Object.entries(payload);

    await prisma.$transaction(
      entries.map(([key, value]) => {
        const v = value === null ? null : String(value);
        return prisma.setting.upsert({
          where: { key },
          update: { value: v },
          create: { key, value: v },
        });
      }),
    );

    await clearSettingsCache();
    return ok(res, null, `${entries.length} settings updated.`);
  }),
);

export default router;
