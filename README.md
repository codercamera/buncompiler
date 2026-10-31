# buncompiler

`buncompiler` is an experimental compile-time web framework for Bun. Applications use familiar Nest-style controllers, providers, modules, guards, pipes, and parameter decorators in real TypeScript. The compiler converts that structure into specialized `Bun.serve` code and an optional minified JavaScript bundle.

The framework exists at build time rather than interpreting routes and schemas on every request.

## Current MVP

- Standard `.ts` source—no custom programming language
- Nest-style `@Module`, `@Controller`, and `@Injectable` classes
- Constructor injection compiled into direct `new` expressions
- `@Get`, `@Post`, `@Put`, `@Patch`, and `@Delete` routes
- `@Body`, `@Param`, `@Query`, and `@Req` parameter binding
- Controller- and method-scoped `@UseGuards`
- Compile-time `ParseIntPipe` specialization
- Inferred application types through `Schema` and `Infer`
- Static route generation for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
- Path, query, and JSON-body validation
- `string`, `number`, `int`, `boolean`, `unknown`, named object, optional, and array types
- `@min`, `@max`, `@minLength`, `@maxLength`, and `@pattern` constraints
- Compile-time permission and type checking
- Direct controller method calls without runtime route reflection
- Pure JavaScript bundle through `bun build`

## Example language

```ts
import { schema, t, type Infer } from "buncompiler";
import {
  Body, Controller, Get, Injectable, Module,
  Param, ParseIntPipe, Post,
} from "buncompiler/nest";

const CreateEmployeeBody = schema({
  name: t.string({ minLength: 1, maxLength: 100 }),
  salary: t.number({ min: 0 }),
  tags: t.optional(t.array(t.string())),
});

type CreateEmployeeBody = Infer<typeof CreateEmployeeBody>;

@Injectable()
export class EmployeeService {
  findOne(id: number) { return { id, name: "Example" }; }
  create(body: CreateEmployeeBody) { return { id: 1, ...body }; }
}

@Controller("employees")
export class EmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.employees.findOne(id);
  }

  @Post()
  create(@Body(CreateEmployeeBody) body: CreateEmployeeBody) {
    return this.employees.create(body);
  }
}

@Module({
  basePath: "/api",
  controllers: [EmployeeController],
  providers: [EmployeeService],
})
export class AppModule {}
```

## Try it

```bash
bun install
bun run build:example
bun examples/employee-api/dist/server.js
```

The compiler is deterministic: the same source and compiler version produce the same server code. The LLM can help evolve the compiler, but normal builds do not depend on probabilistic generation.

## Architecture

```text
TypeScript source
    -> TypeScript AST parser
    -> semantic analysis
    -> static routing and DI generator
    -> specialized Bun.serve TypeScript
    -> minified JavaScript bundle
```

For example, constructor injection is compiled once:

```ts
const employeeService = new EmployeeService();
const employeeController = new EmployeeController(employeeService);
```

Routes call controller methods directly. Production requests do not traverse a decorator metadata registry, general-purpose dependency-injection container, or dynamic route table.

## Supported Nest-style subset

The current compiler intentionally supports a focused subset rather than claiming complete NestJS compatibility. Controllers, providers, one root module, constructor injection, HTTP method decorators, request parameter decorators, guards, status codes, schemas, and integer parsing are supported. Imported modules, multi-file source discovery, request-scoped providers, interceptors, exception filters, custom provider tokens, and arbitrary custom pipes remain future work.

The lower-level `defineApp()` API remains available for generated or highly specialized services.

## Project direction

This first version proves the build-time model. The next meaningful steps are:

1. Multi-file modules and imported-module graph compilation.
2. Interceptors, exception filters, and additional compile-time pipes.
3. Generated OpenAPI and typed clients.
4. Trie-based route generation and ahead-of-time serializers.
5. Benchmark suite against native `Bun.serve`, NestJS, and Bun frameworks.
6. Differential and fuzz testing for generated behavior.

Performance claims will be added only after repeatable benchmarks exist.
