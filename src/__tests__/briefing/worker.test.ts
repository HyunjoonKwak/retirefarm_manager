// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DISABLED_FEATURES, EXIT, LIMITS, buildChildEnv, buildCodexExecArgs, classifyCodexFailure, classifyLoginStatus, featuresNotDisabled, missingExecFlags,
  parseArgs, parseCodexEvents, parseServerUrl, readWorkerToken, runOnce, validateBriefingResult, normalizeUsage, snapshotSchema,
} from '../../../scripts/briefing-worker.mjs';

const TOKEN = `rfw_${'0123456789abcdef'.repeat(4)}`;
const SERVER = 'https://farm.example.test';
const INPUT_HASH = 'a'.repeat(64);
const HELP_TEXT = '--strict-config --ignore-user-config --ignore-rules --ephemeral --sandbox --skip-git-repo-check --json --output-schema --output-last-message';
const featuresText = (overrides: Record<string, boolean> = {}) => [...DISABLED_FEATURES, 'unified_exec'].map((f) => `${f.padEnd(40)} stable             ${overrides[f] ?? f === 'unified_exec'}`).join('\n');
const SNAPSHOT = {
  schemaVersion: 1, rulesVersion: 'briefing-v1', statisticsVersion: 'auction-unit-weighted-v1',
  periodStart: '2026-08-31T00:00:00.000Z', periodEnd: '2026-09-07T00:00:00.000Z', generatedAt: '2026-09-14T01:00:00.000Z',
  sources: [
    { id: 'src-garak', title: '가락시장 경락', url: 'https://data.example.test/garak', status: 'AVAILABLE', note: '전주 거래' },
    { id: 'src-weather', title: '기상', url: null, status: 'NOT_COLLECTED', note: '미수집' },
  ],
  metrics: [{ id: 'm-avg-3kg', label: '주간 가중평균', value: 12345.6, unit: 'KRW/3kg', sourceId: 'src-garak' }],
  limitations: ['경쟁점 자료 미수집'],
};
const VALID_RESULT = {
  schemaVersion: 1,
  summary: '전주 도매가는 소폭 오름세였습니다.',
  sections: [
    { key: 'market', body: '가락시장 경락가는 상승 방향이었습니다.', sourceIds: ['src-garak'], metricIds: ['m-avg-3kg'] },
    { key: 'cultivation', body: '기상 자료는 아직 수집되지 않았습니다.', sourceIds: ['src-weather'], metricIds: [] },
    { key: 'commerce', body: '전자상거래 자료는 미수집입니다.', sourceIds: [], metricIds: [] },
    { key: 'competitors', body: '경쟁점 자료는 미수집입니다.', sourceIds: [], metricIds: [] },
  ],
  actions: [
    { text: '출하 시점을 유지하십시오.', sourceIds: ['src-garak'] },
    { text: '기상 자료 수집을 준비하십시오.', sourceIds: [] },
    { text: '경쟁점 패널을 확정하십시오.', sourceIds: [] },
  ],
  limitations: ['가격 외 분야는 미수집입니다.'],
};
const FAST_LIMITS = { ...LIMITS, heartbeatIntervalMs: 10_000, codexTimeoutMs: 5_000, codexKillGraceMs: 10, completeRetryDelayMs: 1, precheckTimeoutMs: 5_000 };

class FakeChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdinText = '';
  killSignals: string[] = [];
  private exited = false;
  private readonly stdinDone: Promise<void>;
  constructor() {
    super();
    this.stdin.on('data', (chunk: Buffer) => { this.stdinText += chunk.toString(); });
    this.stdinDone = new Promise((resolve) => this.stdin.on('finish', () => resolve()));
  }
  waitForStdin() { return this.stdinDone; }
  kill(signal = 'SIGTERM') { this.killSignals.push(signal); setTimeout(() => this.finish(null, signal), 0); return true; }
  finish(code: number | null, signal: string | null = null) {
    if (this.exited) return;
    this.exited = true;
    this.stdout.end();
    this.stderr.end();
    setTimeout(() => this.emit('close', code, signal), 0);
  }
}
type SpawnCall = { command: string; args: string[]; options: Record<string, unknown>; child: FakeChild };
type ExecScript = (child: FakeChild, args: string[]) => void | Promise<void>;
type FetchCall = { url: string; init: RequestInit; body: Record<string, unknown> };
type Responder = (body: Record<string, unknown>, call: number) => Response | Promise<Response | Error> | Error;

function jsonResponse(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }
const lastMessagePath = (args: string[]) => args[args.indexOf('--output-last-message') + 1];
const USAGE = { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 300 };
const execSuccess = (result: unknown, { usage = USAGE as Record<string, number> | null, extraEvents = [] as unknown[], turnCompleted = true } = {}): ExecScript => async (child, args) => {
  await child.waitForStdin();
  await fs.writeFile(lastMessagePath(args), JSON.stringify(result));
  child.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 't1' })}\n`);
  child.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(result) } })}\n`);
  for (const event of extraEvents) child.stdout.write(`${JSON.stringify(event)}\n`);
  if (turnCompleted) child.stdout.write(`${JSON.stringify({ type: 'turn.completed', usage: usage ?? undefined })}\n`);
  child.finish(0);
};

function makeSpawn({ loginOutput = 'Logged in using ChatGPT\n', helpOutput = HELP_TEXT, features = featuresText(), exec }: { loginOutput?: string; helpOutput?: string; features?: string; exec?: ExecScript }) {
  const calls: SpawnCall[] = [];
  const spawnImpl = vi.fn((command: string, args: string[], options: Record<string, unknown>) => {
    const child = new FakeChild();
    calls.push({ command, args, options, child });
    if (args.includes('--help')) { child.stdout.write(helpOutput); child.finish(0); }
    else if (args[0] === 'features') { child.stdout.write(`${features}\n`); child.finish(0); }
    else if (args[0] === 'login') { child.stdout.write(loginOutput); child.finish(loginOutput.includes('ChatGPT') ? 0 : 1); }
    else if (args[0] === 'exec') { void (exec ?? (() => child.finish(1)))(child, args); }
    else child.finish(1);
    return child;
  });
  return { spawnImpl: spawnImpl as never, calls, execCalls: () => calls.filter((call) => call.args[0] === 'exec' && !call.args.includes('--help')) };
}

function makeFetch(responders: Record<string, Responder>) {
  const calls: FetchCall[] = [];
  const counts: Record<string, number> = {};
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const action = String(body.action);
    calls.push({ url, init, body });
    counts[action] = (counts[action] ?? 0) + 1;
    const responder = responders[action] ?? (() => jsonResponse({ ok: true }));
    const outcome = await responder(body, counts[action]);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });
  return { fetchImpl: fetchImpl as never, calls, actions: () => calls.map((call) => call.body.action) };
}

const claimJob = (snapshot: unknown = SNAPSHOT) => () => jsonResponse({ job: { id: 'job-1', leaseToken: 'lease-abc', inputHash: INPUT_HASH, leaseUntil: '2026-09-14T01:10:00.000Z', snapshot } });
type LogEntry = { level: string; message: string; fields: Record<string, unknown> };
const makeLog = () => { const entries: LogEntry[] = []; return { entries, log: (level: string, message: string, fields = {}) => { entries.push({ level, message, fields }); } }; };
const failCalls = (fetch: ReturnType<typeof makeFetch>) => fetch.calls.filter((c) => c.body.action === 'fail');

let dir: string;
let tokenFile: string;
let env: Record<string, string>;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'briefing-worker-test-'));
  tokenFile = path.join(dir, 'token');
  await fs.writeFile(tokenFile, `${TOKEN}\n`, { mode: 0o600 });
  env = { PATH: '/usr/bin', HOME: dir, BRIEFING_SERVER_URL: SERVER, BRIEFING_WORKER_TOKEN_FILE: tokenFile, OPENAI_API_KEY: 'sk-should-never-leak', CODEX_API_KEY: 'also-secret', DATABASE_URL: 'file:prod.db' };
});
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

async function run(overrides: { spawn: ReturnType<typeof makeSpawn>; fetch: ReturnType<typeof makeFetch>; env?: Record<string, string>; limits?: typeof FAST_LIMITS }) {
  const { entries, log } = makeLog();
  const code = await runOnce({ env: overrides.env ?? env, fetchImpl: overrides.fetch.fetchImpl, spawnImpl: overrides.spawn.spawnImpl, log, tmpRoot: dir, sleep: async () => undefined, limits: overrides.limits ?? FAST_LIMITS });
  return { code, entries };
}

describe('configuration', () => {
  it('accepts https and localhost http, rejects everything else', () => {
    expect(parseServerUrl('https://farm.example.test')).toBe('https://farm.example.test/api/briefing-worker');
    expect(parseServerUrl('https://farm.example.test/base/')).toBe('https://farm.example.test/base/api/briefing-worker');
    expect(parseServerUrl('https://farm.example.test/api/briefing-worker')).toBe('https://farm.example.test/api/briefing-worker');
    expect(parseServerUrl('http://localhost:3000')).toBe('http://localhost:3000/api/briefing-worker');
    expect(() => parseServerUrl('http://farm.example.test')).toThrow(/https/);
    expect(() => parseServerUrl('https://user:pw@farm.example.test')).toThrow(/credentials/);
    expect(() => parseServerUrl('https://farm.example.test/?x=1')).toThrow(/query/);
    expect(() => parseServerUrl('')).toThrow(/required/);
  });
  it('reads exactly one app-issued token from an owner-only regular file', async () => {
    await expect(readWorkerToken(tokenFile)).resolves.toBe(TOKEN);
    await fs.chmod(tokenFile, 0o644);
    await expect(readWorkerToken(tokenFile)).rejects.toThrow(/chmod 600/);
    await fs.chmod(tokenFile, 0o600);
    await fs.writeFile(tokenFile, `${TOKEN}\n${TOKEN}`);
    await expect(readWorkerToken(tokenFile)).rejects.toThrow(/app-issued worker token/);
    await fs.writeFile(tokenFile, 'rfw_notahexstring');
    await expect(readWorkerToken(tokenFile)).rejects.toThrow(/app-issued worker token/);
    await expect(readWorkerToken(path.join(dir, 'missing'))).rejects.toThrow(/not readable/);
  });
  it('child env is an allowlist: no API keys, worker token or app settings', () => {
    const childEnv = buildChildEnv(env);
    expect(childEnv).toEqual({ PATH: '/usr/bin', HOME: dir, NO_COLOR: '1' });
    expect(Object.keys(childEnv).some((key) => /OPENAI|BRIEFING|API_KEY|DATABASE/.test(key))).toBe(false);
  });
  it('argument parsing only accepts --once', () => {
    expect(parseArgs(['--once'])).toEqual({ mode: 'once' });
    expect(parseArgs(['--help'])).toEqual({ mode: 'help' });
    expect(parseArgs([])).toEqual({ mode: 'invalid' });
    expect(parseArgs(['--once', '--loop'])).toEqual({ mode: 'invalid' });
  });
});

describe('codex helpers', () => {
  it('classifies login status output, required exec flags and feature switches', () => {
    expect(classifyLoginStatus('Logged in using ChatGPT\n')).toBe('CHATGPT');
    expect(classifyLoginStatus('Logged in using an API key - sk-***')).toBe('API_KEY');
    expect(classifyLoginStatus('Not logged in')).toBe('NOT_LOGGED_IN');
    expect(classifyLoginStatus('something else')).toBe('UNKNOWN');
    expect(missingExecFlags(HELP_TEXT)).toEqual([]);
    expect(missingExecFlags('--json --sandbox')).toContain('--ephemeral');
    expect(featuresNotDisabled(featuresText())).toEqual([]);
    expect(featuresNotDisabled(featuresText({ shell_tool: true }))).toEqual(['shell_tool']);
    expect(featuresNotDisabled('')).toEqual([...DISABLED_FEATURES]);
  });
  it('builds the isolated exec command line', () => {
    const args = buildCodexExecArgs({ schemaPath: '/w/schema.json', lastMessagePath: '/w/last.json', workDir: '/w' });
    for (const flag of ['--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json']) expect(args).toContain(flag);
    expect(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2)).toEqual(['--sandbox', 'read-only']);
    expect(args).toContain('web_search="disabled"');
    expect(args).toContain('forced_login_method="chatgpt"');
    expect(args).toContain('--strict-config');
    expect(args).toContain('project_doc_max_bytes=0');
    expect(args).toContain('skills.max_context_tokens=1');
    expect(args).toContain('model_instructions_file="/w/report-instructions.txt"');
    expect(args).toContain('shell_environment_policy.inherit="none"');
    for (const feature of ['shell_tool', 'hooks', 'plugins', 'browser_use', 'multi_agent']) expect(args[args.indexOf(feature) - 1]).toBe('--disable');
    expect(args.at(-1)).toBe('-');
    expect(args.some((arg) => /dangerously|full-access|workspace-write/.test(arg))).toBe(false);
  });
  it('parses JSONL events and classifies failures', () => {
    const events = parseCodexEvents([
      JSON.stringify({ type: 'thread.started' }), 'not json', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"a":1}' } }),
      JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 3 } }),
    ].join('\n'));
    expect(events.lastAgentMessage).toBe('{"a":1}');
    expect(events.turnCompleted).toBe(true);
    expect(normalizeUsage(events.usage)).toEqual({ inputTokens: 10, outputTokens: 3, cachedInputTokens: 2 });
    expect(normalizeUsage({ input_tokens: 1, output_tokens: 2 })).toEqual({ inputTokens: 1, outputTokens: 2, cachedInputTokens: 0 });
    expect(normalizeUsage({ input_tokens: -1 })).toBeUndefined();
    const base = { timedOut: false, outputExceeded: false, spawnError: false, errors: [], stderr: '' };
    expect(classifyCodexFailure({ ...base, timedOut: true })).toBe('TIMEOUT');
    expect(classifyCodexFailure({ ...base, errors: ['429 Too Many Requests'] })).toBe('RATE_LIMIT');
    expect(classifyCodexFailure({ ...base, stderr: 'usage limit reached' })).toBe('RATE_LIMIT');
    expect(classifyCodexFailure({ ...base, stderr: 'Not logged in. Please sign in again.' })).toBe('AUTH_REQUIRED');
    expect(classifyCodexFailure({ ...base, stderr: 'segfault' })).toBe('CODEX_FAILED');
    expect(classifyCodexFailure({ ...base, outputExceeded: true, errors: ['429'] })).toBe('CODEX_FAILED');
  });
});

describe('validateBriefingResult', () => {
  const snapshot = snapshotSchema.parse(SNAPSHOT);
  const detailOf = (value: unknown) => { try { validateBriefingResult(value, snapshot); return 'accepted'; } catch (error) { return `${(error as { reason: string }).reason}:${(error as { detail: string }).detail}`; } };
  it('accepts a contract-conformant result and trims prose like the server does', () => {
    expect(validateBriefingResult(VALID_RESULT, snapshot)).toEqual(VALID_RESULT);
    expect(validateBriefingResult({ ...VALID_RESULT, summary: '  여백 포함 요약  ' }, snapshot).summary).toBe('여백 포함 요약');
    expect(detailOf(VALID_RESULT)).toBe('accepted');
  });
  it.each([
    ['digits in summary', { ...VALID_RESULT, summary: '3kg 가격이 올랐습니다.' }, 'result_schema:summary'],
    ['fullwidth digits in body', { ...VALID_RESULT, sections: VALID_RESULT.sections.map((s, i) => (i === 0 ? { ...s, body: '１２ 퍼센트 상승' } : s)) }, 'result_schema:sections.0.body'],
    ['missing section', { ...VALID_RESULT, sections: VALID_RESULT.sections.slice(0, 3) }, 'result_schema:sections'],
    ['duplicate section key', { ...VALID_RESULT, sections: [...VALID_RESULT.sections.slice(0, 3), { ...VALID_RESULT.sections[0] }] }, 'result_schema:sections'],
    ['two actions', { ...VALID_RESULT, actions: VALID_RESULT.actions.slice(0, 2) }, 'result_schema:actions'],
    ['unknown sourceId', { ...VALID_RESULT, actions: VALID_RESULT.actions.map((a, i) => (i === 0 ? { ...a, sourceIds: ['src-nope'] } : a)) }, 'result_schema:references'],
    ['unknown metricId', { ...VALID_RESULT, sections: VALID_RESULT.sections.map((s, i) => (i === 0 ? { ...s, metricIds: ['m-nope'] } : s)) }, 'result_schema:references'],
    ['extra top-level property', { ...VALID_RESULT, extra: true }, 'result_schema:root'],
    ['extra nested property', { ...VALID_RESULT, actions: VALID_RESULT.actions.map((a, i) => (i === 0 ? { ...a, note: 'x' } : a)) }, 'result_schema:actions.0'],
    ['wrong schemaVersion', { ...VALID_RESULT, schemaVersion: 2 }, 'result_schema:schemaVersion'],
    ['whitespace-only summary', { ...VALID_RESULT, summary: '   ' }, 'result_schema:summary'],
    ['too many limitations', { ...VALID_RESULT, limitations: Array.from({ length: 21 }, () => '한계') }, 'result_schema:limitations'],
  ])('rejects %s', (_name, value, expected) => {
    expect(detailOf(value)).toBe(expected);
  });
});

describe('runOnce', () => {
  it('persists before sending and replays the same completion after restart without any CLI calls', async () => {
    const firstFetch = makeFetch({ claim: claimJob(), complete: async body => {
      const file = path.join(`${tokenFile}.state`, 'pending.json');
      const saved = JSON.parse(await fs.readFile(file, 'utf8'));
      expect(saved.payload).toEqual(body);
      expect((await fs.stat(file)).mode & 0o077).toBe(0);
      return new TypeError('connection lost after server commit');
    } });
    expect((await run({ spawn: makeSpawn({ exec: execSuccess(VALID_RESULT) }), fetch: firstFetch })).code).toBe(EXIT.deliveryUncertain);
    const spawn = makeSpawn({ loginOutput: 'Not logged in' });
    const fetch = makeFetch({ complete: () => jsonResponse({ ok: true }) });
    const replay = await run({ spawn, fetch });
    expect(replay.code).toBe(EXIT.ok);
    expect(spawn.calls).toHaveLength(0);
    expect(fetch.actions()).toEqual(['complete']);
    expect(fetch.calls[0].body).toEqual(firstFetch.calls.find(c => c.body.action === 'complete')!.body);
    await expect(fs.readdir(`${tokenFile}.state`)).resolves.toEqual([]);
    expect(JSON.stringify(replay.entries)).not.toMatch(/lease-abc|rfw_|farm\.example/);
  });

  it('keeps rejected saved results blocking new claims across invocations', async () => {
    const spawn = makeSpawn({ exec: execSuccess(VALID_RESULT) });
    const first = makeFetch({ claim: claimJob(), complete: () => jsonResponse({}, 409) });
    expect((await run({ spawn, fetch: first })).code).toBe(EXIT.deliveryUncertain);
    const replaySpawn = makeSpawn({});
    const replayFetch = makeFetch({ complete: () => jsonResponse({}, 409) });
    expect((await run({ spawn: replaySpawn, fetch: replayFetch })).code).toBe(EXIT.deliveryUncertain);
    expect(replaySpawn.calls).toHaveLength(0);
    expect(replayFetch.actions()).toEqual(['complete']);
    await expect(fs.stat(path.join(`${tokenFile}.state`, 'pending.json'))).resolves.toBeDefined();
  });

  it('blocks a changed server or token from receiving a saved completion', async () => {
    await run({ spawn: makeSpawn({ exec: execSuccess(VALID_RESULT) }), fetch: makeFetch({ claim: claimJob(), complete: () => new Error('offline') }) });
    const spawn = makeSpawn({}); const fetch = makeFetch({});
    expect((await run({ spawn, fetch, env: { ...env, BRIEFING_SERVER_URL: 'https://other.example.test' } })).code).toBe(EXIT.deliveryUncertain);
    await fs.writeFile(tokenFile, `rfw_${'b'.repeat(64)}`);
    expect((await run({ spawn, fetch })).code).toBe(EXIT.deliveryUncertain);
    expect(fetch.calls).toHaveLength(0); expect(spawn.calls).toHaveLength(0);
  });

  it('does not run a second local worker while inference holds the lock', async () => {
    let release: () => void = () => undefined;
    const spawn = makeSpawn({ exec: async (child, args) => {
      await new Promise<void>(resolve => { release = resolve; });
      await execSuccess(VALID_RESULT)(child, args);
    } });
    const first = run({ spawn, fetch: makeFetch({ claim: claimJob() }) });
    await vi.waitFor(() => expect(spawn.execCalls()).toHaveLength(1));
    const secondSpawn = makeSpawn({}); const secondFetch = makeFetch({});
    const second = await run({ spawn: secondSpawn, fetch: secondFetch });
    expect(second.code).toBe(EXIT.deliveryUncertain);
    expect(secondFetch.calls).toHaveLength(0); expect(secondSpawn.calls).toHaveLength(0);
    release(); expect((await first).code).toBe(EXIT.ok);
  });

  it('blocks interrupted generation instead of claiming again after an uncertain fail', async () => {
    await run({ spawn: makeSpawn({ exec: execSuccess({ ...VALID_RESULT, summary: '' }) }), fetch: makeFetch({ claim: claimJob(), fail: () => new Error('offline') }) });
    const spawn = makeSpawn({}); const fetch = makeFetch({});
    const retry = await run({ spawn, fetch });
    expect(retry.code).toBe(EXIT.deliveryUncertain);
    expect(fetch.calls).toHaveLength(0); expect(spawn.calls).toHaveLength(0);
    expect(retry.entries.some(e => e.message.includes('interrupted generation'))).toBe(true);
  });

  it('blocks corrupt or unsafe pending files without inference', async () => {
    await run({ spawn: makeSpawn({ exec: execSuccess(VALID_RESULT) }), fetch: makeFetch({ claim: claimJob(), complete: () => new Error('offline') }) });
    const pending = path.join(`${tokenFile}.state`, 'pending.json');
    const spawn = makeSpawn({}); const fetch = makeFetch({});
    await fs.chmod(pending, 0o644);
    expect((await run({ spawn, fetch })).code).toBe(EXIT.deliveryUncertain);
    await fs.chmod(pending, 0o600); await fs.writeFile(pending, '{invalid');
    expect((await run({ spawn, fetch })).code).toBe(EXIT.deliveryUncertain);
    await fs.unlink(pending); await fs.symlink(tokenFile, pending);
    expect((await run({ spawn, fetch })).code).toBe(EXIT.deliveryUncertain);
    expect(fetch.calls).toHaveLength(0); expect(spawn.calls).toHaveLength(0);
  });

  it('requires inspection for an abandoned lock or interrupted atomic write', async () => {
    const state = `${tokenFile}.state`;
    await fs.mkdir(state, { mode: 0o700 });
    const spawn = makeSpawn({}); const fetch = makeFetch({});
    await fs.writeFile(path.join(state, 'worker.lock'), '{"pid":99999999}', { mode: 0o600 });
    expect((await run({ spawn, fetch })).code).toBe(EXIT.deliveryUncertain);
    await fs.unlink(path.join(state, 'worker.lock'));
    await fs.writeFile(path.join(state, 'pending.next'), 'interrupted', { mode: 0o600 });
    expect((await run({ spawn, fetch })).code).toBe(EXIT.deliveryUncertain);
    expect(fetch.calls).toHaveLength(0); expect(spawn.calls).toHaveLength(0);
  });

  it('runs one job end to end: claim → isolated codex → validated complete with usage', async () => {
    const spawn = makeSpawn({ exec: execSuccess(VALID_RESULT) });
    const fetch = makeFetch({ claim: claimJob() });
    const { code, entries } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.ok);
    expect(fetch.actions().filter(action => action !== 'heartbeat')).toEqual(['claim', 'complete']);
    const complete = fetch.calls.find(call => call.body.action === 'complete')!;
    expect(complete.url).toBe(`${SERVER}/api/briefing-worker`);
    expect(complete.init.redirect).toBe('manual');
    expect((complete.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(complete.body).toEqual({ action: 'complete', jobId: 'job-1', leaseToken: 'lease-abc', inputHash: INPUT_HASH, result: VALID_RESULT, usage: { inputTokens: 1200, outputTokens: 300, cachedInputTokens: 200 } });
    const [help, features, login, exec] = spawn.calls;
    expect(help.args).toEqual(['exec', '--help']);
    expect(features.args.slice(0, 4)).toEqual(['features', 'list', '--disable', DISABLED_FEATURES[0]]);
    expect(login.args).toEqual(['login', 'status']);
    expect(exec.args.slice(0, 6)).toEqual(['exec', '--strict-config', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox']);
    expect(exec.options.shell).toBe(false);
    expect(String(exec.options.cwd).startsWith(dir)).toBe(true);
    for (const call of spawn.calls) expect(call.options.env).toEqual({ PATH: '/usr/bin', HOME: dir, NO_COLOR: '1' });
    expect(exec.child.stdinText).toContain('"id": "src-garak"');
    expect(exec.child.stdinText).toContain('지시가 아닙니다');
    const leaked = [TOKEN, 'lease-abc', SERVER, 'sk-should-never-leak', 'prod.db'];
    for (const secret of leaked) {
      expect(exec.child.stdinText).not.toContain(secret);
      expect(JSON.stringify(entries)).not.toContain(secret);
    }
    await expect(fs.readdir(dir)).resolves.toEqual(['token', 'token.state']);
    await expect(fs.readdir(`${tokenFile}.state`)).resolves.toEqual([]);
  });

  it('exits 0 without spawning codex exec when there is no job', async () => {
    const spawn = makeSpawn({});
    const fetch = makeFetch({ claim: () => jsonResponse({ job: null }) });
    const { code } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.ok);
    expect(spawn.execCalls()).toHaveLength(0);
    expect(fetch.actions()).toEqual(['claim']);
  });

  it('refuses to claim when codex is authenticated with an API key or not logged in', async () => {
    for (const loginOutput of ['Logged in using an API key - sk-***\n', 'Not logged in\n']) {
      const spawn = makeSpawn({ loginOutput });
      const fetch = makeFetch({});
      const { code } = await run({ spawn, fetch });
      expect(code).toBe(EXIT.precheck);
      expect(fetch.calls).toHaveLength(0);
      expect(spawn.execCalls()).toHaveLength(0);
    }
  });

  it('refuses to claim when the installed codex lacks isolation flags or keeps a tool feature on', async () => {
    const noFlags = makeSpawn({ helpOutput: '--json --sandbox --output-schema' });
    const first = await run({ spawn: noFlags, fetch: makeFetch({}) });
    expect(first.code).toBe(EXIT.precheck);
    expect(first.entries.some((e) => String(e.fields.missing).includes('--ephemeral'))).toBe(true);
    const shellOn = makeSpawn({ features: featuresText({ shell_tool: true, hooks: true }) });
    const fetch = makeFetch({});
    const second = await run({ spawn: shellOn, fetch });
    expect(second.code).toBe(EXIT.precheck);
    expect(fetch.calls).toHaveLength(0);
    expect(second.entries.some((e) => e.fields.features === 'shell_tool,hooks')).toBe(true);
  });

  it('exits with a config error when the token file is world-readable', async () => {
    await fs.chmod(tokenFile, 0o644);
    const spawn = makeSpawn({});
    const fetch = makeFetch({});
    const { code } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.usage);
    expect(spawn.calls).toHaveLength(0);
  });

  it('reports INVALID_OUTPUT when codex output violates the contract', async () => {
    const spawn = makeSpawn({ exec: execSuccess({ ...VALID_RESULT, summary: '2배 올랐습니다' }) });
    const fetch = makeFetch({ claim: claimJob() });
    const { code, entries } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.jobFailed);
    expect(fetch.actions()).toEqual(['claim', 'fail']);
    expect(fetch.calls[1].body).toEqual({ action: 'fail', jobId: 'job-1', leaseToken: 'lease-abc', code: 'INVALID_OUTPUT' });
    const failed = entries.find((e) => e.message === 'job failed');
    expect(failed?.fields).toMatchObject({ code: 'INVALID_OUTPUT', reason: 'result_schema', detail: 'summary' });
    expect(JSON.stringify(entries)).not.toContain('올랐습니다');
  });

  it('reports INVALID_OUTPUT when the final message is not JSON', async () => {
    const spawn = makeSpawn({ exec: async (child, args) => { await child.waitForStdin(); await fs.writeFile(lastMessagePath(args), '죄송합니다, 작성할 수 없습니다.'); child.stdout.write(`${JSON.stringify({ type: 'turn.completed' })}\n`); child.finish(0); } });
    const fetch = makeFetch({ claim: claimJob() });
    const { code } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.jobFailed);
    expect(fetch.calls[1].body.code).toBe('INVALID_OUTPUT');
  });

  it('does not submit when exit is 0 but the turn failed or never completed', async () => {
    const withError = makeSpawn({ exec: execSuccess(VALID_RESULT, { extraEvents: [{ type: 'turn.failed', error: { message: 'usage limit reached' } }] }) });
    const first = await run({ spawn: withError, fetch: makeFetch({ claim: claimJob() }) });
    expect(first.code).toBe(EXIT.jobFailed);
    expect(first.entries.find((e) => e.message === 'job failed')?.fields).toMatchObject({ code: 'RATE_LIMIT', reason: 'turn_not_completed' });
    expect(JSON.stringify(first.entries)).not.toContain('usage limit');
    const noTurn = makeSpawn({ exec: execSuccess(VALID_RESULT, { turnCompleted: false }) });
    const fetch = makeFetch({ claim: claimJob() });
    const second = await run({ spawn: noTurn, fetch });
    expect(second.code).toBe(EXIT.jobFailed);
    expect(fetch.actions()).toEqual(['claim', 'fail']);
    expect(fetch.calls[1].body.code).toBe('CODEX_FAILED');
  });

  it('maps codex rate-limit and auth errors to safe fail codes without logging raw text', async () => {
    const cases: Array<[string, string]> = [
      [JSON.stringify({ type: 'turn.failed', error: { message: 'You have hit your usage limit (rate limit)' } }), 'RATE_LIMIT'],
      [JSON.stringify({ type: 'error', message: 'Not logged in, please sign in again at https://auth.openai.com/x' }), 'AUTH_REQUIRED'],
      ['', 'CODEX_FAILED'],
    ];
    for (const [line, expected] of cases) {
      const spawn = makeSpawn({ exec: async (child) => { await child.waitForStdin(); child.stdout.write(`${line}\n`); child.stderr.write('secret-ish stderr https://auth.openai.com/y\n'); child.finish(1); } });
      const fetch = makeFetch({ claim: claimJob() });
      const { code, entries } = await run({ spawn, fetch });
      expect(code).toBe(EXIT.jobFailed);
      expect(fetch.calls[1].body.code).toBe(expected);
      expect(entries.find((e) => e.message === 'job failed')?.fields.reason).toBe('codex_exit');
      expect(JSON.stringify(entries)).not.toMatch(/auth\.openai\.com|usage limit|secret-ish/);
    }
  });

  it('kills codex after the time limit and reports TIMEOUT', async () => {
    const spawn = makeSpawn({ exec: () => undefined });
    const fetch = makeFetch({ claim: claimJob() });
    const { code } = await run({ spawn, fetch, limits: { ...FAST_LIMITS, codexTimeoutMs: 30 } });
    expect(code).toBe(EXIT.jobFailed);
    expect(spawn.execCalls()[0].child.killSignals).toContain('SIGTERM');
    expect(fetch.calls.at(-1)?.body).toEqual({ action: 'fail', jobId: 'job-1', leaseToken: 'lease-abc', code: 'TIMEOUT' });
  });

  it('kills codex when stdout exceeds the size cap and reports CODEX_FAILED', async () => {
    const spawn = makeSpawn({ exec: async (child) => { await child.waitForStdin(); child.stdout.write('x'.repeat(2048)); } });
    const fetch = makeFetch({ claim: claimJob() });
    const { code } = await run({ spawn, fetch, limits: { ...FAST_LIMITS, stdoutMaxBytes: 1024 } });
    expect(code).toBe(EXIT.jobFailed);
    expect(spawn.execCalls()[0].child.killSignals).toContain('SIGTERM');
    expect(fetch.calls[1].body.code).toBe('CODEX_FAILED');
  });

  it('sends heartbeats while codex runs and aborts on 409 without sending complete or fail', async () => {
    let release: () => void = () => undefined;
    const spawn = makeSpawn({ exec: async (child) => { await child.waitForStdin(); await new Promise<void>((resolve) => { release = resolve; }); child.finish(0); } });
    const fetch = makeFetch({ claim: claimJob(), heartbeat: (_body, call) => (call >= 2 ? jsonResponse({ error: 'lease lost' }, 409) : jsonResponse({ ok: true })) });
    const runP = run({ spawn, fetch, limits: { ...FAST_LIMITS, heartbeatIntervalMs: 15 } });
    await vi.waitFor(() => expect(fetch.actions().filter((a) => a === 'heartbeat').length).toBeGreaterThanOrEqual(2));
    await vi.waitFor(() => expect(spawn.execCalls()[0].child.killSignals).toContain('SIGTERM'));
    release();
    const { code } = await runP;
    expect(code).toBe(EXIT.jobFailed);
    expect(fetch.calls[1].body).toEqual({ action: 'heartbeat', jobId: 'job-1', leaseToken: 'lease-abc' });
    expect(fetch.actions()).not.toContain('complete');
    expect(fetch.actions()).not.toContain('fail');
  });

  it('treats a heartbeat without ok:true as a transient warning, not a lease loss', async () => {
    let release: () => void = () => undefined;
    const spawn = makeSpawn({ exec: async (child, args) => { await child.waitForStdin(); await new Promise<void>((resolve) => { release = resolve; }); await execSuccess(VALID_RESULT)(child, args); } });
    const fetch = makeFetch({ claim: claimJob(), heartbeat: () => jsonResponse({}) });
    const runP = run({ spawn, fetch, limits: { ...FAST_LIMITS, heartbeatIntervalMs: 15 } });
    await vi.waitFor(() => expect(fetch.actions().filter((a) => a === 'heartbeat').length).toBeGreaterThanOrEqual(2));
    release();
    const { code, entries } = await runP;
    expect(code).toBe(EXIT.ok);
    expect(entries.some((e) => e.message === 'heartbeat failed' && e.fields.kind === 'bad_response')).toBe(true);
    expect(fetch.actions().at(-1)).toBe('complete');
  });

  it('resends the identical complete payload on network loss or missing ok, never re-runs codex, never sends fail', async () => {
    for (const responder of [() => new TypeError('fetch failed'), () => jsonResponse({ ok: false })] as Responder[]) {
      await fs.rm(`${tokenFile}.state`, { recursive: true, force: true });
      const spawn = makeSpawn({ exec: execSuccess(VALID_RESULT) });
      const fetch = makeFetch({ claim: claimJob(), complete: responder });
      const { code, entries } = await run({ spawn, fetch });
      expect(code).toBe(EXIT.deliveryUncertain);
      expect(spawn.execCalls()).toHaveLength(1);
      const completes = fetch.calls.filter((c) => c.body.action === 'complete');
      expect(completes).toHaveLength(FAST_LIMITS.completeAttempts);
      expect(new Set(completes.map((c) => String(c.init.body))).size).toBe(1);
      expect(fetch.actions()).not.toContain('fail');
      const kept = entries.find((e) => e.message.includes('work directory kept'));
      expect(kept).toBeDefined();
      await expect(fs.readFile(path.join(String(kept?.fields.workDir), 'undelivered-result.json'), 'utf8')).resolves.toContain('"schemaVersion": 1');
    }
  });

  it('delivers on the second attempt after a transient 503 and omits usage when codex reported none', async () => {
    const spawn = makeSpawn({ exec: execSuccess(VALID_RESULT, { usage: null }) });
    const fetch = makeFetch({ claim: claimJob(), complete: (_body, call) => (call === 1 ? jsonResponse({ error: 'busy' }, 503) : jsonResponse({ ok: true })) });
    const { code } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.ok);
    expect(fetch.actions()).toEqual(['claim', 'complete', 'complete']);
    expect(fetch.calls[1].body.usage).toBeUndefined();
  });

  it('sends fail exactly once even when its response is lost', async () => {
    const spawn = makeSpawn({ exec: execSuccess({ ...VALID_RESULT, summary: '' }) });
    const fetch = makeFetch({ claim: claimJob(), fail: () => new TypeError('fetch failed') });
    const { code } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.deliveryUncertain);
    expect(failCalls(fetch)).toHaveLength(1);
  });

  it('does not resend complete after 401/409 and does not follow redirects', async () => {
    for (const status of [401, 409]) {
      await fs.rm(`${tokenFile}.state`, { recursive: true, force: true });
      const spawn = makeSpawn({ exec: execSuccess(VALID_RESULT) });
      const fetch = makeFetch({ claim: claimJob(), complete: () => jsonResponse({}, status) });
      const { code } = await run({ spawn, fetch });
      expect(code).toBe(EXIT.deliveryUncertain);
      expect(fetch.actions()).toEqual(['claim', 'complete']);
    }
    await fs.rm(`${tokenFile}.state`, { recursive: true, force: true });
    const opaque = { type: 'opaqueredirect', status: 0, ok: false, body: null, text: async () => '' } as unknown as Response;
    for (const redirect of [() => new Response(null, { status: 302, headers: { location: 'https://evil.example/login' } }), () => opaque]) {
      const spawn = makeSpawn({});
      const fetch = makeFetch({ claim: redirect });
      const { code, entries } = await run({ spawn, fetch });
      expect(code).toBe(EXIT.jobFailed);
      expect(entries.some((e) => e.message === 'claim failed' && e.fields.kind === 'redirect')).toBe(true);
      expect(JSON.stringify(entries)).not.toContain('evil.example');
    }
  });

  it('fails the job without running codex when the snapshot violates the contract', async () => {
    const spawn = makeSpawn({ exec: execSuccess(VALID_RESULT) });
    const fetch = makeFetch({ claim: claimJob({ ...SNAPSHOT, rulesVersion: 'briefing-v2' }) });
    const { code } = await run({ spawn, fetch });
    expect(code).toBe(EXIT.jobFailed);
    expect(spawn.execCalls()).toHaveLength(0);
    expect(fetch.calls[1].body).toEqual({ action: 'fail', jobId: 'job-1', leaseToken: 'lease-abc', code: 'CODEX_FAILED' });
  });

  it('rejects oversized or shapeless server responses without crashing', async () => {
    const big = await run({ spawn: makeSpawn({}), fetch: makeFetch({ claim: () => jsonResponse({ job: null, pad: 'x'.repeat(300 * 1024) }) }) });
    expect(big.code).toBe(EXIT.jobFailed);
    expect(big.entries.some((e) => e.fields.kind === 'bad_response')).toBe(true);
    const shapeless = await run({ spawn: makeSpawn({}), fetch: makeFetch({ claim: () => jsonResponse({ ok: true }) }) });
    expect(shapeless.code).toBe(EXIT.jobFailed);
    expect(shapeless.entries.some((e) => e.message === 'claim failed' && e.fields.kind === 'bad_response')).toBe(true);
  });
});
