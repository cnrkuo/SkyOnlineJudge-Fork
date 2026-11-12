export type DomainErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT';

/**
 * Errors raised by the service layer. They carry no transport details; the
 * oRPC interceptor in `app.module.ts` translates them into contract errors.
 */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends DomainError {
  constructor(message = 'Bad request') {
    super('BAD_REQUEST', message);
  }
}
export class UnauthorizedError extends DomainError {
  constructor(message = 'Please log in first') {
    super('UNAUTHORIZED', message);
  }
}
export class ForbiddenError extends DomainError {
  constructor(message = 'Access denied') {
    super('FORBIDDEN', message);
  }
}
export class NotFoundError extends DomainError {
  constructor(what = 'Resource') {
    super('NOT_FOUND', `${what} not found`);
  }
}
export class ConflictError extends DomainError {
  constructor(message: string) {
    super('CONFLICT', message);
  }
}
