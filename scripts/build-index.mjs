#!/usr/bin/env node
// Build the format-1 plugin market index from the vendored packages under
// plugins/ and the display metadata in market.config.json.
//
// The index pins every version to a commit in this repository, so a release is
// two commits: first the plugin changes, then the index generated from that
// commit. Run with --commit <sha> to pin an older, already-pushed commit.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = readJson('market.config.json');
const rootPackage = readJson('package.json');
const repoUrl = normalizeRepoUrl(rootPackage.repository?.url);
const branch = config.index?.branch ?? 'main';

const commitFlag = process.argv.indexOf('--commit');
const commit = commitFlag === -1 ? git(['rev-parse', 'HEAD']) : process.argv[commitFlag + 1];
if (!/^[0-9a-f]{40}$/u.test(commit ?? '')) {
  fail('--commit must be a full lowercase 40-hex-digit commit SHA');
}
ensureCommitted(commit);

const dirty = git(['status', '--porcelain', '--', 'plugins']);
if (dirty !== '' && !process.argv.includes('--allow-dirty')) {
  fail(`plugins/ has uncommitted changes; commit them first or the index will pin code users cannot install:\n${dirty}`);
}

const seen = new Set();
const plugins = config.plugins
  .map((declared, position) => {
    const dir = declared.dir.replace(/\/+$/u, '');
    const packageFile = path.join(root, dir, 'package.json');
    if (!fs.existsSync(packageFile)) fail(`config.plugins[${position}].dir: ${dir} has no package.json`);
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    if (seen.has(pkg.name)) fail(`duplicate plugin package name ${pkg.name}`);
    seen.add(pkg.name);

    if (declared.category !== undefined && !Object.hasOwn(config.categories, declared.category)) {
      fail(`${target(declared)}: category ${declared.category} is not declared in config.categories`);
    }
    for (const label of declared.labels ?? []) {
      if (!Object.hasOwn(config.labels, label)) fail(`${target(declared)}: label ${label} is not declared in config.labels`);
    }
    if (!fs.existsSync(path.join(root, dir, declared.icon))) {
      fail(`${target(declared)}: icon ${declared.icon} does not exist`);
    }
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(pkg.version ?? '')) {
      fail(`${target(declared)}: package.json version ${pkg.version} is not an exact SemVer version`);
    }

    const publishTimestamp = Number(git(['log', '-1', '--format=%ct', '--', dir])) || undefined;
    if (publishTimestamp === undefined) fail(`${target(declared)}: no commit touches ${dir}`);

    return {
      order: declared.order ?? position,
      entry: {
        name: pkg.name,
        title: declared.title,
        description: declared.description,
        icon: `${dir}/${declared.icon}`.replace(/^\.\//u, ''),
        author: declared.author ?? authorName(pkg.author),
        homepage: `${repoUrl}/tree/${branch}/${dir}`,
        repository: {
          url: repoUrl,
          directory: dir
        },
        metadata: {
          ...(declared.category === undefined ? {} : { category: declared.category }),
          keywords: Array.isArray(pkg.keywords) ? pkg.keywords.filter((keyword) => typeof keyword === 'string') : [],
          labels: declared.labels ?? []
        },
        versions: [
          {
            version: pkg.version,
            publishTimestamp,
            source: {
              type: 'git',
              url: repoUrl,
              commit,
              path: dir
            },
            ...(pkg.engines?.dsh === undefined ? {} : { engines: { dsh: pkg.engines.dsh } })
          }
        ]
      }
    };
  })
  .sort((left, right) => left.order - right.order)
  .map(({ entry }) => entry);

const index = {
  format: 1,
  title: config.index.title,
  description: config.index.description,
  metadata: {
    categories: config.categories,
    labels: config.labels
  },
  plugins
};

fs.writeFileSync(path.join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote index.json: ${plugins.length} plugins pinned to ${commit}`);
for (const plugin of plugins) {
  console.log(`  ${plugin.name}@${plugin.versions[0].version}  ${plugin.homepage}`);
}

function readJson(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) fail(`missing ${relative}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function ensureCommitted(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root, stdio: 'ignore' });
  } catch {
    fail(`commit ${sha} does not exist in this repository`);
  }
  for (const declared of config.plugins) {
    const dir = declared.dir.replace(/\/+$/u, '');
    try {
      execFileSync('git', ['cat-file', '-e', `${sha}:${dir}/package.json`], { cwd: root, stdio: 'ignore' });
    } catch {
      fail(`commit ${sha} does not contain ${dir}/package.json; commit the plugin before building the index`);
    }
  }
}

function normalizeRepoUrl(url) {
  const text = String(url ?? '')
    .replace(/^git\+/u, '')
    .replace(/#.*$/u, '')
    .replace(/\.git$/u, '');
  if (!/^https:\/\/[^/]+\/[^/]+\/[^/]+$/u.test(text)) fail(`package.json repository.url must be a GitHub https URL, got ${url}`);
  return text;
}

function authorName(author) {
  if (typeof author === 'string') return author;
  if (author !== null && typeof author === 'object' && typeof author.name === 'string') return author.name;
  return undefined;
}

function target(declared) {
  return declared.dir;
}

function fail(message) {
  console.error(`build-index: ${message}`);
  process.exit(1);
}
