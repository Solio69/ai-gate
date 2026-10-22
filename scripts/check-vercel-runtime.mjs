import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = await mkdtemp(join(repoRoot, '.vercel-runtime-'));
const resolvedSnapshot = resolve(snapshot);
if (!resolvedSnapshot.startsWith(repoRoot + sep)) {
  throw new Error('Runtime snapshot must stay inside the repository.');
}

const oldCookieSecret = process.env.COOKIE_SECRET;
try {
  await mkdir(join(snapshot, 'api'), { recursive: true });
  await mkdir(join(snapshot, 'apps', 'api'), { recursive: true });
  await cp(join(repoRoot, 'apps', 'api', 'dist'), join(snapshot, 'apps', 'api', 'dist'), { recursive: true });
  await writeFile(join(snapshot, 'package.json'), '{"type":"module"}\n');
  process.env.COOKIE_SECRET = 'vercel-runtime-smoke-secret';

  for (const route of ['session', 'chat']) {
    const javascript = join(repoRoot, 'api', route + '.js');
    const typescript = join(repoRoot, 'api', route + '.ts');
    const sourcePath = await access(javascript).then(() => javascript, () => typescript);
    const source = await readFile(sourcePath, 'utf8');
    const output = sourcePath.endsWith('.ts')
      ? ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText
      : source;
    const entry = join(snapshot, 'api', route + '.js');
    await writeFile(entry, output);
    const { default: handler } = await import(pathToFileURL(entry).href);
    assert.equal(typeof handler, 'function', route + ' must export an HTTP handler');
  }

  process.stdout.write('Vercel runtime import smoke: Passed\n');
} finally {
  if (oldCookieSecret === undefined) delete process.env.COOKIE_SECRET;
  else process.env.COOKIE_SECRET = oldCookieSecret;
  await rm(resolvedSnapshot, { recursive: true, force: true });
}
