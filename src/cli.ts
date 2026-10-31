#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { compile } from "./compiler.ts";

function usage(): never {
  console.error("Usage: bunc <app.ts> [-o generated/server.ts] [--handlers ./handlers.ts]");
  process.exit(1);
}

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) usage();

const input = resolve(args[0]);
const outputFlag = args.indexOf("-o");
const handlersFlag = args.indexOf("--handlers");
const output = resolve(outputFlag >= 0 ? args[outputFlag + 1] : "generated/server.ts");
const handlersImport = handlersFlag >= 0 ? args[handlersFlag + 1] : "./handlers.ts";

if ((outputFlag >= 0 && !args[outputFlag + 1]) || (handlersFlag >= 0 && !args[handlersFlag + 1])) usage();

try {
  const source = await readFile(input, "utf8");
  const generated = compile(source, { handlersImport });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generated, "utf8");
  console.log(`Compiled ${relative(process.cwd(), input)} -> ${relative(process.cwd(), output)}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
