export const TIMEOUT = Symbol('timeout');

// ms <= 0 表示不限时
export function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  ms: number,
): Promise<IteratorResult<T> | typeof TIMEOUT> {
  if (ms <= 0) return iterator.next();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMEOUT>(resolve => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  return Promise.race([iterator.next(), timeout]).finally(() => clearTimeout(timer));
}
