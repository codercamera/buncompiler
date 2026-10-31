import { analyze } from "./analyze.ts";
import { generate, type GenerateOptions } from "./generator.ts";
import { parse } from "./parser.ts";

export function compile(source: string, options: GenerateOptions = {}): string {
  const app = parse(source);
  analyze(app);
  return generate(app, options);
}

export { analyze } from "./analyze.ts";
export { generate } from "./generator.ts";
export { parse } from "./parser.ts";
export { CompileError } from "./lexer.ts";
export type * from "./ast.ts";
