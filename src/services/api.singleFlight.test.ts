import { describe, expect, it, vi } from 'vitest';
import { SingleFlight } from './api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SingleFlight', () => {
  it('reuses the in-flight promise for overlapping calls with the same key', async () => {
    const guard = new SingleFlight();
    const blocker = deferred<string>();
    const task = vi.fn(() => blocker.promise);

    const first = guard.run('refresh', task);
    const second = guard.run('refresh', task);

    expect(second).toBe(first);
    expect(guard.isInFlight('refresh')).toBe(true);

    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);

    blocker.resolve('done');
    await expect(first).resolves.toBe('done');
  });

  it('runs different keys independently', async () => {
    const guard = new SingleFlight();
    const task = vi.fn(async () => 'ok');

    await guard.run('a', task);
    await guard.run('b', task);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it('releases the key after success so a later call runs again', async () => {
    const guard = new SingleFlight();
    const task = vi.fn(async () => 'ok');

    await guard.run('refresh', task);
    expect(guard.isInFlight('refresh')).toBe(false);

    await guard.run('refresh', task);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('releases the key after failure so a retry is not blocked', async () => {
    const guard = new SingleFlight();
    const failing = deferred<string>();
    const task = vi.fn(() => failing.promise);

    const pending = guard.run('refresh', task);
    await Promise.resolve();
    expect(guard.isInFlight('refresh')).toBe(true);

    failing.reject(new Error('boom'));
    await expect(pending).rejects.toThrow('boom');

    expect(guard.isInFlight('refresh')).toBe(false);

    const retry = vi.fn(async () => 'ok');
    await expect(guard.run('refresh', retry)).resolves.toBe('ok');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('propagates the same rejection to all joined callers', async () => {
    const guard = new SingleFlight();
    const failing = deferred<string>();
    const task = vi.fn(() => failing.promise);

    const first = guard.run('refresh', task);
    await Promise.resolve();
    const second = guard.run('refresh', task);

    expect(second).toBe(first);

    failing.reject(new Error('nope'));

    await expect(first).rejects.toThrow('nope');
    await expect(second).rejects.toThrow('nope');
  });
});
