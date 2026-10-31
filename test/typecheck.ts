import { defineApp, schema, t, type Infer } from "../src/dsl.ts";

const Body = schema({
  name: t.string(),
  count: t.int(),
  active: t.optional(t.boolean()),
});

type Body = Infer<typeof Body>;

const validBody: Body = { name: "typed", count: 1 };
void validBody;

// @ts-expect-error Schema inference rejects the wrong field type.
const invalidBody: Body = { name: 123, count: 1 };
void invalidBody;

defineApp({
  name: "TypedApp",
  permissions: { read: 1 },
  schemas: { Body },
  routes: [{
    method: "POST",
    path: "/typed",
    handler: "typedHandler",
    body: Body,
    // @ts-expect-error Permission names are inferred from the permissions object.
    permission: "write",
  }],
});
