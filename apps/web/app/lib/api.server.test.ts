import { ORPCError } from '@orpc/client';
import { describe, expect, it } from 'vitest';
import { load, submit } from './api.server';

const request = new Request('http://judge.test/problems/3?tab=stats');

describe('load', () => {
  it('returns the data of a successful call', async () => {
    await expect(load(request, async () => 42)).resolves.toBe(42);
  });

  it('sends guests to the login page and back', async () => {
    const thrown = await load(request, async () => {
      throw new ORPCError('UNAUTHORIZED');
    }).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get('Location')).toBe('/login?next=%2Fproblems%2F3%3Ftab%3Dstats');
  });

  it('turns other contract errors into the matching HTTP status', async () => {
    const thrown = await load(request, async () => {
      throw new ORPCError('FORBIDDEN', { message: 'No access' });
    }).catch((error: unknown) => error);
    expect(thrown).toMatchObject({ init: { status: 403 }, data: 'No access' });
  });

  it('waits for a queued write when asked to', async () => {
    let calls = 0;
    const call = async () => {
      calls++;
      if (calls < 3) throw new ORPCError('NOT_FOUND');
      return 'created';
    };
    await expect(load(request, call, { awaitCreation: true })).resolves.toBe('created');
    expect(calls).toBe(3);
  });
});

describe('submit', () => {
  it('returns contract errors for the form instead of throwing', async () => {
    const result = await submit(request, async () => {
      throw new ORPCError('CONFLICT', { message: 'This nickname is already taken' });
    });
    expect(result).toEqual({ ok: false, error: 'This nickname is already taken' });
  });

  it('joins validation issues into one sentence', async () => {
    const result = await submit(request, async () => {
      throw new ORPCError('BAD_REQUEST', {
        data: { issues: [{ message: 'email must be an email address' }, { message: 'password is too short' }] },
      });
    });
    expect(result).toEqual({ ok: false, error: 'email must be an email address; password is too short' });
  });

  it('still throws unexpected errors', async () => {
    await expect(
      submit(request, async () => {
        throw new TypeError('bug');
      }),
    ).rejects.toThrow(TypeError);
  });
});
