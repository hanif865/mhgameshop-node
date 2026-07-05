import multer from 'multer';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { HttpError } from '../middleware/error';

/**
 * Image upload helper. Files are written to public/storage/{subdir}/ and the
 * DB stores the relative path "subdir/filename" — served back via the
 * /storage static mount configured in index.ts.
 */
const ROOT = path.resolve('public/storage');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']);

export function uploader(subdir: string) {
  const dir = path.join(ROOT, subdir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, unique);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED.has(file.mimetype)) {
        return cb(new HttpError(422, 'Only image files are allowed.'));
      }
      cb(null, true);
    },
  });
}

/** Convert a stored upload into the DB path, e.g. "products/162..-3.png". */
export function relPath(subdir: string, filename: string): string {
  return `${subdir}/${filename}`;
}
