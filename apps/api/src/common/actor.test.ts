import { AccessLevel, UserLevel } from '@skyoj/contract';
import { describe, expect, it } from 'vitest';
import { GUEST, requireAdmin, requireUser, satisfies, type Actor } from './actor.js';
import { ForbiddenError, UnauthorizedError } from './errors.js';

const actor = (id: number, level: UserLevel): Actor => ({ id, level, nickname: `u${id}`, email: '' });
const user = actor(1, UserLevel.USER);
const admin = actor(2, UserLevel.ADMIN);
const otherAdmin = actor(3, UserLevel.ADMIN);
const root = actor(4, UserLevel.ROOT);
const ownedByAdmin = { id: admin.id, level: admin.level };

describe('satisfies', () => {
  it('OPEN objects are visible to everyone, including guests', () => {
    expect(satisfies(GUEST, ownedByAdmin, AccessLevel.OPEN)).toBe(true);
  });

  it('ADMIN objects are visible to administrators only', () => {
    expect(satisfies(user, ownedByAdmin, AccessLevel.ADMIN)).toBe(false);
    expect(satisfies(otherAdmin, ownedByAdmin, AccessLevel.ADMIN)).toBe(true);
  });

  it('HIDDEN objects are visible to the owner and to higher ranks', () => {
    expect(satisfies(admin, ownedByAdmin, AccessLevel.HIDDEN)).toBe(true);
    expect(satisfies(otherAdmin, ownedByAdmin, AccessLevel.HIDDEN)).toBe(false);
    expect(satisfies(root, ownedByAdmin, AccessLevel.HIDDEN)).toBe(true);
  });

  it('a guest never matches as owner', () => {
    expect(satisfies(GUEST, { id: 0, level: UserLevel.ROOT }, AccessLevel.HIDDEN)).toBe(false);
  });
});

describe('require*', () => {
  it('distinguishes "not logged in" from "not allowed"', () => {
    expect(() => requireUser(GUEST)).toThrow(UnauthorizedError);
    expect(() => requireUser(actor(5, UserLevel.BANNED))).toThrow(ForbiddenError);
    expect(() => requireAdmin(user)).toThrow(ForbiddenError);
    expect(() => requireAdmin(admin)).not.toThrow();
  });
});
