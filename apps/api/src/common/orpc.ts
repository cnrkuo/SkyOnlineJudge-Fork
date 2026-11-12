import { Logger } from '@nestjs/common';
import { ORPCError, type ORPCModuleConfig } from '@orpc/nest';
import { DomainError } from './errors.js';

const logger = new Logger('oRPC');

/**
 * Translates service-layer {@link DomainError}s into the typed errors declared
 * in the contract, and logs anything unexpected before it becomes a 500.
 */
export const orpcConfig: ORPCModuleConfig = {
  interceptors: [
    async ({ next }) => {
      try {
        return await next();
      } catch (error) {
        if (error instanceof DomainError) {
          throw new ORPCError(error.code, { message: error.message });
        }
        if (!(error instanceof ORPCError)) {
          logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
        }
        throw error;
      }
    },
  ],
};
