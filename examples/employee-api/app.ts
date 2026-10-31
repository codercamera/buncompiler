import { schema, t, type Infer } from "../../src/dsl.ts";
import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from "../../src/nest.ts";

export const CreateEmployeeBody = schema({
  name: t.string({ minLength: 1, maxLength: 100 }),
  salary: t.number({ min: 0 }),
  active: t.optional(t.boolean()),
});

export type CreateEmployeeBody = Infer<typeof CreateEmployeeBody>;

@Injectable()
export class EmployeeService {
  findOne(id: number, details = false) {
    return { id, name: "Example employee", detailsIncluded: details };
  }

  create(body: CreateEmployeeBody) {
    return { id: 1, ...body };
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return context.switchToHttp().getRequest<Request>().headers.get("x-api-key") === "demo";
  }
}

@Controller("employees")
@UseGuards(ApiKeyGuard)
export class EmployeeController {
  constructor(private readonly employees: EmployeeService) {}

  @Get(":id")
  findOne(
    @Param("id", ParseIntPipe) id: number,
    @Query("details") details?: boolean,
    @Req() _request?: Request,
  ) {
    return this.employees.findOne(id, details ?? false);
  }

  @Post()
  create(@Body(CreateEmployeeBody) body: CreateEmployeeBody) {
    return this.employees.create(body);
  }
}

@Module({
  basePath: "/api",
  controllers: [EmployeeController],
  providers: [EmployeeService, ApiKeyGuard],
})
export class AppModule {}
