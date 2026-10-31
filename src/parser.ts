import type {
  AppDefinition,
  Constraint,
  FieldDefinition,
  HttpMethod,
  PermissionDefinition,
  RouteDefinition,
  TypeDefinition,
  TypeRef,
} from "./ast.ts";
import { CompileError, tokenize, type Token, type TokenKind } from "./lexer.ts";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const CONSTRAINTS = new Set(["min", "max", "minLength", "maxLength", "pattern"]);

export function parse(source: string): AppDefinition {
  return new Parser(tokenize(source)).parseApp();
}

class Parser {
  private position = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseApp(): AppDefinition {
    this.expectValue("app");
    const name = this.expect("identifier").value;
    this.expectValue("{");

    let basePath = "";
    let permissions: PermissionDefinition[] = [];
    const types: TypeDefinition[] = [];
    const routes: RouteDefinition[] = [];

    while (!this.matchValue("}")) {
      const token = this.peek();
      if (token.kind === "eof") this.fail("Expected '}' before end of file", token);

      if (token.value === "basePath") {
        this.advance();
        this.expectValue(":");
        basePath = this.expect("string").value;
        this.expectValue(";");
      } else if (token.value === "permissions") {
        if (permissions.length) this.fail("Only one permissions block is allowed", token);
        permissions = this.parsePermissions();
      } else if (token.value === "type") {
        types.push(this.parseType());
      } else if (HTTP_METHODS.has(token.value)) {
        routes.push(this.parseRoute());
      } else {
        this.fail(`Unexpected application member '${token.value}'`, token);
      }
    }

    this.expect("eof");
    return { name, basePath, permissions, types, routes };
  }

  private parsePermissions(): PermissionDefinition[] {
    this.expectValue("permissions");
    this.expectValue("{");
    const permissions: PermissionDefinition[] = [];
    while (!this.matchValue("}")) {
      const name = this.expect("identifier").value;
      this.expectValue(":");
      const value = Number(this.expect("number").value);
      this.expectValue(";");
      permissions.push({ name, value });
    }
    return permissions;
  }

  private parseType(): TypeDefinition {
    this.expectValue("type");
    const name = this.expect("identifier").value;
    this.expectValue("=");
    this.expectValue("{");
    const fields: FieldDefinition[] = [];

    while (!this.matchValue("}")) {
      const fieldName = this.expect("identifier").value;
      const optional = this.matchValue("?");
      this.expectValue(":");
      const type = this.parseTypeRef();
      const constraints: Constraint[] = [];
      while (this.matchValue("@")) {
        const constraintToken = this.expect("identifier");
        if (!CONSTRAINTS.has(constraintToken.value)) this.fail(`Unknown constraint '${constraintToken.value}'`, constraintToken);
        this.expectValue("(");
        const valueToken = this.advance();
        if (valueToken.kind !== "number" && valueToken.kind !== "string") this.fail("Constraint value must be a number or string", valueToken);
        this.expectValue(")");
        constraints.push({
          name: constraintToken.value as Constraint["name"],
          value: valueToken.kind === "number" ? Number(valueToken.value) : valueToken.value,
        });
      }
      this.expectValue(";");
      fields.push({ name: fieldName, optional, type, constraints });
    }
    this.expectValue(";");
    return { name, fields };
  }

  private parseTypeRef(): TypeRef {
    const name = this.expect("identifier").value;
    let array = false;
    if (this.matchValue("[")) {
      this.expectValue("]");
      array = true;
    }
    return { name, array };
  }

  private parseRoute(): RouteDefinition {
    const method = this.advance().value as HttpMethod;
    const path = this.expect("string").value;
    this.expectValue("=>");
    const handler = this.expect("identifier").value;
    this.expectValue("{");

    const route: RouteDefinition = { method, path, handler };
    while (!this.matchValue("}")) {
      const key = this.expect("identifier");
      this.expectValue(":");
      if (["params", "query", "body", "permission"].includes(key.value)) {
        (route as unknown as Record<string, string>)[key.value] = this.expect("identifier").value;
      } else if (key.value === "status") {
        route.status = Number(this.expect("number").value);
      } else {
        this.fail(`Unknown route property '${key.value}'`, key);
      }
      this.expectValue(";");
    }
    return route;
  }

  private peek(): Token {
    return this.tokens[this.position];
  }

  private advance(): Token {
    return this.tokens[this.position++];
  }

  private matchValue(value: string): boolean {
    if (this.peek().value !== value) return false;
    this.position++;
    return true;
  }

  private expectValue(value: string): Token {
    const token = this.advance();
    if (token.value !== value) this.fail(`Expected '${value}', received '${token.value || "end of file"}'`, token);
    return token;
  }

  private expect(kind: TokenKind): Token {
    const token = this.advance();
    if (token.kind !== kind) this.fail(`Expected ${kind}, received '${token.value || "end of file"}'`, token);
    return token;
  }

  private fail(message: string, token: Token): never {
    throw new CompileError(message, token.line, token.column);
  }
}
