import { createParamDecorator, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../modules/auth/auth.service.js';
import { GUEST, type Actor } from './actor.js';

type AuthedRequest = Request & { actor?: Actor; bearerToken?: string };

export function bearerTokenOf(request: Request): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7).trim() || undefined : undefined;
}

/**
 * Global guard that resolves the bearer token into an {@link Actor}.
 * It never rejects: guests are valid actors and each service method decides
 * what a given actor may do.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    request.bearerToken = bearerTokenOf(request);
    request.actor = await this.auth.resolve(request.bearerToken);
    return true;
  }
}

/** Injects the actor resolved by {@link AuthGuard}. */
export const CurrentActor = createParamDecorator((_: unknown, context: ExecutionContext): Actor => {
  return context.switchToHttp().getRequest<AuthedRequest>().actor ?? GUEST;
});

/** Injects the raw bearer token, if any. */
export const BearerToken = createParamDecorator((_: unknown, context: ExecutionContext): string | undefined => {
  return context.switchToHttp().getRequest<AuthedRequest>().bearerToken;
});
