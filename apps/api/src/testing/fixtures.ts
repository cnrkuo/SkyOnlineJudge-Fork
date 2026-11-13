import { UserLevel } from '@skyoj/contract';
import { type Actor, GUEST } from '../common/actor.js';

/** Test-only helpers. Not part of the build (tsconfig.build.json). */

export const actor = (id: number, level: UserLevel = UserLevel.USER): Actor => ({
  id,
  level,
  nickname: `user${id}`,
  email: `user${id}@example.com`,
});

export const guest = GUEST;
export const user = actor(1, UserLevel.USER);
export const admin = actor(2, UserLevel.ADMIN);
export const root = actor(3, UserLevel.ROOT);

/**
 * Stands in for a class the code under test depends on: only the members a
 * test provides exist, anything else fails loudly when called.
 */
export function fake<T>(members: Partial<Record<keyof T, unknown>>): T {
  return new Proxy(members, {
    get(target, property) {
      if (property in target) return target[property as keyof typeof target];
      if (property === 'then') return undefined;
      throw new Error(`fake: ${String(property)} was not provided`);
    },
  }) as T;
}

export const minutesFrom = (base: Date, minutes: number) => new Date(base.getTime() + minutes * 60_000);
