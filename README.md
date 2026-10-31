# buncompiler

`buncompiler` is an experimental deterministic compiler for Bun HTTP services. It keeps a concise, TypeScript-like authoring language and generates specialized TypeScript that runs directly on `Bun.serve`.

The framework exists at build time rather than interpreting routes and schemas on every request.

## Current MVP

- TypeScript-like `.bunc` language
- Static route generation for `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`
- Path, query, and JSON-body validation
- `string`, `number`, `int`, `boolean`, `unknown`, named object, optional, and array types
- `@min`, `@max`, `@minLength`, `@maxLength`, and `@pattern` constraints
- Compile-time permission and type checking
- Direct numeric permission checks
- Typed handler contract
- Zero runtime dependencies

## Example language

```ts
app EmployeeApi {
  basePath: "/api";

  permissions {
    employeeRead: 1;
    employeeWrite: 2;
  }

  type EmployeeParams = {
    id: int @min(1);
  };

  type CreateEmployeeBody = {
    name: string @minLength(1) @maxLength(100);
    salary: number @min(0);
    tags?: string[];
  };

  GET "/employees/:id" => getEmployee {
    params: EmployeeParams;
    permission: employeeRead;
  }

  POST "/employees" => createEmployee {
    body: CreateEmployeeBody;
    permission: employeeWrite;
    status: 201;
  }
}
```

## Try it

```bash
bun install
bun src/cli.ts examples/employee-api/app.bunc \
  -o examples/employee-api/generated/server.ts \
  --handlers ../handlers.ts
bun examples/employee-api/generated/server.ts
```

The compiler is deterministic: the same source and compiler version produce the same server code. The LLM can help evolve the compiler, but normal builds do not depend on probabilistic generation.

## Architecture

```text
.bunc source
    -> lexer and parser
    -> semantic analysis
    -> static TypeScript generator
    -> Bun runtime/JIT
```

## Project direction

This first version proves the build-time model. The next meaningful steps are:

1. Differential tests against a reference interpreter.
2. Generated OpenAPI and typed clients.
3. Trie-based route generation for large applications.
4. Ahead-of-time serializers for declared response types.
5. Benchmark suite against native `Bun.serve` and Bun frameworks.
6. Fuzzing for parser, route, and validator equivalence.

Performance claims will be added only after repeatable benchmarks exist.
