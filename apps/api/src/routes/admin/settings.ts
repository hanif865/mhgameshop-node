import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database';
import { asyncHandler, HttpError } from '../../middleware/error';
import { ok } from '../../utils/response';
import { clearSettingsCache } from '../../utils/settings';
import { uploader, relPath } from '../../config/upload';

const router = Router();

// PUT /api/admin/settings/upload/:key — upload an image and store its path in a setting.
const UPLOADABLE = new Set(['site_logo', 'site_favicon', 'pwa_icon']);

router.put(
  '/upload/:key',
  uploader('site').single('file'),
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!UPLOADABLE.has(key)) throw new HttpError(400, 'This setting is not an image.');
    if (!req.file) throw new HttpError(422, 'No image uploaded.');

    const value = relPath('site', req.file.filename);
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    await clearSettingsCache();
    return ok(res, { key, value }, 'Image uploaded.');
  }),
);

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
