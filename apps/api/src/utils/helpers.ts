import { randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Laravel Str::random() equivalent — used for track ids / transaction ids. */
export function strRandom(length = 16): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Decimal-safe money formatting to 2 dp as a string (matches PHP number_format). */
export function money(value: number): string {
  return value.toFixed(2);
}

/** Split a textarea into trimmed, non-empty, de-duplicated code lines. */
export function parseCodeLines(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const code = raw.trim();
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}
