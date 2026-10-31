export interface StringOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface NumberOptions {
  min?: number;
  max?: number;
}

export interface Field<T, Optional extends boolean = false> {
  readonly kind: "field";
  readonly fieldType: string;
  readonly options: Readonly<object>;
  readonly inner?: Field<unknown, boolean> | Schema<unknown>;
  readonly __output?: T;
  readonly __optional?: Optional;
}

export interface Schema<T> {
  readonly kind: "schema";
  readonly fields: Readonly<Record<string, Field<unknown, boolean>>>;
  readonly __output?: T;
}

type AnyField = Field<any, any>;
type InferField<F> = F extends Field<infer T, any> ? T : never;
type OptionalKeys<S extends Record<string, AnyField>> = {
  [K in keyof S]: S[K] extends Field<any, true> ? K : never;
}[keyof S];
type RequiredKeys<S extends Record<string, AnyField>> = Exclude<keyof S, OptionalKeys<S>>;

export type InferShape<S extends Record<string, AnyField>> = {
  [K in RequiredKeys<S>]: InferField<S[K]>;
} & {
  [K in OptionalKeys<S>]?: InferField<S[K]>;
};

export type Infer<S extends Schema<any>> = S extends Schema<infer T> ? T : never;

function field<T, O extends boolean = false>(
  fieldType: string,
  options: Readonly<object> = {},
  inner?: Field<unknown, boolean> | Schema<unknown>,
): Field<T, O> {
  return { kind: "field", fieldType, options, inner } as Field<T, O>;
}

export const t = {
  string: (options: StringOptions = {}) => field<string>("string", options),
  number: (options: NumberOptions = {}) => field<number>("number", options),
  int: (options: NumberOptions = {}) => field<number>("int", options),
  boolean: () => field<boolean>("boolean"),
  unknown: () => field<unknown>("unknown"),
  array: <F extends AnyField>(item: F) => field<InferField<F>[]>("array", {}, item),
  optional: <F extends AnyField>(item: F) => field<InferField<F>, true>("optional", {}, item),
  ref: <S extends Schema<any>>(target: S) => field<Infer<S>>("ref", {}, target),
} as const;

export function schema<const S extends Record<string, AnyField>>(fields: S): Schema<InferShape<S>> {
  return { kind: "schema", fields } as Schema<InferShape<S>>;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteInput<Permission extends string = string> {
  readonly method: HttpMethod;
  readonly path: `/${string}`;
  readonly handler: string;
  readonly params?: Schema<any>;
  readonly query?: Schema<any>;
  readonly body?: Schema<any>;
  readonly permission?: Permission;
  readonly status?: number;
}

export interface AppInput<
  P extends Record<string, number>,
  S extends Record<string, Schema<any>>,
> {
  readonly name: string;
  readonly basePath?: "" | `/${string}`;
  readonly permissions?: P;
  readonly schemas: S;
  readonly routes: readonly RouteInput<keyof P & string>[];
}

export function defineApp<
  const P extends Record<string, number>,
  const S extends Record<string, Schema<any>>,
>(input: AppInput<P, S>): AppInput<P, S> {
  return input;
}
