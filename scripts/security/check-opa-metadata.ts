import { Project, type ClassDeclaration, type Decorator } from 'ts-morph';

const HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Patch',
  'Delete',
  'Put',
  'Head',
  'Options',
  'All'
]);
const AUTH_GUARD_PATTERN = /\b(JwtAuthGuard|JwtTenantGuard)\b/;
const EXCLUDED_FILES = ['auth-test.controller.ts'];

function getDecoratorByName(decorators: Decorator[], name: string): Decorator | undefined {
  return decorators.find((decorator) => decorator.getName() === name);
}

function hasDecorator(decorators: Decorator[], name: string): boolean {
  return getDecoratorByName(decorators, name) !== undefined;
}

function hasAuthGuards(decorators: Decorator[]): boolean {
  const useGuards = getDecoratorByName(decorators, 'UseGuards');
  if (!useGuards) {
    return false;
  }

  return AUTH_GUARD_PATTERN.test(useGuards.getText());
}

function isHttpRouteMethod(methodDecorators: Decorator[]): boolean {
  return methodDecorators.some((decorator) => HTTP_DECORATORS.has(decorator.getName()));
}

function shouldSkipFile(filePath: string): boolean {
  return EXCLUDED_FILES.some((fileName) => filePath.endsWith(fileName));
}

function inspectClass(controllerClass: ClassDeclaration): string[] {
  const errors: string[] = [];
  const classDecorators = controllerClass.getDecorators();

  const classHasAuthGuards = hasAuthGuards(classDecorators);
  const classHasResource = hasDecorator(classDecorators, 'Resource');
  const classHasAction = hasDecorator(classDecorators, 'Action');
  const className = controllerClass.getName() ?? '<anonymous-class>';
  const sourcePath = controllerClass.getSourceFile().getFilePath();

  for (const method of controllerClass.getMethods()) {
    const methodDecorators = method.getDecorators();
    if (!isHttpRouteMethod(methodDecorators)) {
      continue;
    }

    const methodIsPublic = hasDecorator(methodDecorators, 'Public');
    const methodHasAuthGuards = hasAuthGuards(methodDecorators);
    const isProtected = !methodIsPublic && (methodHasAuthGuards || classHasAuthGuards);

    if (!isProtected) {
      continue;
    }

    const hasResourceMetadata = hasDecorator(methodDecorators, 'Resource') || classHasResource;
    const hasActionMetadata = hasDecorator(methodDecorators, 'Action') || classHasAction;

    if (hasResourceMetadata && hasActionMetadata) {
      continue;
    }

    const line = method.getNameNode().getStartLineNumber();
    const missing: string[] = [];
    if (!hasResourceMetadata) {
      missing.push('@Resource');
    }
    if (!hasActionMetadata) {
      missing.push('@Action');
    }

    errors.push(
      `${sourcePath}:${line} ${className}.${method.getName()} missing ${missing.join(' and ')}`
    );
  }

  return errors;
}

function main(): void {
  const project = new Project({
    tsConfigFilePath: 'apps/api/tsconfig.app.json',
    skipAddingFilesFromTsConfig: true
  });

  project.addSourceFilesAtPaths('apps/api/src/modules/**/*.controller.ts');
  const sourceFiles = project
    .getSourceFiles()
    .filter((sourceFile) => !shouldSkipFile(sourceFile.getFilePath()));

  const errors: string[] = [];
  for (const sourceFile of sourceFiles) {
    for (const classDeclaration of sourceFile.getClasses()) {
      const decorators = classDeclaration.getDecorators();
      const isController = decorators.some((decorator) => {
        const name = decorator.getName();
        return name === 'Controller' || name === 'VersionedController';
      });

      if (!isController) {
        continue;
      }

      errors.push(...inspectClass(classDeclaration));
    }
  }

  if (errors.length > 0) {
    console.error('OPA metadata coverage check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `OPA metadata coverage check passed (${sourceFiles.length} controller files scanned).`
  );
}

main();
