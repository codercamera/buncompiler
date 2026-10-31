import type { AppDefinition, FieldDefinition } from "./ast.ts";
import { CompileError } from "./lexer.ts";

const BUILTIN_TYPES = new Set(["string", "number", "int", "boolean", "unknown"]);

export function analyze(app: AppDefinition): void {
  assertUnique(app.types.map((item) => item.name), "type");
  assertUnique(app.permissions.map((item) => item.name), "permission");
  assertUnique(app.permissions.map((item) => String(item.value)), "permission value");
  assertUnique(app.routes.map((item) => `${item.method} ${item.path}`), "route");
  assertUnique(app.routes.map((item) => item.handler), "handler");

  const types = new Set(app.types.map((item) => item.name));
  const permissions = new Set(app.permissions.map((item) => item.name));

  if (app.basePath && (!app.basePath.startsWith("/") || app.basePath.endsWith("/"))) {
    throw new CompileError("basePath must start with '/' and must not end with '/'");
  }

  for (const type of app.types) {
    assertUnique(type.fields.map((field) => field.name), `field in ${type.name}`);
    for (const field of type.fields) validateField(field, types, type.name);
  }

  for (const permission of app.permissions) {
    if (!Number.isSafeInteger(permission.value) || permission.value <= 0) {
      throw new CompileError(`Permission '${permission.name}' must be a positive integer`);
    }
  }

  for (const route of app.routes) {
    if (!route.path.startsWith("/")) throw new CompileError(`Route '${route.method} ${route.path}' must start with '/'`);
    for (const key of ["params", "query", "body"] as const) {
      const name = route[key];
      if (name && !types.has(name)) throw new CompileError(`Route '${route.handler}' references unknown type '${name}'`);
    }
    if (route.permission && !permissions.has(route.permission)) {
      throw new CompileError(`Route '${route.handler}' references unknown permission '${route.permission}'`);
    }
    if (route.status !== undefined && (!Number.isInteger(route.status) || route.status < 100 || route.status > 599)) {
      throw new CompileError(`Route '${route.handler}' has invalid HTTP status ${route.status}`);
    }

    const dynamicNames = [...route.path.matchAll(/:([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((match) => match[1]);
    assertUnique(dynamicNames, `path parameter in ${route.method} ${route.path}`);
    if (dynamicNames.length && !route.params) throw new CompileError(`Route '${route.handler}' has path parameters but no params type`);
    if (route.params) {
      const parameterType = app.types.find((item) => item.name === route.params)!;
      const fields = new Set(parameterType.fields.map((field) => field.name));
      for (const name of dynamicNames) {
        if (!fields.has(name)) throw new CompileError(`Path parameter ':${name}' is missing from type '${route.params}'`);
      }
    }
  }
}

function validateField(field: FieldDefinition, types: Set<string>, owner: string): void {
  if (!BUILTIN_TYPES.has(field.type.name) && !types.has(field.type.name)) {
    throw new CompileError(`Field '${owner}.${field.name}' references unknown type '${field.type.name}'`);
  }
  for (const constraint of field.constraints) {
    const numeric = field.type.name === "number" || field.type.name === "int";
    const textual = field.type.name === "string";
    if (["min", "max"].includes(constraint.name) && !numeric) {
      throw new CompileError(`Constraint @${constraint.name} requires a numeric field (${owner}.${field.name})`);
    }
    if (["minLength", "maxLength", "pattern"].includes(constraint.name) && !textual) {
      throw new CompileError(`Constraint @${constraint.name} requires a string field (${owner}.${field.name})`);
    }
    if (constraint.name === "pattern" && typeof constraint.value === "string") {
      try { new RegExp(constraint.value); } catch { throw new CompileError(`Invalid regular expression on '${owner}.${field.name}'`); }
    }
  }
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new CompileError(`Duplicate ${label} '${value}'`);
    seen.add(value);
  }
}
