import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Memoize } from "../memoize";
import { Retry } from "../retry";
import { Debounce } from "../debounce";

describe("TypeScript 5 standard method decorators", () => {
  it("Memoize caches values per instance and argument list", () => {
    let calls = 0;
    class Example {
      @Memoize()
      value(input: number) { calls++; return input * 2; }
    }
    const example = new Example();
    assert.equal(example.value(3), 6);
    assert.equal(example.value(3), 6);
    assert.equal(calls, 1);
  });

  it("Memoize does not share cache between instances", () => {
    let calls = 0;
    class Example {
      @Memoize()
      value(input: number) { calls++; return input; }
    }
    new Example().value(1);
    new Example().value(1);
    assert.equal(calls, 2);
  });

  it("Retry retries rejected asynchronous calls", async () => {
    let calls = 0;
    class Example {
      @Retry(3, 0)
      async run() {
        calls++;
        if (calls < 3) throw new Error("temporary");
        return "ok";
      }
    }
    assert.equal(await new Example().run(), "ok");
    assert.equal(calls, 3);
  });

  it("Debounce executes only the latest invocation", async () => {
    const values: number[] = [];
    class Example {
      @Debounce(10)
      run(value: number) { values.push(value); }
    }
    const example = new Example();
    example.run(1);
    example.run(2);
    example.run(3);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(values, [3]);
  });
});
