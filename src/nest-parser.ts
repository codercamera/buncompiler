import ts from "typescript";
import type {
  AppDefinition,
  Constraint,
  FieldDefinition,
  HttpMethod,
  NestArgumentBinding,
  NestClassDefinition,
  RouteDefinition,
  TypeDefinition,
} from "./ast.ts";
import { CompileError } from "./lexer.ts";

const HTTP_DECORATORS: Record<string, HttpMethod> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
};

export function parseNestTypeScript(source: string, sourceImport = "./app.ts", fileName = "app.ts"): AppDefinition {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classes = new Map<string, ts.ClassDeclaration>();
  const schemas = new Map<string, TypeDefinition>();

  for (const statement of file.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) classes.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && isCallNamed(declaration.initializer, "schema")) {
          schemas.set(declaration.name.text, parseSchema(declaration.name.text, declaration.initializer, file));
        }
      }
    }
  }

  const moduleClass = [...classes.values()].find((node) => decorator(node, "Module"));
  if (!moduleClass?.name) fail(file, file, "Expected one class decorated with @Module({...})");
  const moduleDecorator = decorator(moduleClass, "Module")!;
  const metadata = objectArgument(moduleDecorator, file, "@Module");
  const controllerNames = identifierArray(metadata, "controllers", file);
  const providerNames = identifierArray(metadata, "providers", file);
  const basePath = stringProperty(metadata, "basePath", file) ?? "";

  const routes: RouteDefinition[] = [];
  const syntheticTypes: TypeDefinition[] = [];
  const usedGuards = new Set<string>();

  for (const controllerName of controllerNames) {
    const controller = classes.get(controllerName);
    if (!controller) fail(file, metadata, `Unknown controller '${controllerName}'`);
    requireExported(controller, file);
    const controllerDecorator = decorator(controller, "Controller");
    if (!controllerDecorator) fail(file, controller, `Controller '${controllerName}' requires @Controller()`);
    const prefix = firstStringArgument(controllerDecorator, file) ?? "";
    const controllerGuards = decoratorIdentifiers(controller, "UseGuards", file);
    controllerGuards.forEach((name) => usedGuards.add(name));

    for (const member of controller.members) {
      if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) continue;
      const routeDecorator = decorators(member)
        .map((item) => ({ item, name: decoratorName(item) }))
        .find((entry) => entry.name && HTTP_DECORATORS[entry.name]);
      if (!routeDecorator?.name) continue;

      const method = HTTP_DECORATORS[routeDecorator.name];
      const localPath = firstStringArgument(routeDecorator.item, file) ?? "";
      const fullPath = joinPath(basePath, prefix, localPath);
      const methodName = member.name.text;
      const bindings: NestArgumentBinding[] = [];
      const parameterFields: FieldDefinition[] = [];
      const queryFields: FieldDefinition[] = [];
      let paramsType: string | undefined;
      let queryType: string | undefined;
      let bodyType: string | undefined;

      for (const parameter of member.parameters) {
        const parameterDecorator = decorators(parameter)[0];
        if (!parameterDecorator) fail(file, parameter, `Parameter '${parameter.name.getText(file)}' requires @Req(), @Body(), @Param(), or @Query()`);
        const name = decoratorName(parameterDecorator);
        if (name === "Req") {
          bindings.push({ kind: "request" });
        } else if (name === "Body") {
          const schemaName = firstIdentifierArgument(parameterDecorator);
          if (!schemaName || !schemas.has(schemaName)) fail(file, parameterDecorator, "@Body() requires a schema constant, for example @Body(CreateEmployeeBody)");
          bodyType = schemaName;
          bindings.push({ kind: "body" });
        } else if (name === "Param") {
          const fieldName = firstStringArgument(parameterDecorator, file);
          if (!fieldName) fail(file, parameterDecorator, "@Param() requires a parameter name");
          const pipeName = identifierArgument(parameterDecorator, 1);
          const typeName = pipeName === "ParseIntPipe" ? "int" : primitiveType(parameter.type);
          parameterFields.push({ name: fieldName, optional: !!parameter.questionToken, type: { name: typeName, array: false }, constraints: [] });
          bindings.push({ kind: "param", name: fieldName });
        } else if (name === "Query") {
          const schemaName = firstIdentifierArgument(parameterDecorator);
          if (schemaName && schemas.has(schemaName)) {
            queryType = schemaName;
            bindings.push({ kind: "query" });
          } else {
            const fieldName = firstStringArgument(parameterDecorator, file);
            if (!fieldName) fail(file, parameterDecorator, "@Query() requires a field name or schema constant");
            queryFields.push({ name: fieldName, optional: !!parameter.questionToken, type: { name: primitiveType(parameter.type), array: false }, constraints: [] });
            bindings.push({ kind: "queryField", name: fieldName });
          }
        } else {
          fail(file, parameterDecorator, `Unsupported parameter decorator '@${name ?? "unknown"}'`);
        }
      }

      if (parameterFields.length) {
        paramsType = `${controllerName}_${methodName}_Params`;
        syntheticTypes.push({ name: paramsType, fields: parameterFields });
      }
      if (queryFields.length) {
        if (queryType) fail(file, member, "A route cannot mix @Query(Schema) with individual @Query('field') parameters");
        queryType = `${controllerName}_${methodName}_Query`;
        syntheticTypes.push({ name: queryType, fields: queryFields });
      }

      const methodGuards = decoratorIdentifiers(member, "UseGuards", file);
      const guards = [...controllerGuards, ...methodGuards];
      guards.forEach((guard) => usedGuards.add(guard));
      const httpCode = decorator(member, "HttpCode");
      const status = httpCode ? firstNumberArgument(httpCode, file) : method === "POST" ? 201 : 200;

      routes.push({
        method,
        path: fullPath,
        handler: `${controllerName}_${methodName}`,
        params: paramsType,
        query: queryType,
        body: bodyType,
        status,
        invocation: { controller: controllerName, method: methodName, arguments: bindings, guards },
      });
    }
  }

  for (const guard of usedGuards) {
    if (!providerNames.includes(guard)) fail(file, moduleClass, `Guard '${guard}' must be listed in @Module providers`);
  }

  const providers = orderProviders(providerNames, classes, file);
  const controllers = controllerNames.map((name) => classDefinition(name, classes, file));
  const selectedSchemas = [...schemas.values()];
  return {
    name: moduleClass.name.text,
    basePath: "",
    permissions: [],
    types: [...selectedSchemas, ...syntheticTypes],
    routes,
    nest: { sourceImport, providers, controllers },
  };
}

function orderProviders(names: string[], classes: Map<string, ts.ClassDeclaration>, file: ts.SourceFile): NestClassDefinition[] {
  const definitions = new Map(names.map((name) => [name, classDefinition(name, classes, file)]));
  const output: NestClassDefinition[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) fail(file, classes.get(name) ?? file, `Circular provider dependency involving '${name}'`);
    const definition = definitions.get(name);
    if (!definition) fail(file, file, `Unknown provider '${name}'`);
    visiting.add(name);
    for (const dependency of definition.dependencies) {
      if (!definitions.has(dependency)) fail(file, classes.get(name)!, `Provider '${name}' depends on '${dependency}', which is not registered`);
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
    output.push(definition);
  };
  names.forEach(visit);
  return output;
}

function classDefinition(name: string, classes: Map<string, ts.ClassDeclaration>, file: ts.SourceFile): NestClassDefinition {
  const node = classes.get(name);
  if (!node) fail(file, file, `Unknown class '${name}'`);
  requireExported(node, file);
  const constructor = node.members.find(ts.isConstructorDeclaration);
  const dependencies = constructor?.parameters.map((parameter) => {
    if (!parameter.type || !ts.isTypeReferenceNode(parameter.type) || !ts.isIdentifier(parameter.type.typeName)) {
      fail(file, parameter, `Constructor dependency in '${name}' requires a class type annotation`);
    }
    return parameter.type.typeName.text;
  }) ?? [];
  return { name, variable: `__bc_${name[0].toLowerCase()}${name.slice(1)}`, dependencies };
}

function parseSchema(name: string, call: ts.CallExpression, file: ts.SourceFile): TypeDefinition {
  const object = objectArgument(call, file, `schema '${name}'`);
  const fields = object.properties.map((property): FieldDefinition => {
    if (!ts.isPropertyAssignment(property)) fail(file, property, "Schema fields must be property assignments");
    const fieldName = propertyName(property.name, file);
    let expression = unwrap(property.initializer);
    let optional = false;
    let array = false;
    if (isTCall(expression, "optional")) { optional = true; expression = requiredArgument(expression, 0, file); }
    if (isTCall(expression, "array")) { array = true; expression = requiredArgument(expression, 0, file); }
    let typeName: string;
    let constraints: Constraint[] = [];
    if (isTCall(expression, "ref")) {
      const target = requiredArgument(expression, 0, file);
      if (!ts.isIdentifier(target)) fail(file, target, "t.ref expects a schema identifier");
      typeName = target.text;
    } else if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "t") {
      typeName = expression.expression.name.text;
      const options = expression.arguments[0] && unwrap(expression.arguments[0]);
      if (options) {
        if (!ts.isObjectLiteralExpression(options)) fail(file, options, "Schema options must be an object literal");
        constraints = options.properties.map((option) => {
          if (!ts.isPropertyAssignment(option)) fail(file, option, "Schema options must be property assignments");
          const optionName = propertyName(option.name, file) as Constraint["name"];
          const value = literal(option.initializer, file);
          if (typeof value !== "string" && typeof value !== "number") fail(file, option.initializer, "Schema option must be a string or number");
          return { name: optionName, value };
        });
      }
    } else fail(file, expression, `Field '${fieldName}' must use t.*`);
    return { name: fieldName, optional, type: { name: typeName, array }, constraints };
  });
  return { name, fields };
}

function primitiveType(type: ts.TypeNode | undefined): string {
  if (!type) return "string";
  if (type.kind === ts.SyntaxKind.NumberKeyword) return "number";
  if (type.kind === ts.SyntaxKind.BooleanKeyword) return "boolean";
  return "string";
}

function decorators(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function decorator(node: ts.Node, name: string): ts.Decorator | undefined {
  return decorators(node).find((item) => decoratorName(item) === name);
}

function decoratorName(item: ts.Decorator): string | undefined {
  const expression = item.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) return expression.expression.text;
  return undefined;
}

function decoratorCall(item: ts.Decorator): ts.CallExpression | undefined {
  return ts.isCallExpression(item.expression) ? item.expression : undefined;
}

function decoratorIdentifiers(node: ts.Node, name: string, file: ts.SourceFile): string[] {
  const item = decorator(node, name);
  if (!item) return [];
  const call = decoratorCall(item);
  if (!call) fail(file, item, `@${name} must be called`);
  return call.arguments.map((argument) => {
    argument = unwrap(argument);
    if (!ts.isIdentifier(argument)) fail(file, argument, `@${name} arguments must be class identifiers`);
    return argument.text;
  });
}

function identifierArray(object: ts.ObjectLiteralExpression, key: string, file: ts.SourceFile): string[] {
  const property = object.properties.find((item) => ts.isPropertyAssignment(item) && propertyNameText(item.name) === key);
  if (!property || !ts.isPropertyAssignment(property)) return [];
  const value = unwrap(property.initializer);
  if (!ts.isArrayLiteralExpression(value)) fail(file, value, `'${key}' must be an array`);
  return value.elements.map((element) => {
    element = unwrap(element);
    if (!ts.isIdentifier(element)) fail(file, element, `'${key}' entries must be class identifiers`);
    return element.text;
  });
}

function objectArgument(item: ts.Decorator | ts.CallExpression, file: ts.SourceFile, label: string): ts.ObjectLiteralExpression {
  const call = ts.isDecorator(item) ? decoratorCall(item) : item;
  const argument = call?.arguments[0] && unwrap(call.arguments[0]);
  if (!argument || !ts.isObjectLiteralExpression(argument)) fail(file, item, `${label} expects an object literal`);
  return argument;
}

function firstStringArgument(item: ts.Decorator, file: ts.SourceFile): string | undefined {
  const argument = decoratorCall(item)?.arguments[0];
  if (!argument) return undefined;
  const value = literal(argument, file);
  if (typeof value !== "string") return undefined;
  return value;
}

function firstNumberArgument(item: ts.Decorator, file: ts.SourceFile): number {
  const argument = decoratorCall(item)?.arguments[0];
  const value = argument && literal(argument, file);
  if (typeof value !== "number") fail(file, item, "Decorator expects a numeric argument");
  return value;
}

function firstIdentifierArgument(item: ts.Decorator): string | undefined {
  const argument = decoratorCall(item)?.arguments[0];
  return argument && ts.isIdentifier(unwrap(argument)) ? (unwrap(argument) as ts.Identifier).text : undefined;
}

function identifierArgument(item: ts.Decorator, index: number): string | undefined {
  const argument = decoratorCall(item)?.arguments[index];
  return argument && ts.isIdentifier(unwrap(argument)) ? (unwrap(argument) as ts.Identifier).text : undefined;
}

function stringProperty(object: ts.ObjectLiteralExpression, key: string, file: ts.SourceFile): string | undefined {
  const property = object.properties.find((item) => ts.isPropertyAssignment(item) && propertyNameText(item.name) === key);
  if (!property || !ts.isPropertyAssignment(property)) return undefined;
  const value = literal(property.initializer, file);
  if (typeof value !== "string") fail(file, property.initializer, `'${key}' must be a string`);
  return value;
}

function joinPath(...parts: string[]): string {
  const joined = parts.flatMap((part) => part.split("/")).filter(Boolean).join("/");
  return `/${joined}`;
}

function requireExported(node: ts.ClassDeclaration, file: ts.SourceFile): void {
  if (!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    fail(file, node, `Class '${node.name?.text ?? "unknown"}' must be exported so generated code can import it`);
  }
}

function isCallNamed(expression: ts.Expression, name: string): expression is ts.CallExpression {
  expression = unwrap(expression);
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === name;
}

function isTCall(expression: ts.Expression, name: string): expression is ts.CallExpression {
  expression = unwrap(expression);
  return ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "t" && expression.expression.name.text === name;
}

function requiredArgument(call: ts.CallExpression, index: number, file: ts.SourceFile): ts.Expression {
  const argument = call.arguments[index];
  if (!argument) fail(file, call, "Missing required argument");
  return unwrap(argument);
}

function literal(expression: ts.Expression, file: ts.SourceFile): string | number | boolean {
  expression = unwrap(expression);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  fail(file, expression, "Expected a literal value");
}

function unwrap<T extends ts.Expression>(expression: T): T {
  while (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression as T;
  return expression;
}

function propertyName(name: ts.PropertyName, file: ts.SourceFile): string {
  const value = propertyNameText(name);
  if (value === undefined) fail(file, name, "Computed property names are not supported");
  return value;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

function fail(file: ts.SourceFile, node: ts.Node, message: string): never {
  const position = file.getLineAndCharacterOfPosition(node.getStart(file));
  throw new CompileError(message, position.line + 1, position.character + 1);
}
