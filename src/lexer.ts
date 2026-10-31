export type TokenKind = "identifier" | "number" | "string" | "symbol" | "eof";

export interface Token {
  kind: TokenKind;
  value: string;
  line: number;
  column: number;
}

export class CompileError extends Error {
  constructor(message: string, line?: number, column?: number) {
    super(line === undefined ? message : `${message} at ${line}:${column}`);
    this.name = "CompileError";
  }
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const advance = () => {
    const char = source[index++];
    if (char === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return char;
  };

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      advance();
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") advance();
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      const startLine = line;
      const startColumn = column;
      advance();
      advance();
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) advance();
      if (index >= source.length) throw new CompileError("Unterminated block comment", startLine, startColumn);
      advance();
      advance();
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (/[A-Za-z_$]/.test(char)) {
      let value = "";
      while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) value += advance();
      tokens.push({ kind: "identifier", value, line: startLine, column: startColumn });
      continue;
    }

    if (/[0-9]/.test(char)) {
      let value = "";
      while (index < source.length && /[0-9.]/.test(source[index])) value += advance();
      if (!/^\d+(\.\d+)?$/.test(value)) throw new CompileError(`Invalid number '${value}'`, startLine, startColumn);
      tokens.push({ kind: "number", value, line: startLine, column: startColumn });
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = advance();
      let value = "";
      let closed = false;
      while (index < source.length) {
        const current = advance();
        if (current === quote) {
          closed = true;
          break;
        }
        if (current === "\\") {
          if (index >= source.length) break;
          const escaped = advance();
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += escapes[escaped] ?? escaped;
        } else {
          value += current;
        }
      }
      if (!closed) throw new CompileError("Unterminated string", startLine, startColumn);
      tokens.push({ kind: "string", value, line: startLine, column: startColumn });
      continue;
    }

    if (char === "=" && source[index + 1] === ">") {
      advance();
      advance();
      tokens.push({ kind: "symbol", value: "=>", line: startLine, column: startColumn });
      continue;
    }

    if ("{}:;=?[]@(),".includes(char)) {
      tokens.push({ kind: "symbol", value: advance(), line: startLine, column: startColumn });
      continue;
    }

    throw new CompileError(`Unexpected character '${char}'`, startLine, startColumn);
  }

  tokens.push({ kind: "eof", value: "", line, column });
  return tokens;
}
