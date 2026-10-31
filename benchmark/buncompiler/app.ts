import { schema, t, type Infer } from "../../src/dsl.ts";
import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Post } from "../../src/nest.ts";

const CreateUserBody = schema({
  name: t.string({ minLength: 1, maxLength: 100 }),
  score: t.int({ min: 0 }),
});

type CreateUserBody = Infer<typeof CreateUserBody>;

@Injectable()
export class BenchmarkService {
  plain() { return "OK"; }
  user(id: number) { return { id, name: "Benchmark User" }; }
  create(body: CreateUserBody) { return { id: 1, name: body.name, score: body.score }; }
}

@Controller()
export class BenchmarkController {
  constructor(private readonly service: BenchmarkService) {}

  @Get("plain")
  plain() { return this.service.plain(); }

  @Get("users/:id")
  user(@Param("id", ParseIntPipe) id: number) { return this.service.user(id); }

  @Post("users")
  create(@Body(CreateUserBody) body: CreateUserBody) { return this.service.create(body); }
}

@Module({ controllers: [BenchmarkController], providers: [BenchmarkService] })
export class BenchmarkModule {}
