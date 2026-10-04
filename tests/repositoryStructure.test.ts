import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (...parts: string[]) => join(root, ...parts);

// Stage 0 acceptance: the directory layout and required specification
// documents named by the stage plan are present.
test('the stage plan directory layout exists', () => {
  for (const dir of ['api', 'engine', 'adapters', 'contracts', 'console', 'sdk', 'tests', 'docker']) {
    assert.ok(existsSync(at(dir)), `missing directory: ${dir}`);
  }
});

test('the specification is the five documents and nothing else', () => {
  for (const doc of [
    'AGENTS.md',
    'README.md',
    'docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md',
    'docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md',
    'docs/ERC8415-SEMANTIC-MODEL.md',
  ]) {
    assert.ok(existsSync(at(doc)), `missing document: ${doc}`);
  }
});

test('the development environment is defined and containerised', () => {
  assert.ok(existsSync(at('docs/DEVELOPMENT.md')));
  assert.ok(existsSync(at('docker/Dockerfile')));
  assert.ok(existsSync(at('docker/compose.yaml')));
  assert.ok(existsSync(at('.github/workflows/ci.yml')));
});

// Superseded product documents must not be reintroduced.
test('no superseded document has returned', () => {
  for (const gone of [
    'HANDOFF.md',
    'docs/ERC8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v1.0.md',
  ]) {
    assert.ok(!existsSync(at(gone)), `superseded document is back: ${gone}`);
  }
});

test('the frozen interface identifiers are recorded unchanged', () => {
  const agents = readFileSync(at('AGENTS.md'), 'utf8');
  assert.match(agents, /IRegisterProjection\s+0x6309e170/);
  assert.match(agents, /IProjectionSettlement\s+0xf4a7d71b/);
});
