#!/usr/bin/env node
// Validate index.json with DSH's own format-1 parser, then check the things the
// parser cannot know: that every pinned commit contains the package, that the
// working tree still matches that commit, and that display metadata is intact.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarketIndexError, marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'market.config.json'), 'utf8'));
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repoUrl = normalizeRepoUrl(rootPackage.repository?.url);
const indexUrl = `https://raw.githubusercontent.com/${new URL(repoUrl).pathname.slice(1)}/main/index.json`;
const errors = [];

let index;
try {
  index = parseMarketIndex(JSON.parse(fs.readFileSync(path.join(root, 'index.json'), 'utf8')), indexUrl);
} catch (error) {
  if (error instanceof MarketIndexError) fail(`index.json ${error.path}: ${error.reason}`);
  throw error;
}

const declared = new Map(config.plugins.map((plugin) => [plugin.dir.replace(/\/+$/u, ''), plugin]));
const listed = new Set();

for (const plugin of index.plugins) {
  const version = plugin.versions[0];
  const dir = version.source.path;
  const where = `${plugin.name}@${version.version}`;
  if (dir === undefined) {
    errors.push(`${where}: source.path is missing`);
    continue;
  }
  if (listed.has(dir)) errors.push(`${where}: ${dir} is listed twice`);
  listed.add(dir);

  const configEntry = declared.get(dir);
  if (configEntry === undefined) {
    errors.push(`${where}: ${dir} is not declared in market.config.json`);
  } else {
    const pkg = readPackage(dir);
    if (pkg.name !== plugin.name) errors.push(`${where}: package.json name is ${pkg.name}`);
    if (pkg.version !== version.version) errors.push(`${where}: package.json version is ${pkg.version}`);
    for (const label of configEntry.labels ?? []) {
      if (!plugin.metadata.labels.includes(label)) errors.push(`${where}: label ${label} is not in the index`);
    }
    if (configEntry.category !== undefined && plugin.metadata.category !== configEntry.category) {
      errors.push(`${where}: category ${plugin.metadata.category} does not match ${configEntry.category}`);
    }
  }

  const iconPath = path.join(root, dir, path.basename(new URL(plugin.icon).pathname));
  if (!fs.existsSync(iconPath)) errors.push(`${where}: icon ${iconPath} does not exist`);

  if (version.source.type === 'git') {
    const { commit } = version.source;
    if (version.source.url !== repoUrl) errors.push(`${where}: source.url ${version.source.url} is not ${repoUrl}`);
    if (!commitExists(commit, dir)) {
      errors.push(`${where}: commit ${commit} does not contain ${dir}/package.json`);
    } else {
      const diff = git(['diff', '--name-only', commit, '--', dir]);
      if (diff !== '') errors.push(`${where}: working tree differs from pinned commit ${commit}:\n${diff}`);
    }
    const target = marketInstallTarget(plugin.name, version);
    const expected = `git+${repoUrl}.git#${commit}&path:/${dir}`;
    if (target.spec !== expected) errors.push(`${where}: install spec ${target.spec} is not ${expected}`);
  }
}

for (const dir of declared.keys()) {
  if (!listed.has(dir)) errors.push(`${dir}: declared in market.config.json but missing from index.json; run npm run build`);
}

if (errors.length > 0) {
  console.error(`check-index: ${errors.length} problem(s)`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`index.json OK: ${index.plugins.length} plugins, indexed at ${indexUrl}`);
for (const plugin of index.plugins) {
  const version = plugin.versions[0];
  console.log(`  ${plugin.name}@${version.version} -> ${marketInstallTarget(plugin.name, version).spec}`);
}

function readPackage(dir) {
  return JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
}

function commitExists(commit, dir) {
  try {
    git(['cat-file', '-e', `${commit}:${dir}/package.json`]);
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function normalizeRepoUrl(url) {
  return String(url ?? '')
    .replace(/^git\+/u, '')
    .replace(/#.*$/u, '')
    .replace(/\.git$/u, '');
}

function fail(message) {
  console.error(`check-index: ${message}`);
  process.exit(1);
}
