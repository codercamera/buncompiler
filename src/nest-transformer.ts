import ts from "typescript";

const COMPILE_ONLY_IMPORTS = new Set([
  "Body", "Controller", "Delete", "Get", "HttpCode", "Injectable", "Module",
  "Param", "ParseIntPipe", "Patch", "Post", "Put", "Query", "Req", "UseGuards",
  "schema", "t", "defineApp",
]);

export function stripNestRuntime(source: string, fileName = "app.ts"): string {
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (ts.isImportDeclaration(node)) return stripImport(node);
      if (ts.isVariableStatement(node)) {
        const declarations = node.declarationList.declarations.filter((declaration) => !isSchemaDeclaration(declaration));
        if (!declarations.length) return undefined;
        if (declarations.length !== node.declarationList.declarations.length) {
          return ts.factory.updateVariableStatement(
            node,
            withoutDecorators(node.modifiers),
            ts.factory.updateVariableDeclarationList(node.declarationList, declarations),
          );
        }
      }
      if (ts.isClassDeclaration(node)) {
        return ts.factory.updateClassDeclaration(
          node,
          withoutDecorators(node.modifiers),
          node.name,
          node.typeParameters,
          node.heritageClauses,
          ts.visitNodes(node.members, visit, ts.isClassElement),
        );
      }
      if (ts.isMethodDeclaration(node)) {
        return ts.factory.updateMethodDeclaration(
          node,
          withoutDecorators(node.modifiers),
          node.asteriskToken,
          node.name,
          node.questionToken,
          node.typeParameters,
          ts.visitNodes(node.parameters, visit, ts.isParameter),
          node.type,
          ts.visitNode(node.body, visit, ts.isBlock),
        );
      }
      if (ts.isConstructorDeclaration(node)) {
        return ts.factory.updateConstructorDeclaration(
          node,
          withoutDecorators(node.modifiers),
          ts.visitNodes(node.parameters, visit, ts.isParameter),
          ts.visitNode(node.body, visit, ts.isBlock)!,
        );
      }
      if (ts.isParameter(node)) {
        return ts.factory.updateParameterDeclaration(
          node,
          withoutDecorators(node.modifiers),
          node.dotDotDotToken,
          node.name,
          node.questionToken,
          node.type,
          node.initializer,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit) as ts.SourceFile;
  };

  return ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      experimentalDecorators: true,
      sourceMap: false,
      removeComments: false,
    },
    transformers: { before: [transformer] },
  }).outputText;
}

function stripImport(node: ts.ImportDeclaration): ts.ImportDeclaration | undefined {
  if (!node.importClause?.namedBindings || !ts.isNamedImports(node.importClause.namedBindings)) return node;
  const elements = node.importClause.namedBindings.elements.filter((specifier) => {
    const importedName = specifier.propertyName?.text ?? specifier.name.text;
    return !specifier.isTypeOnly && !COMPILE_ONLY_IMPORTS.has(importedName);
  });
  const defaultImport = node.importClause.isTypeOnly ? undefined : node.importClause.name;
  if (!defaultImport && !elements.length) return undefined;
  return ts.factory.updateImportDeclaration(
    node,
    node.modifiers,
    ts.factory.updateImportClause(
      node.importClause,
      false,
      defaultImport,
      elements.length ? ts.factory.createNamedImports(elements) : undefined,
    ),
    node.moduleSpecifier,
    node.attributes,
  );
}

function isSchemaDeclaration(declaration: ts.VariableDeclaration): boolean {
  const initializer = declaration.initializer;
  return !!initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === "schema";
}

function withoutDecorators(modifiers: ts.NodeArray<ts.ModifierLike> | undefined): ts.NodeArray<ts.Modifier> | undefined {
  if (!modifiers) return undefined;
  return ts.factory.createNodeArray(modifiers.filter((modifier): modifier is ts.Modifier => !ts.isDecorator(modifier)));
}
