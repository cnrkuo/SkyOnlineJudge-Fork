import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const md5 = (data: string) => createHash('md5').update(data).digest('hex');
export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** URL-safe random token with `bytes` bytes of entropy. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Hashes written by the legacy PHP system (`password_hash(..., PASSWORD_BCRYPT)`). */
export const isLegacyHash = (stored: string) => /^\$2[aby]\$/.test(stored);

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isLegacyHash(stored)) return bcrypt.compare(password, stored);
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}
