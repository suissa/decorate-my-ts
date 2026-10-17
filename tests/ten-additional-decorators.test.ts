import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  Coalesce, WarnSlow, Fallback, MapResult, GuardArgs, LimitConcurrency,
  Audit, NonReentrant, TrimResult, ResultEnvelope,
} from "../standard-decorators";

describe("ten additional standard decorators", () => {
  it("Coalesce shares concurrent calls with identical arguments", async () => {
    let calls = 0;
    class Example {
      @Coalesce()
      async load(id: number) { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return id; }
    }
    const instance = new Example();
    assert.deepEqual(await Promise.all([instance.load(3), instance.load(3)]), [3, 3]);
    assert.equal(calls, 1);
  });

  it("WarnSlow reports execution duration at or above the threshold", () => {
    const warnings: string[] = [];
    class Example { @WarnSlow(0, name => warnings.push(name)) run() { return true; } }
    new Example().run();
    assert.deepEqual(warnings, ["run"]);
  });

  it("Fallback handles synchronous throws", () => {
    class Example {
      @Fallback(() => "fallback")
      run() { throw new Error("failure"); }
    }
    assert.equal(new Example().run(), "fallback");
  });

  it("MapResult transforms returned values", () => {
    class Example {
      @MapResult((value: number) => value * 10)
      run() { return 4; }
    }
    assert.equal(new Example().run(), 40);
  });

  it("GuardArgs rejects invalid arguments before invocation", () => {
    class Example {
      @GuardArgs((value: number) => value > 0, "positive values only")
      run(value: number) { return value; }
    }
    const instance = new Example();
    assert.equal(instance.run(2), 2);
    assert.throws(() => instance.run(-1), /positive values only/);
  });

  it("LimitConcurrency caps overlapping asynchronous executions", async () => {
    let active = 0;
    let maximum = 0;
    class Example {
      @LimitConcurrency(2)
      async run() {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active--;
      }
    }
    const instance = new Example();
    await Promise.all(Array.from({ length: 6 }, () => instance.run()));
    assert.equal(maximum, 2);
  });

  it("Audit emits start and success events without argument values", () => {
    const phases: string[] = [];
    class Example {
      @Audit(event => phases.push(event.phase))
      run(_secret: string) { return true; }
    }
    new Example().run("not-for-logs");
    assert.deepEqual(phases, ["start", "success"]);
  });

  it("NonReentrant blocks overlapping async calls on one instance", async () => {
    class Example {
      @NonReentrant()
      async run() { await new Promise(resolve => setTimeout(resolve, 10)); return true; }
    }
    const instance = new Example();
    const first = instance.run();
    assert.throws(() => instance.run(), /Reentrant call blocked/);
    assert.equal(await first, true);
  });

  it("TrimResult trims string results", () => {
    class Example { @TrimResult run() { return "  clean  "; } }
    assert.equal(new Example().run(), "clean");
  });

  it("ResultEnvelope wraps successful values", () => {
    class Example { @ResultEnvelope() run() { return 12; } }
    assert.deepEqual(new Example().run(), { ok: true, value: 12 });
  });
});
