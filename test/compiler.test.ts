import { describe, expect, test } from "bun:test";
import { compile, CompileError, parse, stripNestRuntime } from "../src/compiler.ts";

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

describe("Nest-style compilation", () => {
  const nestSource = `
    import { schema, t } from "buncompiler";
    import { Controller, Get, Injectable, Module, Param, ParseIntPipe } from "buncompiler/nest";
    const BodySchema = schema({ name: t.string({ minLength: 1 }) });
    @Injectable()
    export class Service { find(id: number) { return { id }; } }
    @Controller("items")
    export class ControllerClass {
      constructor(private service: Service) {}
      @Get(":id") find(@Param("id", ParseIntPipe) id: number) { return this.service.find(id); }
    }
    @Module({ controllers: [ControllerClass], providers: [Service], basePath: "/api" })
    export class AppModule {}
  `;

  test("compiles decorators and constructor injection into direct code", () => {
    const output = compile(nestSource, { sourceImport: "../app.ts" });
    expect(output).toContain('import { Service, ControllerClass } from "../app.ts"');
    expect(output).toContain("const __bc_service = new Service()");
    expect(output).toContain("const __bc_controllerClass = new ControllerClass(__bc_service)");
    expect(output).toContain('await __bc_controllerClass.find(parsedParams.value["id"])');
    expect(output).not.toContain("appHandlers");
  });

  test("strips framework decorators from the production module", () => {
    const output = stripNestRuntime(nestSource);
    expect(output).toContain("export class ControllerClass");
    expect(output).not.toContain("Controller(");
    expect(output).not.toContain("__decorate");
    expect(output).not.toContain("schema(");
  });
});
