import { defineApp, schema, t, type Infer } from "../../src/dsl.ts";

export const EmployeeParams = schema({
  id: t.int({ min: 1 }),
});

export const EmployeeQuery = schema({
  details: t.optional(t.boolean()),
});

export const CreateEmployeeBody = schema({
  name: t.string({ minLength: 1, maxLength: 100 }),
  salary: t.number({ min: 0 }),
  active: t.optional(t.boolean()),
  tags: t.optional(t.array(t.string())),
});

// These are ordinary TypeScript types available to application code.
export type EmployeeParams = Infer<typeof EmployeeParams>;
export type EmployeeQuery = Infer<typeof EmployeeQuery>;
export type CreateEmployeeBody = Infer<typeof CreateEmployeeBody>;

export default defineApp({
  name: "EmployeeApi",
  basePath: "/api",

  permissions: {
    employeeRead: 1,
    employeeWrite: 2,
  },

  schemas: {
    EmployeeParams,
    EmployeeQuery,
    CreateEmployeeBody,
  },

  routes: [
    {
      method: "GET",
      path: "/employees/:id",
      handler: "getEmployee",
      params: EmployeeParams,
      query: EmployeeQuery,
      permission: "employeeRead",
    },
    {
      method: "POST",
      path: "/employees",
      handler: "createEmployee",
      body: CreateEmployeeBody,
      permission: "employeeWrite",
      status: 201,
    },
  ],
});
