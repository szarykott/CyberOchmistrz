import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomInt } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const propertyNames = ['restoration', 'validation', 'shopping', 'allocation', 'diets', 'operations'];
const help = `Usage: npm run test:model -- [options]
  --engine all|properties|fuzz|mutation  Engines to run (default: all)
  --seconds N                          Budget PER engine (default: 3600)
  --output DIR                         Report root (default: reports/model-testing)
  --replay FILE                        Replay a finding JSON; exit 1 if reproduced
  --mutate FILE                        Limit Stryker to one model source file
  --self-test                          Inject controlled property/fuzz failures
  --help                               Show this help
Exit: 0 = no findings, 1 = findings, 2 = infrastructure failure/interruption.
Budgets include engine startup. Reports distinguish budget exhaustion from completion.
Requires Node >=22. Run from any directory; paths resolve against repository root.`;

function stopTree(child, signal) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => {});
  } else {
    try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}

export async function runProcess(args, { log, timeoutMs, env = {}, signal } = {}) {
  const stream = createWriteStream(log, { flags: 'a' });
  const child = spawn(process.execPath, ['--max-old-space-size=1024', ...args], {
    cwd: root, env: { ...process.env, ...env }, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  let timedOut = false;
  let killTimer;
  const stop = () => {
    stopTree(child, 'SIGTERM');
    killTimer ??= setTimeout(() => stopTree(child, 'SIGKILL'), 1000);
  };
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, childSignal) => resolve({ code, signal: childSignal, timedOut }));
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(killTimer);
    signal?.removeEventListener('abort', stop);
    await new Promise(resolve => stream.end(resolve));
  }
  return result;
}

async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')); }
async function saveJson(file, value) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2));
  await rename(`${file}.tmp`, file);
}
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16);

async function main() {
  const { values, positionals } = parseArgs({ options: {
    engine: { type: 'string', default: 'all' }, seconds: { type: 'string', default: '3600' },
    output: { type: 'string', default: 'reports/model-testing' }, replay: { type: 'string' },
    mutate: { type: 'string' }, 'self-test': { type: 'boolean' }, help: { type: 'boolean' },
  }, allowPositionals: true });
  if (values.help) { console.log(help); return; }
  if (positionals.length) throw new Error(`Unexpected arguments: ${positionals.join(' ')}`);
  if (!['all', 'properties', 'fuzz', 'mutation'].includes(values.engine)) throw new Error('Unknown engine');
  const seconds = Number(values.seconds);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) throw new Error('--seconds must be between 1 and 86400');
  if (values.mutate && !/^(src\/model\/[\w-]+\.ts|src\/utils\/maxFlow\.ts)$/.test(values.mutate)) {
    throw new Error('--mutate must name a model .ts file or src/utils/maxFlow.ts');
  }
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node >=22 required');
  const output = path.resolve(root, values.output, `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`);
  await mkdir(output, { recursive: true });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const summary = {
    started: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    node: process.version, versions: {}, options: values, status: 'running', engines: {}, findings: [],
  };
  for (const name of ['fast-check', '@jazzer.js/core', '@stryker-mutator/core', 'jest', 'ts-jest', 'typescript']) {
    summary.versions[name] = require(`${name}/package.json`).version;
  }
  const checkpoint = async () => {
    await saveJson(path.join(output, 'summary.json'), summary);
    await writeFile(path.join(output, 'README.md'), [
      '# Model testing campaign', '', `Status: ${summary.status}`, `Commit: ${summary.commit} (dirty: ${summary.dirty})`, '',
      'See [summary.json](summary.json) for parameters, counts, versions and engine statuses.', '',
      'Mutation survivors indicate test gaps or equivalent mutants, not confirmed product defects.', '',
      ...summary.findings.map(item => `- [${item.kind}: ${item.target}](${item.file})${item.occurrences ? ` (${item.occurrences} occurrences)` : ''}`),
      '', 'Property and fuzz finding JSON files contain replay commands. Logs and Stryker events remain available after interruption.',
    ].join('\n'));
  };
  const run = (args, log, timeoutMs, env = {}) => runProcess(args, {
    log: path.join(output, log), timeoutMs, env, signal: controller.signal,
  });
  const finding = async (kind, target, key, detail) => {
    const existing = summary.findings.find(item => item.key === key);
    if (existing) { existing.occurrences++; return; }
    const file = `${kind}-${hash(key)}.json`;
    const replay = `npm run test:model -- --replay ${JSON.stringify(path.relative(root, path.join(output, file)))}`;
    await saveJson(path.join(output, file), { kind, target, ...detail, replay });
    summary.findings.push({ kind, target, key, file, occurrences: 1 });
    console.log(`Finding: ${target}; ${file}`);
  };
  console.log(`Reports: ${output}`);
  try {
    await checkpoint();
    const buildDir = `.model-testing/build/${path.basename(output)}`;
    const build = await run(['node_modules/typescript/bin/tsc', '-p', 'test/modelCampaign/tsconfig.json', '--outDir', buildDir], 'build.log', 120000);
    if (build.code !== 0 || controller.signal.aborted) throw new Error('Test compilation failed or interrupted; see build.log');
    const compiled = `${buildDir}/test/modelCampaign`;
    const worker = `${compiled}/worker.js`;
    const fuzz = `${compiled}/fuzz.js`;
    const jazzer = 'node_modules/@jazzer.js/core/dist/cli.js';
    const fuzzArgs = input => [jazzer, fuzz, input, '--sync', '--mode=fuzzing', `--includes=${buildDir}/src/`, '--timeout=3000'];
    if (values.replay) {
      const record = await readJson(path.resolve(root, values.replay));
      let reproduced;
      if (record.kind === 'property') {
        const resultFile = path.join(output, 'replay.json');
        const result = await run([worker, record.target, resultFile, String(record.seed), record.path], 'replay.log', 30000);
        if (record.timeout) reproduced = result.timedOut;
        else {
          if (result.code !== 0) throw new Error('Replay process failed; see replay.log');
          reproduced = (await readJson(resultFile)).failed;
        }
      } else if (record.kind === 'fuzz') {
        const input = path.resolve(path.dirname(path.resolve(root, values.replay)), record.input);
        const result = await run([...fuzzArgs(input), '--', '-runs=1', `-artifact_prefix=${output}${path.sep}`], 'replay.log', 30000, {
          MODEL_TEST_FUZZ_TARGET: record.target, MODEL_TEST_SELF_TEST: record.selfTest ? '1' : '0',
        });
        if (result.timedOut) throw new Error('Fuzz replay exceeded its budget; see replay.log');
        const log = await readFile(path.join(output, 'replay.log'), 'utf8');
        reproduced = (log.includes('Uncaught Exception:') && log.includes(record.error))
          || /ERROR: libFuzzer: (timeout|out-of-memory)/.test(log);
        if (!reproduced && result.code !== 0) throw new Error('Fuzz replay failed without reproducing the finding; see replay.log');
      } else throw new Error('Replay supports property and fuzz finding JSON files');
      summary.status = reproduced ? 'reproduced' : 'not-reproduced';
      process.exitCode = reproduced ? 1 : 0;
      console.log(summary.status);
      return;
    }
    const engines = values.engine === 'all' ? ['properties', 'fuzz', 'mutation'] : [values.engine];
    for (const engine of engines) {
      if (controller.signal.aborted) break;
      const started = Date.now();
      const deadline = started + seconds * 1000;
      const state = summary.engines[engine] = { status: 'running', batches: 0, runs: 0 };
      console.log(`Starting ${engine}; budget ${seconds}s`);
      await checkpoint();
      try {
        if (engine === 'properties') {
          const names = values['self-test'] ? ['self-test', ...propertyNames] : propertyNames;
          while (Date.now() < deadline && !controller.signal.aborted) {
            const target = names[state.batches % names.length];
            const seed = randomInt(0x7fffffff);
            const resultFile = path.join(output, 'property-batch.json');
            // Remove stale batch contents before starting a process that might time out.
            await saveJson(resultFile, null);
            state.current = { target, seed };
            await checkpoint();
            const result = await run([worker, target, resultFile, String(seed)], 'properties.log', Math.max(1, Math.min(15000, deadline - Date.now())));
            const details = await readJson(resultFile);
            state.batches++;
            if (details) {
              state.runs += details.runs;
              if (details.failed) await finding('property', target, `${target}:${details.error?.split('\n')[0]}`, details);
            } else if (!result.timedOut && !controller.signal.aborted) {
              throw new Error('Property worker failed; see properties.log');
            } else if (result.timedOut && Date.now() < deadline) {
              await finding('property', target, `${target}:timeout`, { seed, path: '', timeout: true });
            }
            await checkpoint();
          }
          delete state.current;
          state.status = 'budget-exhausted';
        } else if (engine === 'fuzz') {
          const { cruiseArbitrary } = require(path.resolve(root, compiled, 'properties.js'));
          const fc = require('fast-check');
          for (const target of ['restoration', 'allocation']) {
            const corpus = path.resolve(root, '.model-testing/corpus', target);
            await mkdir(corpus, { recursive: true });
            if (target === 'restoration') {
              for (const [i, seed] of fc.sample(cruiseArbitrary, { seed: 20261122, numRuns: 12 }).entries()) {
                await saveJson(path.join(corpus, `seed-${i}.json`), seed);
              }
              await writeFile(path.join(corpus, 'invalid.json'), '{');
            } else await writeFile(path.join(corpus, 'seed'), Buffer.from([1, 2, 3, 4, 5, 6]));
          }
          while (Date.now() < deadline && !controller.signal.aborted) {
            const target = ['restoration', 'allocation'][state.batches % 2];
            const batch = path.join(output, `fuzz-${state.batches}`);
            await mkdir(batch);
            const log = `fuzz-${state.batches}.log`;
            const remaining = deadline - Date.now();
            const slice = Math.min(30000, Math.ceil(seconds * 1000 / 2), remaining);
            // Rotate targets every 30 seconds, rather than spending the budget on the first one.
            const result = await run([...fuzzArgs(path.resolve(root, '.model-testing/corpus', target)), '--',
              `-max_total_time=${Math.max(1, Math.floor(slice / 1000) - 2)}`,
              `-artifact_prefix=${batch}${path.sep}`, '-max_len=16384', '-rss_limit_mb=1024',
            ], log, Math.min(35000, remaining), {
              MODEL_TEST_FUZZ_TARGET: target, MODEL_TEST_SELF_TEST: values['self-test'] ? '1' : '0',
            });
            const artifacts = (await readdir(batch)).filter(name => /^(crash|timeout|oom|leak)-/.test(name));
            const logText = await readFile(path.join(output, log), 'utf8');
            for (const artifact of artifacts) {
              const error = logText.match(/(?:Error|AssertionError)[^\n]*/)?.[0] ?? artifact.split('-')[0];
              const key = `${target}:${error}`;
              let input = `${path.basename(batch)}/${artifact}`;
              let minimized = (await readFile(path.join(batch, artifact))).length === 0;
              const minimizeBudget = Math.min(5000, deadline - Date.now());
              if (!values['self-test'] && !summary.findings.some(item => item.key === key) && minimizeBudget > 2000) {
                const minimizedFile = path.join(batch, `minimized-${artifact}`);
                const result = await run([...fuzzArgs(path.join(batch, artifact)), '--', '-minimize_crash=1',
                  `-exact_artifact_path=${minimizedFile}`, `-max_total_time=${Math.max(1, Math.floor(minimizeBudget / 1000) - 1)}`,
                ], `${log}.minimize`, minimizeBudget, { MODEL_TEST_FUZZ_TARGET: target });
                if (!result.timedOut && (await readdir(batch)).includes(path.basename(minimizedFile))) {
                  input = `${path.basename(batch)}/${path.basename(minimizedFile)}`;
                  minimized = true;
                }
              }
              await finding('fuzz', target, key, {
                input, minimized, log, error, selfTest: Boolean(values['self-test']),
              });
            }
            const executions = [...logText.matchAll(/#(\d+)/g)].at(-1);
            const runs = Math.max(Number(executions?.[1] ?? 0), artifacts.length);
            state.runs += runs;
            const coverage = [...logText.matchAll(/cov:\s*(\d+)/g)].at(-1);
            state.coveredEdges ??= {};
            state.coveredEdges[target] = Math.max(state.coveredEdges[target] ?? 0, Number(coverage?.[1] ?? 0));
            if (!values['self-test'] && runs > 0 && artifacts.length === 0 && !coverage) {
              throw new Error(`Jazzer executed without model coverage; see ${log}`);
            }
            state.batches++;
            if (result.code !== 0 && !result.timedOut && !controller.signal.aborted && artifacts.length === 0) {
              throw new Error(`Jazzer failed without a finding; see ${log}`);
            }
            await checkpoint();
          }
          state.status = 'budget-exhausted';
        } else {
          const mutation = path.join(output, 'mutation');
          await mkdir(mutation);
          const result = await run(['node_modules/@stryker-mutator/core/bin/stryker.js', 'run', 'stryker.config.mjs'], 'mutation.log',
            Math.max(1, deadline - Date.now()), {
              MODEL_TEST_REPORT_DIR: mutation, MODEL_TEST_MUTATE: values.mutate ?? '',
              MODEL_TEST_TEMP_DIR: `.model-testing/stryker-${path.basename(output)}`,
            });
          state.status = result.timedOut ? 'budget-exhausted' : result.code === 0 ? 'completed' : 'infrastructure-error';
          const events = await readdir(path.join(mutation, 'events')).catch(() => []);
          state.mutants = {};
          for (const event of events.filter(file => file.endsWith('-onMutantTested.json'))) {
            const mutant = await readJson(path.join(mutation, 'events', event));
            state.mutants[mutant.status] = (state.mutants[mutant.status] ?? 0) + 1;
          }
          if (['Survived', 'NoCoverage'].some(status => state.mutants[status])) {
            summary.findings.push({ kind: 'mutation', target: 'test gaps', file: 'mutation/events/' });
          }
          state.batches = 1;
          if (state.status === 'infrastructure-error' && !controller.signal.aborted) throw new Error('Stryker failed; see mutation.log');
        }
      } catch (error) {
        state.status = 'infrastructure-error';
        state.error = String(error);
        console.error(error.message);
      }
      if (controller.signal.aborted) state.status = 'interrupted';
      state.elapsedSeconds = (Date.now() - started) / 1000;
      await checkpoint();
    }
    const infrastructureError = Object.values(summary.engines).some(state => state.status === 'infrastructure-error');
    summary.status = controller.signal.aborted ? 'interrupted' : infrastructureError ? 'infrastructure-error' : 'finished';
    process.exitCode = controller.signal.aborted || infrastructureError ? 2 : summary.findings.length ? 1 : 0;
  } catch (error) {
    summary.status = controller.signal.aborted ? 'interrupted' : 'infrastructure-error';
    summary.error = String(error);
    process.exitCode = 2;
    console.error(error.message);
  } finally {
    for (const state of Object.values(summary.engines)) {
      if (state.status === 'running') state.status = summary.status;
    }
    summary.finished = new Date().toISOString();
    await checkpoint();
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 2; });
}
