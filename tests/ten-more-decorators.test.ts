import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CacheResult, RetryOnFailure, Serialize, MapArgs, CountCalls,
  Ensure, ClampResult, Bind, Before, After,
} from "../standard-decorators";

describe("ten more TypeScript 5 standard decorators", () => {
  it("CacheResult caches by arguments and instance", () => {
    let calls = 0;
    class Example { @CacheResult(10_000) value(n: number) { calls++; return n * 2; } }
    const first = new Example();
    assert.equal(first.value(2), 4);
    assert.equal(first.value(2), 4);
    assert.equal(first.value(3), 6);
    assert.equal(new Example().value(2), 4);
    assert.equal(calls, 3);
  });

  it("RetryOnFailure retries rejected asynchronous calls", async () => {
    let calls = 0;
    class Example {
      @RetryOnFailure(3)
      async run() { calls++; if (calls < 3) throw new Error("temporary"); return "ok"; }
    }
    assert.equal(await new Example().run(), "ok");
    assert.equal(calls, 3);
  });

  it("Serialize executes asynchronous calls in invocation order", async () => {
    const order: number[] = [];
    class Example {
      @Serialize()
      async run(n: number) { await new Promise(resolve => setTimeout(resolve, n === 1 ? 10 : 0)); order.push(n); return n; }
    }
    const instance = new Example();
    const results = await Promise.all([instance.run(1), instance.run(2)]);
    assert.deepEqual(order, [1, 2]);
    assert.deepEqual(results, [1, 2]);
  });

  it("MapArgs transforms arguments before invocation", () => {
    class Example {
      @MapArgs((value: string) => [value.trim()])
      run(value: string) { return value.toUpperCase(); }
    }
    assert.equal(new Example().run("  ok  "), "OK");
  });

  it("CountCalls reports successive invocation counts", () => {
    const counts: number[] = [];
    class Example { @CountCalls(count => counts.push(count)) run() { return true; } }
    const instance = new Example();
    instance.run(); instance.run(); instance.run();
    assert.deepEqual(counts, [1, 2, 3]);
  });

  it("Ensure prevents invocation when a precondition fails", () => {
    class Example {
      enabled = false;
      @Ensure((instance: Example) => instance.enabled, "disabled")
      run() { return "ran"; }
    }
    assert.throws(() => new Example().run(), /disabled/);
  });

  it("ClampResult bounds numeric return values", () => {
    class Example { @ClampResult(0, 10) run(value: number) { return value; } }
    const instance = new Example();
    assert.equal(instance.run(-3), 0);
    assert.equal(instance.run(5), 5);
    assert.equal(instance.run(99), 10);
  });

  it("Bind preserves the instance when a method is detached", () => {
    class Example {
      value = 42;
      @Bind
      read() { return this.value; }
    }
    const instance = new Example();
    const detached = instance.read;
    assert.equal(detached(), 42);
  });

  it("Before runs its hook before the method", () => {
    const events: string[] = [];
    class Example {
      @Before(() => events.push("before"))
      run() { events.push("method"); return true; }
    }
    new Example().run();
    assert.deepEqual(events, ["before", "method"]);
  });

  it("After receives successful synchronous and asynchronous results", async () => {
    const results: unknown[] = [];
    class Example {
      @After(result => { results.push(result); })
      sync() { return 7; }
      @After(result => { results.push(result); })
      async async() { return "done"; }
    }
    const instance = new Example();
    assert.equal(instance.sync(), 7);
    assert.equal(await instance.async(), "done");
    assert.deepEqual(results, [7, "done"]);
  });
});
