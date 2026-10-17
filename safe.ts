/** Catches synchronous errors and rejected promises from a method. */
export function Safe(onError?: (error: unknown) => void) {
  return function <This, Args extends unknown[], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ) {
    const name = String(context.name);
    const report = (error: unknown) => {
      if (onError) onError(error);
      else console.error(`Error in ${name}:`, error);
    };

    return function (this: This, ...args: Args): Return | Promise<Awaited<Return> | undefined> {
      try {
        const result = originalMethod.call(this, ...args);
        if (result !== null && typeof result === "object" && "then" in result) {
          return Promise.resolve(result).catch((error: unknown) => {
            report(error);
            return undefined;
          }) as Promise<Awaited<Return> | undefined>;
        }
        return result;
      } catch (error) {
        report(error);
        return undefined as Return;
      }
    };
  };
}
