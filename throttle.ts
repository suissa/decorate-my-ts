/** Limits a method to at most one invocation per interval, per instance. */
export function Throttle(interval: number) {
  if (!Number.isFinite(interval) || interval < 0) {
    throw new RangeError("Throttle interval must be a non-negative finite number.");
  }

  const lastRun = new WeakMap<object, number>();

  return function <This extends object, Args extends unknown[], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ) {
    const name = String(context.name);

    return function (this: This, ...args: Args): Return | undefined {
      const now = Date.now();
      const previous = lastRun.get(this) ?? Number.NEGATIVE_INFINITY;
      if (now - previous < interval) return undefined;
      lastRun.set(this, now);
      return originalMethod.call(this, ...args);
    };
  };
}
