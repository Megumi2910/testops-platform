#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const docs = join(repo, 'docs');
const failures = [];
const read = (p) => readFile(p, 'utf8');
const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full)); else files.push(full);
  }
  return files;
};
const files = await walk(docs);
const html = files.filter((file) => file.endsWith('.html'));
for (const file of html) {
  const source = await read(file);
  const label = relative(repo, file);
  if (!/<title>[^<]+<\/title>/i.test(source)) failures.push(`${label}: missing title`);
  if (!/<h1\b[^>]*>[^<]+<\/h1>/i.test(source)) failures.push(`${label}: missing h1`);
  if (!/report-nav|aria-label="[^"]*navigation/i.test(source)) failures.push(`${label}: missing navigation`);
  if (!/report\.css|@media\s+print/i.test(source)) failures.push(`${label}: missing print stylesheet/reference`);
}
const catalog = JSON.parse(await read(join(docs, 'reference/api-catalog.json')));
const endpoints = catalog.groups.flatMap((group) => group.endpoints);
const controllerRoot = join(repo, 'backend/src/main/java/com/megumi/testops');
const controllerFiles = (await walk(controllerRoot)).filter((file) => file.endsWith('Controller.java'));
const mappingPattern = /@(?:(?:org\.springframework\.web\.bind\.annotation)\.)?(?:Get|Post|Put|Patch|Delete)Mapping\b/g;
let sourceEndpointCount = 0;
for (const controller of controllerFiles) {
  sourceEndpointCount += ((await read(controller)).match(mappingPattern) || []).length;
}
if (endpoints.length !== sourceEndpointCount) {
  failures.push(`api-catalog.json: source exposes ${sourceEndpointCount} controller endpoints, catalog documents ${endpoints.length}`);
}
const apiReference = await read(join(docs, 'reference/api-reference.html'));
if (!apiReference.includes(`${sourceEndpointCount} documented endpoints`)) {
  failures.push(`api-reference.html: missing current ${sourceEndpointCount}-endpoint claim`);
}
const migrations = (await readdir(join(repo, 'backend/src/main/resources/db/migration'))).filter((name) => /^V\d+__.*\.sql$/.test(name));
const migrationVersions = migrations.map((name) => Number(name.match(/^V(\d+)__/)?.[1]));
const latestMigration = Math.max(...migrationVersions);
for (let i = 1; i <= latestMigration; i += 1) {
  const matches = migrationVersions.filter((version) => version === i).length;
  if (matches !== 1) failures.push(`migration inventory: expected one V${String(i).padStart(3, '0')}, found ${matches}`);
}
const latestMigrationLabel = `V${String(latestMigration).padStart(3, '0')}`;
const htmlMigrationClaim = `V001–${latestMigrationLabel}`;
for (const relativePath of [
  'index.html',
  'architecture/15-codebase-architecture.html',
  'implementation/feature-code-and-business-logic.html',
]) {
  const source = await read(join(docs, relativePath));
  if (!source.includes(htmlMigrationClaim)) failures.push(`${relativePath}: missing current ${htmlMigrationClaim} claim`);
}
const dataModel = await read(join(docs, 'architecture/03-data-model-api-and-workflows.md'));
if (!dataModel.includes(`\`V001\` through \`${latestMigrationLabel}\``)) {
  failures.push(`architecture/03-data-model-api-and-workflows.md: missing current ${latestMigrationLabel} boundary`);
}
const truthAudit = await read(join(docs, 'planning/86-documentation-truth-audit.md'));
if (!truthAudit.includes(`migrations \`V001\` through \`${latestMigrationLabel}\``)) {
  failures.push(`planning/86-documentation-truth-audit.md: missing current ${latestMigrationLabel} boundary`);
}
const router = await read(join(repo, 'frontend/src/app/router.tsx'));
for (const expected of ['login', 'register', 'verify-email', 'password-reset', 'account', 'dashboard', 'admin/users', 'projects']) if (!router.includes(`path: '${expected}'`)) failures.push(`router inventory: missing ${expected}`);
if (failures.length) { console.error(failures.map((failure) => `- ${failure}`).join('\n')); process.exit(1); }
console.log(`Documentation report verified: ${html.length} HTML pages, ${endpoints.length} source-matched API endpoints, V001–${latestMigrationLabel} migrations, and core routes.`);
