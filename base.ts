export interface DecoratorMeta {
  name: string | symbol;
  kind: "method";
}

export type HandlerInterceptor<This, Args extends unknown[], Return> = (
  handler: (this: This, ...args: Args) => Return,
  meta: DecoratorMeta
) => (this: This, ...args: Args) => Return;

/** Creates a TypeScript 5 standard method decorator. */
export function createHandlerDecorator<This, Args extends unknown[], Return>(
  interceptorFactory: HandlerInterceptor<This, Args, Return>
) {
  return function (
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ) {
    if (context.private) {
      throw new TypeError("Private methods are not supported by this handler decorator.");
    }

    return interceptorFactory(originalMethod, {
      name: context.name,
      kind: "method"
    });
  };
}
