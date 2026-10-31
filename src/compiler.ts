import { analyze } from "./analyze.ts";
import { generate, type GenerateOptions } from "./generator.ts";
import { parseTypeScript } from "./typescript-parser.ts";
import { parseNestTypeScript } from "./nest-parser.ts";

export function compile(source: string, options: GenerateOptions = {}): string {
  const app = /@Module\s*\(/.test(source)
    ? parseNestTypeScript(source, options.sourceImport)
    : parseTypeScript(source);
  analyze(app);
  return generate(app, options);
}

export { analyze } from "./analyze.ts";
export { generate } from "./generator.ts";
export { parseTypeScript as parse } from "./typescript-parser.ts";
export { parseNestTypeScript } from "./nest-parser.ts";
export { stripNestRuntime } from "./nest-transformer.ts";
export { parse as parseLegacy } from "./parser.ts";
export { CompileError } from "./lexer.ts";
export type * from "./ast.ts";
