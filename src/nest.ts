import type { Schema } from "./dsl.ts";

export type Type<T = unknown> = abstract new (...args: any[]) => T;
export type ConcreteType<T = unknown> = new (...args: any[]) => T;

export interface ModuleMetadata {
  controllers?: readonly ConcreteType[];
  providers?: readonly ConcreteType[];
  imports?: readonly ConcreteType[];
  basePath?: "" | `/${string}`;
}

export interface ExecutionContext {
  switchToHttp(): {
    getRequest<T = Request>(): T;
  };
  getClass(): Type;
  getHandler(): Function;
}

export interface CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}

export interface PipeTransform<T = unknown, R = unknown> {
  transform(value: T, metadata: ArgumentMetadata): R | Promise<R>;
}

export interface ArgumentMetadata {
  type: "body" | "query" | "param" | "custom";
  data?: string;
}

const classDecorator = (): ClassDecorator => () => undefined;
const methodDecorator = (): MethodDecorator => () => undefined;
const parameterDecorator = (): ParameterDecorator => () => undefined;

export const Controller = (_prefix = ""): ClassDecorator => classDecorator();
export const Injectable = (): ClassDecorator => classDecorator();
export const Module = (_metadata: ModuleMetadata): ClassDecorator => classDecorator();

export const Get = (_path = ""): MethodDecorator => methodDecorator();
export const Post = (_path = ""): MethodDecorator => methodDecorator();
export const Put = (_path = ""): MethodDecorator => methodDecorator();
export const Patch = (_path = ""): MethodDecorator => methodDecorator();
export const Delete = (_path = ""): MethodDecorator => methodDecorator();
export const HttpCode = (_status: number): MethodDecorator => methodDecorator();
export const UseGuards = (..._guards: ConcreteType<CanActivate>[]): ClassDecorator & MethodDecorator => (() => undefined) as ClassDecorator & MethodDecorator;

export const Req = (): ParameterDecorator => parameterDecorator();
export const Body = (_schema?: Schema<any>): ParameterDecorator => parameterDecorator();
export const Param = (_name?: string, _pipe?: ConcreteType<PipeTransform>): ParameterDecorator => parameterDecorator();
export const Query = (_nameOrSchema?: string | Schema<any>, _pipe?: ConcreteType<PipeTransform>): ParameterDecorator => parameterDecorator();

export class HttpException extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export class BadRequestException extends HttpException {
  constructor(message = "Bad Request") { super(message, 400); }
}

export class ForbiddenException extends HttpException {
  constructor(message = "Forbidden") { super(message, 403); }
}

// Compile marker matching Nest's familiar parameter-pipe style.
export class ParseIntPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new BadRequestException("Expected an integer");
    return parsed;
  }
}
