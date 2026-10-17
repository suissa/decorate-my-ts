import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LogCall, Once, Timeout, CircuitBreaker, ValidateReturn, FreezeResult,
  Deprecated, RequireArgs, AsyncOnly, TransformResult, Authorize,
} from "../standard-decorators";

describe("additional standard decorators", () => {
  it("LogCall logs without argument values and preserves the result", () => {
    const messages: string[] = [];
    class Example { @LogCall((message) => messages.push(message)) value(n: number) { return n * 2; } }
    assert.equal(new Example().value(3), 6);
    assert.deepEqual(messages, ["[value] started", "[value] succeeded"]);
  });

  it("Once memoizes the first result per instance", () => {
    let calls = 0;
    class Example { @Once() value(n: number) { calls++; return n; } }
    const instance = new Example();
    assert.equal(instance.value(1), 1);
    assert.equal(instance.value(2), 1);
    assert.equal(calls, 1);
    assert.equal(new Example().value(3), 3);
  });

  it("Timeout rejects slow asynchronous methods", async () => {
    class Example { @Timeout(5) async run() { await new Promise(r => setTimeout(r, 20)); return "late"; } }
    await assert.rejects(new Example().run(), /timed out/);
  });

  it("CircuitBreaker opens after the failure threshold", async () => {
    class Example { @CircuitBreaker(2, 60_000) async run() { throw new Error("failure"); } }
    const instance = new Example();
    await assert.rejects(instance.run(), /failure/);
    await assert.rejects(instance.run(), /failure/);
    await assert.rejects(instance.run(), /Circuit breaker open/);
  });

  it("ValidateReturn rejects values outside the predicate", () => {
    class Example { @ValidateReturn((value): value is number => typeof value === "number") value() { return "bad" as unknown as number; } }
    assert.throws(() => new Example().value(), /invalid value/i);
  });

  it("FreezeResult freezes returned objects", () => {
    class Example { @FreezeResult value() { return { nested: { count: 1 } }; } }
    const value = new Example().value();
    assert.equal(Object.isFrozen(value), true);
    assert.equal(Object.isFrozen(value.nested), true);
  });

  it("Deprecated warns once", () => {
    const original = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: unknown) => { warnings.push(String(message)); };
    try {
      class Example { @Deprecated("use replacement") run() { return true; } }
      const instance = new Example();
      instance.run(); instance.run();
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /use replacement/);
    } finally { console.warn = original; }
  });

  it("RequireArgs enforces positional argument bounds", () => {
    class Example { @RequireArgs(1, 2) run(value: string) { return value; } }
    assert.equal(new Example().run("ok"), "ok");
    assert.throws(() => (new Example().run as (...args: unknown[]) => string)(), /expects/);
  });

  it("AsyncOnly rejects synchronous return values", () => {
    class Example { @AsyncOnly run() { return 42; } }
    assert.throws(() => new Example().run(), /must return a Promise/);
  });

  it("TransformResult transforms a value", () => {
    class Example { @TransformResult((value: number) => String(value)) run() { return 42; } }
    assert.equal(new Example().run(), "42");
  });

  it("Authorize blocks calls when the predicate fails", () => {
    class Example { @Authorize((instance: { allowed: boolean }) => instance.allowed) allowed = false; run() { return "secret"; } }
    assert.throws(() => new Example().run(), /Not authorized/);
  });
});
