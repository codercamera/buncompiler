import ts from "typescript";
import type {
  AppDefinition,
  Constraint,
  FieldDefinition,
  HttpMethod,
  PermissionDefinition,
  RouteDefinition,
  TypeDefinition,
} from "./ast.ts";
import { CompileError } from "./lexer.ts";

export function parseTypeScript(source: string, fileName = "app.ts"): AppDefinition {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const schemas = new Map<string, TypeDefinition>();
  let appCall: ts.CallExpression | undefined;

  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        if (isCallNamed(declaration.initializer, "schema")) {
          schemas.set(declaration.name.text, parseSchema(declaration.name.text, declaration.initializer, file));
        }
      }
    }
    if (ts.isExportAssignment(statement) && isCallNamed(statement.expression, "defineApp")) {
      appCall = statement.expression;
    }
  }

  if (!appCall) fail(file, file, "Expected 'export default defineApp({ ... })'");
  const appObject = objectArgument(appCall, file, "defineApp");
  const name = stringProperty(appObject, "name", file, true)!;
  const basePath = stringProperty(appObject, "basePath", file, false) ?? "";
  const permissions = parsePermissions(propertyExpression(appObject, "permissions"), file);
  const selectedSchemas = parseSchemaMap(propertyExpression(appObject, "schemas", true), schemas, file);
  const routes = parseRoutes(propertyExpression(appObject, "routes", true), schemas, file);

  return { name, basePath, permissions, types: selectedSchemas, routes };
}

function parseSchema(name: string, call: ts.CallExpression, file: ts.SourceFile): TypeDefinition {
  const object = objectArgument(call, file, `schema '${name}'`);
  const fields: FieldDefinition[] = [];
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) {
      fail(file, property, "Schema fields must be property assignments");
    }
    const fieldName = propertyName(property.name, file);
    const expression = ts.isPropertyAssignment(property) ? property.initializer : undefined;
    if (!expression) fail(file, property, `Schema field '${fieldName}' requires a t.* expression`);
    fields.push(parseField(fieldName, expression, file));
  }
  return { name, fields };
}

function parseField(name: string, expression: ts.Expression, file: ts.SourceFile): FieldDefinition {
  let optional = false;
  let array = false;
  let current = unwrapExpression(expression);

  if (isTCall(current, "optional")) {
    optional = true;
    current = requiredArgument(current, 0, file, "t.optional");
  }
  if (isTCall(current, "array")) {
    array = true;
    current = requiredArgument(current, 0, file, "t.array");
  }

  let typeName: string;
  let constraints: Constraint[] = [];
  if (isTCall(current, "ref")) {
    const target = requiredArgument(current, 0, file, "t.ref");
    if (!ts.isIdentifier(target)) fail(file, target, "t.ref expects a schema identifier");
    typeName = target.text;
  } else if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && ts.isIdentifier(current.expression.expression) && current.expression.expression.text === "t") {
    typeName = current.expression.name.text;
    if (!["string", "number", "int", "boolean", "unknown"].includes(typeName)) {
      fail(file, current, `Unsupported field constructor 't.${typeName}'`);
    }
    if (current.arguments[0]) constraints = parseConstraintObject(current.arguments[0], file);
  } else {
    fail(file, current, `Field '${name}' must use a t.* constructor`);
  }

  return { name, optional, type: { name: typeName, array }, constraints };
}

function parseConstraintObject(expression: ts.Expression, file: ts.SourceFile): Constraint[] {
  expression = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(expression)) fail(file, expression, "Field options must be an object literal");
  const constraints: Constraint[] = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) fail(file, property, "Field options must be property assignments");
    const name = propertyName(property.name, file) as Constraint["name"];
    if (!["min", "max", "minLength", "maxLength", "pattern"].includes(name)) fail(file, property, `Unknown field option '${name}'`);
    const value = literalValue(property.initializer, file);
    if (typeof value !== "number" && typeof value !== "string") fail(file, property.initializer, `Option '${name}' must be a number or string`);
    constraints.push({ name, value });
  }
  return constraints;
}

function parsePermissions(expression: ts.Expression | undefined, file: ts.SourceFile): PermissionDefinition[] {
  if (!expression) return [];
  expression = unwrapExpression(expression);
  if (!ts.isObjectLiteralExpression(expression)) fail(file, expression, "permissions must be an object literal");
  return expression.properties.map((property) => {
    if (!ts.isPropertyAssignment(property)) fail(file, property, "permissions must contain property assignments");
    const value = literalValue(property.initializer, file);
    if (typeof value !== "number") fail(file, property.initializer, "Permission values must be numeric literals");
    return { name: propertyName(property.name, file), value };
  });
}

function parseSchemaMap(expression: ts.Expression | undefined, schemas: Map<string, TypeDefinition>, file: ts.SourceFile): TypeDefinition[] {
  expression = unwrapExpression(expression!);
  if (!ts.isObjectLiteralExpression(expression)) fail(file, expression, "schemas must be an object literal");
  return expression.properties.map((property) => {
    let exposedName: string;
    let referencedName: string;
    if (ts.isShorthandPropertyAssignment(property)) {
      exposedName = referencedName = property.name.text;
    } else if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)) {
      exposedName = propertyName(property.name, file);
      referencedName = property.initializer.text;
    } else {
      fail(file, property, "schemas entries must reference a schema constant");
    }
    const schema = schemas.get(referencedName);
    if (!schema) fail(file, property, `Unknown schema '${referencedName}'`);
    return { ...schema, name: exposedName };
  });
}

function parseRoutes(expression: ts.Expression | undefined, schemas: Map<string, TypeDefinition>, file: ts.SourceFile): RouteDefinition[] {
  expression = unwrapExpression(expression!);
  if (!ts.isArrayLiteralExpression(expression)) fail(file, expression, "routes must be an array literal");
  return expression.elements.map((element) => {
    element = unwrapExpression(element);
    if (!ts.isObjectLiteralExpression(element)) fail(file, element, "Each route must be an object literal");
    const method = stringProperty(element, "method", file, true)! as HttpMethod;
    const path = stringProperty(element, "path", file, true)!;
    const handler = stringProperty(element, "handler", file, true)!;
    const route: RouteDefinition = { method, path, handler };
    for (const key of ["params", "query", "body"] as const) {
      let value = propertyExpression(element, key);
      if (value) {
        value = unwrapExpression(value);
        if (!ts.isIdentifier(value) || !schemas.has(value.text)) fail(file, value, `Route '${key}' must reference a declared schema`);
        route[key] = value.text;
      }
    }
    route.permission = stringProperty(element, "permission", file, false) ?? undefined;
    const status = propertyExpression(element, "status");
    if (status) {
      const value = literalValue(status, file);
      if (typeof value !== "number") fail(file, status, "Route status must be a numeric literal");
      route.status = value;
    }
    return route;
  });
}

function objectArgument(call: ts.CallExpression, file: ts.SourceFile, label: string): ts.ObjectLiteralExpression {
  const argument = call.arguments[0] && unwrapExpression(call.arguments[0]);
  if (!argument || !ts.isObjectLiteralExpression(argument)) fail(file, call, `${label} expects an object literal`);
  return argument;
}

function propertyExpression(object: ts.ObjectLiteralExpression, name: string, required = false): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === name) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
  }
  if (required) fail(object.getSourceFile(), object, `Missing required property '${name}'`);
  return undefined;
}

function stringProperty(object: ts.ObjectLiteralExpression, name: string, file: ts.SourceFile, required: boolean): string | undefined {
  const expression = propertyExpression(object, name, required);
  if (!expression) return undefined;
  const value = literalValue(expression, file);
  if (typeof value !== "string") fail(file, expression, `Property '${name}' must be a string literal`);
  return value;
}

function literalValue(expression: ts.Expression, file: ts.SourceFile): string | number | boolean {
  expression = unwrapExpression(expression);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  fail(file, expression, "Expected a literal value");
}

function isCallNamed(expression: ts.Expression, name: string): expression is ts.CallExpression {
  expression = unwrapExpression(expression);
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === name;
}

function isTCall(expression: ts.Expression, name: string): expression is ts.CallExpression {
  expression = unwrapExpression(expression);
  return ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "t" && expression.expression.name.text === name;
}

function requiredArgument(call: ts.CallExpression, index: number, file: ts.SourceFile, label: string): ts.Expression {
  const argument = call.arguments[index];
  if (!argument) fail(file, call, `${label} requires an argument`);
  return unwrapExpression(argument);
}

function unwrapExpression<T extends ts.Expression>(expression: T): T {
  while (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) {
    expression = expression.expression as T;
  }
  return expression;
}

function propertyName(name: ts.PropertyName, file: ts.SourceFile): string {
  const value = propertyNameText(name);
  if (value === undefined) fail(file, name, "Computed property names are not supported");
  return value;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}

function fail(file: ts.SourceFile, node: ts.Node, message: string): never {
  const position = file.getLineAndCharacterOfPosition(node.getStart(file));
  throw new CompileError(message, position.line + 1, position.character + 1);
}
