import { describe, expect, test } from "bun:test";
import { compile, CompileError, parse } from "../src/compiler.ts";

const source = `
import { defineApp, schema, t } from "buncompiler";
const Params = schema({ id: t.int({ min: 1 }) });
export default defineApp({
  name: "TestApi",
  basePath: "/api",
  permissions: { read: 1 },
  schemas: { Params },
  routes: [{
    method: "GET",
    path: "/items/:id",
    handler: "getItem",
    params: Params,
    permission: "read",
  }],
});
`;

describe("buncompiler", () => {
  test("parses valid TypeScript definitions", () => {
    const app = parse(source);
    expect(app.name).toBe("TestApi");
    expect(app.routes[0].handler).toBe("getItem");
    expect(app.types[0].fields[0].type.name).toBe("int");
  });

  test("generates a static Bun router and direct validation", () => {
    const output = compile(source);
    expect(output).toContain("export const server = Bun.serve");
    expect(output).toContain('segments[0] === "items"');
    expect(output).toContain("Number.isSafeInteger(value_id)");
    expect(output).toContain("Permission.read");
  });

  test("rejects an unknown permission", () => {
    expect(() => compile(source.replace('permission: "read"', 'permission: "missing"'))).toThrow(CompileError);
  });

  test("rejects duplicate routes", () => {
    const duplicate = source.replace("  }],", `  }, {
    method: "GET", path: "/items/:id", handler: "another", params: Params,
  }],`);
    expect(() => compile(duplicate)).toThrow("Duplicate route");
  });
});
