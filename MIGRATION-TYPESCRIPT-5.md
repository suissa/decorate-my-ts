# TypeScript 5 standard decorators migration

This branch starts the migration to the Stage 3 decorator model supported by TypeScript 5 without `experimentalDecorators`.

## Migrated and exported

- `Memoize`: method decorator, cache scoped per instance, optional TTL and key resolver.
- `Retry`: async method retry wrapper with optional linear backoff.
- `Debounce`: per-instance method debounce.
- `Throttle`: per-instance method throttle.
- `Safe`: catches sync exceptions and async rejections.
- `Analyze`: execution-time and heap-delta instrumentation.
- `createHandlerDecorator`: typed standard method-decorator factory.

## Compatibility notes

The package entry point exports only the standard-decorator implementations listed above. Other source files in the repository still contain legacy decorator signatures and are intentionally not exported from the package entry point yet. They must be migrated individually before they can be re-exported. This is a staged migration, not a claim that every file has already been converted.

The standard decorator model does not support parameter decorators and is not compatible with `emitDecoratorMetadata`. Property decorators also have different semantics; property interception should be redesigned around auto-accessors or explicit accessors rather than copying legacy descriptor mutation.

## Validation

Run:

```sh
npm install
npm run typecheck
npm test
npm run build
```

The CI workflow runs typecheck, tests, and build on Node.js 20.
