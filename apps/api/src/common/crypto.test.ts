import { describe, expect, it } from 'vitest';
import { hashPassword, isLegacyHash, verifyPassword } from './crypto.js';

describe('passwords', () => {
  it('round-trips the current scheme', async () => {
    const hash = await hashPassword('correct horse');
    expect(isLegacyHash(hash)).toBe(false);
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('accepts hashes written by PHP password_hash(PASSWORD_BCRYPT)', async () => {
    const legacy = '$2y$10$92n.WHfZxBLEGhGmEcsOGOK4cUsxFRu4gGfFKrxhYd6o8NuoGySHu'; // "secret"
    expect(isLegacyHash(legacy)).toBe(true);
    expect(await verifyPassword('secret', legacy)).toBe(true);
    expect(await verifyPassword('definitely-not-it', legacy)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});
