import "reflect-metadata";
import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestNodeApplication, NodeAdapter } from "@nestjs/platform-node";

interface CreateUserBody {
  name: string;
  score: number;
}

@Injectable()
class BenchmarkService {
  plain() { return "OK"; }
  user(id: number) { return { id, name: "Benchmark User" }; }
  create(body: CreateUserBody) { return { id: 1, name: body.name, score: body.score }; }
}

@Controller()
class BenchmarkController {
  constructor(private readonly service: BenchmarkService) {}

  @Get("plain")
  plain() { return this.service.plain(); }

  @Get("users/:id")
  user(@Param("id", ParseIntPipe) id: number) { return this.service.user(id); }

  @Post("users")
  create(@Body() body: CreateUserBody) {
    if (
      typeof body !== "object" || body === null ||
      typeof body.name !== "string" || body.name.length < 1 || body.name.length > 100 ||
      !Number.isSafeInteger(body.score) || body.score < 0
    ) throw new BadRequestException("Invalid body");
    return this.service.create(body);
  }
}

@Module({ controllers: [BenchmarkController], providers: [BenchmarkService] })
class BenchmarkModule {}

const app = await NestFactory.create<NestNodeApplication>(BenchmarkModule, new NodeAdapter(), {
  logger: false,
});
await app.listen(Number(process.env.PORT ?? 4100), "127.0.0.1");
