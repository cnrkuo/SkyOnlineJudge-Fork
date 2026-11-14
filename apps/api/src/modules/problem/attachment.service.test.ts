import { describe, expect, it } from 'vitest';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import type { StorageService } from '../../storage/storage.service.js';
import { admin, fake, user } from '../../testing/fixtures.js';
import { AttachmentService } from './attachment.service.js';
import type { ProblemRepository } from './problem.repository.js';
import type { ProblemService } from './problem.service.js';

function service(problems: Partial<Record<keyof ProblemRepository, unknown>> = {}) {
  return new AttachmentService(
    fake<ProblemService>({ editable: async () => ({}), access: async () => ({}) }),
    fake<ProblemRepository>({ upsertAttachment: async () => undefined, ...problems }),
    fake<StorageService>({ put: async () => undefined, get: async () => Buffer.from('data') }),
  );
}

describe('AttachmentService', () => {
  it('accepts plain file names', async () => {
    await expect(service().upload(admin, 1, new File(['x'], 'figure-1.png'))).resolves.toEqual({
      name: 'figure-1.png',
      size: 1,
    });
  });

  it('rejects names that could escape the problem folder or hide the file', async () => {
    for (const name of ['../secret', '.hidden', 'a b.png', 'x'.repeat(65)]) {
      await expect(service().upload(admin, 1, new File(['x'], name))).rejects.toThrow(BadRequestError);
    }
  });

  it('only serves attachments that are on record', async () => {
    await expect(service({ hasAttachment: async () => false }).get(user, 1, 'figure.png')).rejects.toThrow(
      NotFoundError,
    );
    const file = await service({ hasAttachment: async () => true }).get(user, 1, 'figure.png');
    expect(await file.text()).toBe('data');
  });
});
