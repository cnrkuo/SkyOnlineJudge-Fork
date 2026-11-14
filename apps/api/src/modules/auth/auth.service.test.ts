import { UserLevel } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { GUEST } from '../../common/actor.js';
import { hashPassword, sha256 } from '../../common/crypto.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../common/errors.js';
import { fake } from '../../testing/fixtures.js';
import type { UserRepository } from '../user/user.repository.js';
import { AuthService } from './auth.service.js';
import type { SessionRepository } from './session.repository.js';

/** PHP `password_hash('secret', PASSWORD_BCRYPT)`. */
const LEGACY_SECRET = '$2y$10$92n.WHfZxBLEGhGmEcsOGOK4cUsxFRu4gGfFKrxhYd6o8NuoGySHu';

const stored = (passwordHash: string, level: number = UserLevel.USER) => ({
  id: 7,
  email: 'ann@example.com',
  nickname: 'ann',
  level,
  passwordHash,
});

function service(users: Partial<Record<keyof UserRepository, unknown>>) {
  const sessions: string[] = [];
  const updates: unknown[][] = [];
  const auth = new AuthService(
    fake<UserRepository>({ update: async (...args: unknown[]) => void updates.push(args), ...users }),
    fake<SessionRepository>({
      create: async (hash: string) => void sessions.push(hash),
      deleteExpired: async () => undefined,
      findUser: async () => undefined,
    }),
  );
  return { auth, sessions, updates };
}

describe('AuthService.register', () => {
  const input = { email: 'ann@example.com', nickname: 'ann', password: 'hunter22' };
  const creating = (count: number) => ({
    registrationClash: async () => null,
    count: async () => count,
    create: async (data: { level: number; passwordHash: string }) => ({
      ...stored(data.passwordHash),
      level: data.level,
    }),
  });

  it('makes the very first account the site owner, later ones users', async () => {
    expect((await service(creating(0)).auth.register(input)).user.level).toBe(UserLevel.ROOT);
    expect((await service(creating(5)).auth.register(input)).user.level).toBe(UserLevel.USER);
  });

  it('opens a session and stores only the hash of its token', async () => {
    const { auth, sessions } = service(creating(1));
    const { token } = await auth.register(input);
    expect(sessions).toEqual([sha256(token)]);
  });

  it('names the identifier that is already taken', async () => {
    const { auth } = service({ registrationClash: async () => 'nickname' });
    await expect(auth.register(input)).rejects.toThrow(new ConflictError('This nickname is already registered'));
  });
});

describe('AuthService.login', () => {
  it('rejects unknown accounts and wrong passwords alike', async () => {
    const hash = await hashPassword('right');
    await expect(
      service({ findByIdentifier: async () => undefined }).auth.login({ identifier: 'x', password: 'y' }),
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      service({ findByIdentifier: async () => stored(hash) }).auth.login({ identifier: 'ann', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('refuses banned accounts', async () => {
    const hash = await hashPassword('right');
    const banned = service({ findByIdentifier: async () => stored(hash, UserLevel.BANNED) }).auth;
    await expect(banned.login({ identifier: 'ann', password: 'right' })).rejects.toThrow(ForbiddenError);
  });

  it('accepts a password hash from the PHP system and upgrades it', async () => {
    const { auth, updates } = service({ findByIdentifier: async () => stored(LEGACY_SECRET) });
    await expect(auth.login({ identifier: 'ann', password: 'secret' })).resolves.toHaveProperty('token');
    expect(updates).toHaveLength(1);
    expect(String((updates[0]?.[1] as { passwordHash: string }).passwordHash)).toMatch(/^scrypt\$/);
  });
});

describe('AuthService.resolve', () => {
  it('treats a missing or unknown token as the guest', async () => {
    const { auth } = service({});
    await expect(auth.resolve(undefined)).resolves.toBe(GUEST);
    await expect(auth.resolve('nope')).resolves.toBe(GUEST);
  });
});
