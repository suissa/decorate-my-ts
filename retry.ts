export function Retry(retries = 3, delay = 1000, backoff = false) {
  if (!Number.isInteger(retries) || retries < 1) {
    throw new RangeError("retries must be a positive integer");
  }
  if (!Number.isFinite(delay) || delay < 0) {
    throw new RangeError("delay must be a non-negative finite number");
  }

  return function <This, Args extends any[], Return>(
    originalMethod: (this: This, ...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    return async function (this: This, ...args: Args): Promise<Return> {
      for (let attempt = 0; ; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          if (attempt + 1 >= retries) throw error;
          const waitTime = backoff ? delay * (attempt + 1) : delay;
          await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
        }
      }
    };
  };
}
