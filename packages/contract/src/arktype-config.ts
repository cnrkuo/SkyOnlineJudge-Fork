import { configure } from 'arktype/config';

/**
 * Global ArkType settings. This module must be imported before `arktype`
 * itself, which is why `schemas.ts` imports it first.
 *
 * Keys a schema does not declare are removed. On inputs that discards
 * anything a client sends beyond the contract; on outputs it guarantees the
 * API cannot leak a column the contract does not list.
 */
configure({ onUndeclaredKey: 'delete' });
