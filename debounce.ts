export function Debounce(delay: number) {
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError("delay must be a non-negative finite number");
  }

  const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();

  return function <This extends object, Args extends any[], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => void {
    return function (this: This, ...args: Args): void {
      const instance = this;
      const existing = timers.get(instance);
      if (existing) clearTimeout(existing);

      timers.set(instance, setTimeout(() => {
        timers.delete(instance);
        void originalMethod.apply(instance, args);
      }, delay));
    };
  };
}
