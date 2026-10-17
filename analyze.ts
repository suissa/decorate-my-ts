/** Measures execution time and heap delta for a method. */
export function Analyze(label?: string) {
  return function <This, Args extends unknown[], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ) {
    const tag = label ?? String(context.name);

    return function (this: This, ...args: Args): Return {
      const start = Date.now();
      const startMemory = typeof process !== "undefined" ? process.memoryUsage().heapUsed : 0;

      const finish = () => {
        const endMemory = typeof process !== "undefined" ? process.memoryUsage().heapUsed : startMemory;
        console.info(`[${tag}] ${Date.now() - start}ms; heap delta: ${((endMemory - startMemory) / 1024 / 1024).toFixed(4)} MB`);
      };

      try {
        const result = originalMethod.call(this, ...args);
        if (result !== null && typeof result === "object" && "then" in result) {
          return Promise.resolve(result).finally(finish) as Return;
        }
        finish();
        return result;
      } catch (error) {
        finish();
        throw error;
      }
    };
  };
}
