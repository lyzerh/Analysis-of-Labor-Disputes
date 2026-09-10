import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagesBase = '/Analysis-of-Labor-Disputes/';
const outputDirectory = resolve('dist-pages');
const indexHtml = await readFile(resolve(outputDirectory, 'index.html'), 'utf8');

const localReferences = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:https?:|data:|#)/.test(reference));

const unsafeReferences = localReferences.filter((reference) => !reference.startsWith(pagesBase));
if (unsafeReferences.length > 0) {
  throw new Error(`Pages build contains paths outside ${pagesBase}: ${unsafeReferences.join(', ')}`);
}

const outputFiles = await readdir(outputDirectory, { recursive: true });
if (outputFiles.some((file) => /(?:^|[\\/])server\.(?:c?js|mjs)$/.test(file))) {
  throw new Error('Pages build must not contain an Express server artifact');
}

const browserJavaScript = await Promise.all(
  outputFiles
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFile(resolve(outputDirectory, file), 'utf8')),
);
const browserBundle = browserJavaScript.join('\n');
const forbiddenServerDependencies = [
  '@google/genai',
  'GeminiSemanticResolver',
  '/api/semantic/resolve',
];
const leakedDependencies = forbiddenServerDependencies.filter((value) => browserBundle.includes(value));
if (leakedDependencies.length > 0) {
  throw new Error(`Pages browser bundle contains server-only semantic dependencies: ${leakedDependencies.join(', ')}`);
}

console.log(`Pages build verified: ${localReferences.length} local asset paths use ${pagesBase}; no server-only semantic dependency found.`);
