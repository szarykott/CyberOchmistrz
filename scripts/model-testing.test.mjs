import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { runProcess } from './model-testing.mjs';

const execute = promisify(execFile);
const cli = async args => {
  try {
    const result = await execute(process.execPath, ['scripts/model-testing.mjs', ...args], { timeout: 60000 });
    return { ...result, code: 0 };
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    return error;
  }
};
const report = async output => {
  const directories = await readdir(output);
  assert.equal(directories.length, 1);
  const directory = path.join(output, directories[0]);
  return { directory, summary: JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8')) };
};

test('CLI rejects invalid budgets and engines before starting', async () => {
  for (const args of [['--seconds', 'NaN'], ['--seconds', '0'], ['--engine', 'unknown']]) {
    assert.equal((await cli(args)).code, 2);
  }
  assert.match((await cli(['--help'])).stdout, /Budget PER engine/);
});

test('supervisor terminates synchronous loops', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'model-timeout-'));
  const result = await runProcess(['-e', 'while (true) {}'], { log: path.join(output, 'worker.log'), timeoutMs: 200 });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
});

test('property campaign shrinks, deduplicates, continues and replays a finding', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'model-properties-'));
  assert.equal((await cli(['--engine', 'properties', '--seconds', '4', '--self-test', '--output', output])).code, 1);
  const { directory, summary } = await report(output);
  assert.equal(summary.status, 'finished');
  assert.ok(summary.engines.properties.batches > 7);
  assert.ok(summary.engines.properties.runs > 100);
  assert.equal(summary.findings.length, 1);
  assert.ok(summary.findings[0].occurrences > 1);
  const file = path.join(directory, summary.findings[0].file);
  const finding = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(finding.counterexample, '[0]');
  assert.match(finding.path, /\d/);
  const replayOutput = await mkdtemp(path.join(os.tmpdir(), 'model-replay-'));
  const replay = await cli(['--replay', file, '--output', replayOutput]);
  assert.equal(replay.code, 1);
  assert.match(replay.stdout, /reproduced/);
});

test('fuzz campaign persists a reproducer and continues across targets', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'model-fuzz-'));
  assert.equal((await cli(['--engine', 'fuzz', '--seconds', '5', '--self-test', '--output', output])).code, 1);
  const { directory, summary } = await report(output);
  assert.ok(summary.engines.fuzz.batches > 1);
  assert.deepEqual(new Set(summary.findings.map(item => item.target)), new Set(['restoration', 'allocation']));
  const file = path.join(directory, summary.findings[0].file);
  const finding = JSON.parse(await readFile(file, 'utf8'));
  await readFile(path.join(directory, finding.input));
  const replayOutput = await mkdtemp(path.join(os.tmpdir(), 'fuzz-replay-'));
  const replay = await cli(['--replay', file, '--output', replayOutput]);
  assert.equal(replay.code, 1, replay.stderr);
});

test('SIGTERM keeps a readable interrupted campaign report', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'model-interrupt-'));
  const child = execFile(process.execPath, ['scripts/model-testing.mjs', '--engine', 'properties', '--seconds', '60', '--output', output]);
  const closed = new Promise(resolve => child.once('close', code => resolve(code)));
  await new Promise(resolve => {
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Starting properties')) resolve(); });
  });
  child.kill('SIGTERM');
  assert.equal(await closed, 2);
  assert.equal((await report(output)).summary.status, 'interrupted');
});

test('native fuzzing instruments model code and executes generated inputs', async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), 'model-coverage-'));
  assert.equal((await cli(['--engine', 'fuzz', '--seconds', '6', '--output', output])).code, 0);
  const { directory, summary } = await report(output);
  assert.ok(summary.engines.fuzz.runs > 0);
  const log = await readFile(path.join(directory, 'fuzz-0.log'), 'utf8');
  assert.match(log, /cov:\s*[1-9]\d*/, 'Model instrumentation must record covered edges');
});
