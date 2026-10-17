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


/** Caches results per instance and argument tuple for the configured time-to-live. */
export function CacheResult<This extends object, Args extends unknown[], Return>(ttlMs = 30_000) {
  if (!Number.isFinite(ttlMs) || ttlMs < 0) throw new RangeError("ttlMs must be a non-negative finite number");
  const cache = new WeakMap<This, Map<string, { expiresAt: number; value: Return }>>();
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return {
      let instanceCache = cache.get(this);
      if (!instanceCache) { instanceCache = new Map(); cache.set(this, instanceCache); }
      const key = JSON.stringify(args);
      const now = Date.now();
      const entry = instanceCache.get(key);
      if (entry && entry.expiresAt >= now) return entry.value;
      const value = method.apply(this, args);
      instanceCache.set(key, { expiresAt: now + ttlMs, value });
      return value;
    };
  };
}

/** Retries rejected promises up to maxAttempts total invocations. */
export function RetryOnFailure<This, Args extends unknown[], Return>(maxAttempts = 3, delayMs = 0) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("maxAttempts must be a positive integer");
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError("delayMs must be non-negative");
  return function (method: Method<This, Args, Promise<Return>>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Promise<Return>>>) {
    return async function (this: This, ...args: Args): Promise<Return> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try { return await method.apply(this, args); }
        catch (error) {
          lastError = error;
          if (attempt < maxAttempts && delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
      throw lastError;
    };
  };
}

/** Serializes asynchronous calls per instance, preserving invocation order. */
export function Serialize<This extends object, Args extends unknown[], Return>() {
  const queues = new WeakMap<This, Promise<unknown>>();
  return function (method: Method<This, Args, Promise<Return>>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Promise<Return>>>) {
    return function (this: This, ...args: Args): Promise<Return> {
      const previous = queues.get(this) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(() => method.apply(this, args));
      queues.set(this, current);
      return current;
    };
  };
}

/** Maps invocation arguments before calling the original method. */
export function MapArgs<This, Args extends unknown[], Return, Mapped extends unknown[]>(
  mapper: (...args: Args) => Mapped,
) {
  return function (method: Method<This, Mapped, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Mapped, Return>>) {
    return function (this: This, ...args: Args): Return {
      return method.apply(this, mapper(...args));
    };
  };
}

/** Reports the number of invocations without retaining argument values. */
export function CountCalls<This, Args extends unknown[], Return>(onCount: (count: number) => void = () => undefined) {
  let count = 0;
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return {
      count += 1;
      onCount(count);
      return method.apply(this, args);
    };
  };
}

/** Enforces a precondition before the method is invoked. */
export function Ensure<This, Args extends unknown[], Return>(
  condition: (instance: This, args: Args) => boolean,
  message = "Method precondition failed",
) {
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (!condition(this, args)) throw new Error(`${message}: ${name}`);
      return method.apply(this, args);
    };
  };
}

/** Clamps numeric return values to an inclusive range. */
export function ClampResult<This, Args extends unknown[]>(minimum: number, maximum: number) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) throw new RangeError("Invalid clamp range");
  return function (method: Method<This, Args, number>, _context: ClassMethodDecoratorContext<This, Method<This, Args, number>>) {
    return function (this: This, ...args: Args): number {
      return Math.min(maximum, Math.max(minimum, method.apply(this, args)));
    };
  };
}

/** Binds a decorated method to its instance during instance initialization. */
export function Bind<This extends object, Args extends unknown[], Return>(
  method: Method<This, Args, Return>,
  context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>,
): void {
  if (context.private) throw new TypeError("Bind cannot decorate private methods");
  context.addInitializer(function (this: This) {
    const instance = this as This & Record<string | symbol, unknown>;
    const name = context.name;
    Object.defineProperty(instance, name, {
      configurable: true,
      writable: true,
      value: method.bind(this),
    });
  });
}

/** Runs a hook immediately before each invocation. */
export function Before<This, Args extends unknown[], Return>(hook: (instance: This, args: Args) => void) {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return {
      hook(this, args);
      return method.apply(this, args);
    };
  };
}

/** Runs a hook after a successful result, including fulfilled promises. */
export function After<This, Args extends unknown[], Return>(hook: (result: Awaited<Return>, instance: This, args: Args) => void) {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return {
      const result = method.apply(this, args);
      if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
        return Promise.resolve(result).then(value => { hook(value as Awaited<Return>, this, args); return value; }) as Return;
      }
      hook(result as Awaited<Return>, this, args);
      return result;
    };
  };
}


/** Coalesces concurrent async calls with identical arguments per instance. */
export function Coalesce<This extends object, Args extends unknown[], Return>() {
  const inFlight = new WeakMap<This, Map<string, Promise<Return>>>();
  return function (method: Method<This, Args, Promise<Return>>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Promise<Return>>>) {
    return function (this: This, ...args: Args): Promise<Return> {
      let calls = inFlight.get(this);
      if (!calls) { calls = new Map(); inFlight.set(this, calls); }
      const key = JSON.stringify(args);
      const existing = calls.get(key);
      if (existing) return existing;
      const current = Promise.resolve().then(() => method.apply(this, args));
      calls.set(key, current);
      void current.finally(() => { if (calls?.get(key) === current) calls.delete(key); }).catch(() => undefined);
      return current;
    };
  };
}

/** Reports executions whose duration exceeds the supplied threshold. */
export function WarnSlow<This, Args extends unknown[], Return>(
  thresholdMs: number,
  warn: (message: string, durationMs: number) => void = (message, duration) => console.warn(message, duration),
) {
  if (!Number.isFinite(thresholdMs) || thresholdMs < 0) throw new RangeError("thresholdMs must be non-negative");
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      const started = Date.now();
      const report = () => { const duration = Date.now() - started; if (duration >= thresholdMs) warn(name, duration); };
      try {
        const result = method.apply(this, args);
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
          return Promise.resolve(result).finally(report) as Return;
        }
        report();
        return result;
      } catch (error) {
        report();
        throw error;
      }
    };
  };
}

/** Returns a fallback value when a method throws or its promise rejects. */
export function Fallback<This, Args extends unknown[], Return>(
  fallback: (error: unknown, instance: This, args: Args) => Return,
) {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return {
      try {
        const result = method.apply(this, args);
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
          return Promise.resolve(result).catch(error => fallback(error, this, args)) as Return;
        }
        return result;
      } catch (error) {
        return fallback(error, this, args);
      }
    };
  };
}

/** Transforms a method's successful result without changing its arguments. */
export function MapResult<This, Args extends unknown[], Return, Mapped>(
  mapper: (result: Awaited<Return>, instance: This, args: Args) => Mapped,
) {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return | Mapped {
      const result = method.apply(this, args);
      if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
        return Promise.resolve(result).then(value => mapper(value as Awaited<Return>, this, args)) as Return;
      }
      return mapper(result as Awaited<Return>, this, args);
    };
  };
}

/** Rejects calls whose arguments do not satisfy a predicate. */
export function GuardArgs<This, Args extends unknown[], Return>(
  predicate: (...args: Args) => boolean,
  message = "Arguments rejected by guard",
) {
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (!predicate(...args)) throw new TypeError(`${message}: ${name}`);
      return method.apply(this, args);
    };
  };
}

/** Caps concurrent asynchronous executions and queues excess calls in FIFO order. */
export function LimitConcurrency<This, Args extends unknown[], Return>(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer");
  let active = 0;
  const waiting: Array<() => void> = [];
  return function (method: Method<This, Args, Promise<Return>>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Promise<Return>>>) {
    return async function (this: This, ...args: Args): Promise<Return> {
      if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
      active++;
      try { return await method.apply(this, args); }
      finally { active--; waiting.shift()?.(); }
    };
  };
}

/** Emits structured lifecycle events without exposing method arguments. */
export function Audit<This, Args extends unknown[], Return>(
  sink: (event: { method: string; phase: "start" | "success" | "error"; timestamp: number; error?: unknown }) => void,
) {
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      const emit = (phase: "start" | "success" | "error", error?: unknown) => sink({ method: name, phase, timestamp: Date.now(), ...(phase === "error" ? { error } : {}) });
      emit("start");
      try {
        const result = method.apply(this, args);
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
          return Promise.resolve(result).then(value => { emit("success"); return value; }, error => { emit("error", error); throw error; }) as Return;
        }
        emit("success");
        return result;
      } catch (error) {
        emit("error", error);
        throw error;
      }
    };
  };
}

/** Prevents overlapping calls to the same decorated method on one instance. */
export function NonReentrant<This extends object, Args extends unknown[], Return>() {
  const running = new WeakSet<This>();
  return function (method: Method<This, Args, Return>, context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    const name = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (running.has(this)) throw new Error(`Reentrant call blocked: ${name}`);
      running.add(this);
      try {
        const result = method.apply(this, args);
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
          return Promise.resolve(result).finally(() => running.delete(this)) as Return;
        }
        running.delete(this);
        return result;
      } catch (error) {
        running.delete(this);
        throw error;
      }
    };
  };
}

/** Trims whitespace from string results, including fulfilled promises. */
export function TrimResult<This, Args extends unknown[], Return extends string | Promise<string>>(
  method: Method<This, Args, Return>,
  _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>,
): Method<This, Args, Return> {
  return function (this: This, ...args: Args): Return {
    const result: unknown = method.apply(this, args);
    if (result instanceof Promise) {
      return result.then(value => String(value).trim()) as Return;
    }
    return String(result).trim() as Return;
  };
}

/** Converts a successful result into a discriminated success/error envelope. */
export function ResultEnvelope<This, Args extends unknown[], Return>() {
  return function (method: Method<This, Args, Return>, _context: ClassMethodDecoratorContext<This, Method<This, Args, Return>>) {
    return function (this: This, ...args: Args): Return | { ok: true; value: Awaited<Return> } | { ok: false; error: unknown } {
      try {
        const result = method.apply(this, args);
        if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result) {
          return Promise.resolve(result).then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error })) as Return;
        }
        return { ok: true, value: result as Awaited<Return> };
      } catch (error) {
        return { ok: false, error };
      }
    };
  };
}
