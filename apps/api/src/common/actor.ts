import { UserLevel } from '@skyoj/contract';
import { ForbiddenError, UnauthorizedError } from './errors.js';

/** The authenticated principal a request acts on behalf of. */
export interface Actor {
  id: number;
  nickname: string;
  email: string;
  level: UserLevel;
}

export const GUEST: Actor = { id: 0, nickname: 'Guest', email: '', level: UserLevel.GUEST };

export const isLoggedIn = (actor: Actor) => actor.id !== 0;
export const isUser = (actor: Actor) => actor.level >= UserLevel.USER;
export const isAdmin = (actor: Actor) => actor.level >= UserLevel.ADMIN;

/**
 * Object-level access rule inherited from the legacy system
 * (`User::testStisfyPermission`): the actor may access an object when they
 * own it, outrank its owner, or exceed the object's required level.
 */
export function satisfies(actor: Actor, owner: { id: number; level: number }, requiredLevel: number): boolean {
  return (isLoggedIn(actor) && actor.id === owner.id) || actor.level > owner.level || actor.level > requiredLevel;
}

export function requireLogin(actor: Actor): void {
  if (!isLoggedIn(actor)) throw new UnauthorizedError();
}

/** Logged in with a verified, non-banned account. */
export function requireUser(actor: Actor): void {
  requireLogin(actor);
  if (!isUser(actor)) throw new ForbiddenError('Your account is not allowed to do this');
}

export function requireAdmin(actor: Actor): void {
  requireLogin(actor);
  if (!isAdmin(actor)) throw new ForbiddenError('Administrator permission required');
}
