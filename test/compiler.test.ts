import { describe, expect, test } from "bun:test";
import { compile, CompileError, parse } from "../src/compiler.ts";

const source = `
app TestApi {
  basePath: "/api";
  permissions { read: 1; }
  type Params = { id: int @min(1); };
  GET "/items/:id" => getItem {
    params: Params;
    permission: read;
  }
}
`;

describe("buncompiler", () => {
  test("parses TypeScript-like definitions", () => {
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
    expect(() => compile(source.replace("permission: read", "permission: missing"))).toThrow(CompileError);
  });

  test("rejects duplicate routes", () => {
    const duplicate = source.replace("\n}", `
  GET "/items/:id" => another { params: Params; }
}`);
    expect(() => compile(duplicate)).toThrow("Duplicate route");
  });
});
