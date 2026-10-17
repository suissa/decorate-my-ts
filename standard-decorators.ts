type Method<This, Args extends unknown[], Return> = (this: This, ...args: Args) => Return;

/** Logs invocation, duration, result status, and errors without logging argument values. */
export function LogCall<This, Args extends unknown[], Return>(
  logger: (message: string, details?: unknown) => void = console.info,
) {
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      const started = Date.now();
      logger(`[${name}] started`, { argumentCount: args.length });
      try {
        const result = method.apply(this, args);
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
          return Promise.resolve(result).then(
            value => { logger(`[${name}] succeeded`, { durationMs: Date.now() - started }); return value; },
            error => { logger(`[${name}] failed`, { durationMs: Date.now() - started, error }); throw error; },
          ) as Return;
        }
        logger(`[${name}] succeeded`, { durationMs: Date.now() - started });
        return result;
      } catch (error) {
        logger(`[${name}] failed`, { durationMs: Date.now() - started, error });
        throw error;
      }
    };
  };
}

/** Runs the method once per instance and reuses its first result. */
export function Once<This extends object, Args extends unknown[], Return>() {
  const results = new WeakMap<This, { value: Return }>();
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return {
      const existing = results.get(this);
      if (existing) return existing.value;
      const value = method.apply(this, args);
      results.set(this, { value });
      return value;
    };
  };
}

/** Rejects an asynchronous invocation when it exceeds the configured deadline. */
export function Timeout<This, Args extends unknown[], Return>(timeoutMs: number) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new RangeError("timeoutMs must be a non-negative finite number");
  return function (method: Method<This, Args, Promise<Return>>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Promise<Return>>>) {
    return async function (this: This, ...args: Args): Promise<Return> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          method.apply(this, args),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs); }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
  };
}

/** Opens after N consecutive failures and rejects calls until the reset interval elapses. */
export function CircuitBreaker<This, Args extends unknown[], Return>(failureThreshold = 3, resetAfterMs = 30_000) {
  if (!Number.isInteger(failureThreshold) || failureThreshold < 1) throw new RangeError("failureThreshold must be a positive integer");
  if (!Number.isFinite(resetAfterMs) || resetAfterMs < 0) throw new RangeError("resetAfterMs must be non-negative");
  const states = new WeakMap<object, { failures: number; openedAt?: number }>();
  return function (method: Method<This, Args, Promise<Return>>, context: ClassMethodDecoratorContext<This, Method<This, Args, Promise<Return>>>) {
    const name = String(context.name);
    return async function (this: This, ...args: Args): Promise<Return> {
      const key = this as object;
      const state = states.get(key) ?? { failures: 0 };
      if (state.openedAt !== undefined) {
        if (Date.now() - state.openedAt < resetAfterMs) throw new Error(`Circuit breaker open for ${name}`);
        state.failures = 0;
        state.openedAt = undefined;
      }
      states.set(key, state);
      try {
        const result = await method.apply(this, args);
        state.failures = 0;
        state.openedAt = undefined;
        return result;
      } catch (error) {
        state.failures += 1;
        if (state.failures >= failureThreshold) state.openedAt = Date.now();
        throw error;
      }
    };
  };
}

/** Checks each method result against a runtime predicate. */
export function ValidateReturn<This, Args extends unknown[], Return>(
  predicate: (value: unknown) => value is Return,
  message = "Method returned an invalid value",
) {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const validate = (value: unknown): Return => {
      if (!predicate(value)) throw new TypeError(message);
      return value;
    };
    return function (this: This, ...args: Args): Return {
      const result = method.apply(this, args);
      if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
        return Promise.resolve(result).then(validate) as Return;
      }
      return validate(result);
    };
  };
}

/** Deep-freezes object results to prevent accidental mutation. */
export function FreezeResult<This, Args extends unknown[], Return>(
  method: Method<This, Args, Return>,
  _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>,
) {
  const freeze = (value: unknown, seen = new WeakSet<object>()): void => {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
    Object.freeze(value);
  };
  return function (this: This, ...args: Args): Return {
    const result = method.apply(this, args);
    if (result !== null && typeof result === "object" && !("then" in result)) freeze(result);
    return result;
  };
}

/** Emits a deprecation warning once for this decorated method. */
export function Deprecated<This, Args extends unknown[], Return>(message = "This method is deprecated") {
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    let warned = false;
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (!warned) { warned = true; console.warn(`[${name}] ${message}`); }
      return method.apply(this, args);
    };
  };
}

/** Enforces a minimum and optional maximum number of positional arguments. */
export function RequireArgs<This, Args extends unknown[], Return>(minimum: number, maximum = Number.POSITIVE_INFINITY) {
  if (!Number.isInteger(minimum) || minimum < 0 || maximum < minimum) throw new RangeError("Invalid argument count bounds");
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (args.length < minimum || args.length > maximum) throw new TypeError(`${name} expects ${minimum}-${maximum} arguments; received ${args.length}`);
      return method.apply(this, args);
    };
  };
}

/** Requires a method to return a Promise/thenable; otherwise throws a TypeError. */
export function AsyncOnly<This, Args extends unknown[], Return>(
  method: Method<This, Args, Return>,
  context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>,
) {
  const name = String(context.name);
  return function (this: This, ...args: Args): Promise<Awaited<Return>> {
    const result = method.apply(this, args);
    if (result === null || (typeof result !== "object" && typeof result !== "function") || !("then" in result)) {
      throw new TypeError(`${name} must return a Promise or thenable`);
    }
    return Promise.resolve(result);
  };
}

/** Transforms synchronous results and fulfilled asynchronous results. */
export function TransformResult<This, Args extends unknown[], Return, Next>(
  transform: (value: Awaited<Return>) => Next,
) {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Next | Promise<Next> {
      const result = method.apply(this, args);
      if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
        return Promise.resolve(result).then(transform);
      }
      return transform(result as Awaited<Return>);
    };
  };
}

/** Guards a method with an instance-and-arguments authorization predicate. */
export function Authorize<This, Args extends unknown[], Return>(
  canInvoke: (instance: This, args: Args) => boolean,
  message = "Not authorized to invoke method",
) {
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (!canInvoke(this, args)) throw new Error(`${message}: ${name}`);
      return method.apply(this, args);
    };
  };
}
