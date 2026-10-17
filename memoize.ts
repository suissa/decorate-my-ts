interface CacheEntry { value: unknown; expiry: number; }

type AnyMethod = (this: object, ...args: any[]) => any;

export function Memoize(ttlMs?: number, keyResolver?: (...args: any[]) => string) {
  const caches = new WeakMap<object, Map<string, CacheEntry>>();

  return function <This extends object, Args extends any[], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    return function (this: This, ...args: Args): Return {
      let cache = caches.get(this);
      if (!cache) {
        cache = new Map<string, CacheEntry>();
        caches.set(this, cache);
      }

      const key = keyResolver ? keyResolver(...args) : JSON.stringify(args);
      const existing = cache.get(key);
      if (existing && (!ttlMs || Date.now() < existing.expiry)) {
        return existing.value as Return;
      }
      if (existing) cache.delete(key);

      const result = originalMethod.apply(this, args);
      cache.set(key, { value: result, expiry: ttlMs ? Date.now() + ttlMs : Infinity });
      return result;
    };
  };
}
