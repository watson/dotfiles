import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createMcpManager, readMcpManifest} from './mcp.mjs';

const manifest = readMcpManifest();

// Simulates both CLIs: Claude writes user-scoped servers to .claude.json and
// refuses duplicates; Codex overwrites silently and logs in after saving.
function fixture(t, {claudeLogin = 0, codexLogin = 0, missing = [], env = {}} = {}) {
  const homeDir = fs.mkdtempSync(path.join(tmpdir(), 'dotfiles-mcp-'));
  t.after(() => fs.rmSync(homeDir, {recursive: true, force: true}));
  const claudeConfig = path.join(env.CLAUDE_CONFIG_DIR ?? homeDir, '.claude.json');
  const codex = {};
  const calls = [];
  const readClaude = () => fs.existsSync(claudeConfig) ? JSON.parse(fs.readFileSync(claudeConfig, 'utf8')) : {};
  const writeClaude = value => fs.writeFileSync(claudeConfig, JSON.stringify(value));
  const execute = (command, args, options) => {
    calls.push([command, ...args]);
    if (missing.includes(command)) throw Object.assign(new Error(`spawnSync ${command} ENOENT`), {code: 'ENOENT'});
    assert.equal(options.cwd, homeDir);
    assert.ok(options.env.PATH.split(path.delimiter).includes(path.join(homeDir, '.local', 'bin')));
    if (command === 'claude' && args[0] === '--version') return {status: 0, stdout: '2.1.308 (Claude Code)\n'};
    if (command === 'claude' && args[1] === 'add') {
      assert.deepEqual(args.slice(0, 6), ['mcp', 'add', '--scope', 'user', '--transport', 'http']);
      const config = readClaude();
      config.mcpServers ??= {};
      if (config.mcpServers[args[6]]) return {status: 1, stderr: `MCP server ${args[6]} already exists in user config`};
      config.mcpServers[args[6]] = {type: 'http', url: args[7]};
      writeClaude(config);
      return {status: 0, stdout: ''};
    }
    if (command === 'claude' && args[1] === 'login') {
      assert.equal(options.stdio, 'inherit');
      return {status: claudeLogin};
    }
    if (command === 'codex' && args[1] === 'get') {
      assert.equal(args[3], '--json');
      const server = codex[args[2]];
      return server ? {status: 0, stdout: JSON.stringify(server)} :
        {status: 1, stderr: `Error: No MCP server named '${args[2]}' found.\n`};
    }
    if (command === 'codex' && args[1] === 'add') {
      assert.equal(args[3], '--url');
      assert.equal(options.stdio, 'inherit');
      codex[args[2]] = {name: args[2], enabled: true, transport: {type: 'streamable_http', url: args[4]}};
      return {status: codexLogin};
    }
    assert.fail(`unexpected call: ${command} ${args.join(' ')}`);
  };
  const messages = [];
  const options = {homeDir, manifest, execute, env, output: message => messages.push(message)};
  return {homeDir, claudeConfig, codex, calls, messages, readClaude, writeClaude, options,
    manager: createMcpManager(options)};
}

const changes = calls => calls.filter(call => ['add', 'login'].includes(call[2]));

test('fresh install adds every server to both agents at user scope, logs in, and repeats as a no-op', t => {
  const f = fixture(t);
  assert.equal(f.manager.status(), false);
  f.manager.install();
  assert.deepEqual(changes(f.calls), [
    ['claude', 'mcp', 'add', '--scope', 'user', '--transport', 'http', 'simplycom', 'https://mcp.simply.com/v2'],
    ['claude', 'mcp', 'login', 'simplycom'],
    ['codex', 'mcp', 'add', 'simplycom', '--url', 'https://mcp.simply.com/v2'],
  ]);
  assert.deepEqual(f.readClaude().mcpServers.simplycom, {type: 'http', url: 'https://mcp.simply.com/v2'});
  assert.equal(f.manager.status(), true);
  f.calls.length = 0;
  f.manager.install();
  assert.deepEqual(changes(f.calls), []);
});

test('matching existing configuration is adopted and unrelated servers and settings are preserved', t => {
  const f = fixture(t);
  f.writeClaude({theme: 'dark', mcpServers: {other: {type: 'stdio', command: 'x'},
    simplycom: {type: 'http', url: 'https://mcp.simply.com/v2'}}});
  f.manager.install();
  assert.deepEqual(changes(f.calls).map(call => call.slice(0, 3)), [['codex', 'mcp', 'add']]);
  const config = f.readClaude();
  assert.equal(config.theme, 'dark');
  assert.deepEqual(config.mcpServers.other, {type: 'stdio', command: 'x'});
});

test('a conflicting entry in either agent aborts before any change and is preserved', t => {
  const f = fixture(t);
  f.codex.simplycom = {name: 'simplycom', transport: {type: 'streamable_http', url: 'https://example.com/mcp'}};
  assert.equal(f.manager.status(), false);
  assert.ok(f.messages.includes('simplycom (Codex): CONFLICT: configured with a different transport or URL'));
  assert.throws(() => f.manager.install(), /simplycom \(Codex\).*codex mcp get simplycom/);
  assert.deepEqual(changes(f.calls), []);
  assert.equal(f.codex.simplycom.transport.url, 'https://example.com/mcp');
  assert.equal(fs.existsSync(f.claudeConfig), false);

  const g = fixture(t);
  g.writeClaude({mcpServers: {simplycom: {type: 'sse', url: 'https://mcp.simply.com/v2'}}});
  assert.throws(() => g.manager.install(), /simplycom \(Claude Code\)/);
  assert.deepEqual(changes(g.calls), []);
});

test('unfinished logins are reported as warnings after the servers are verified', t => {
  const f = fixture(t, {claudeLogin: 1, codexLogin: 1});
  f.manager.install();
  assert.equal(f.manager.status(), true);
  assert.ok(f.messages.includes('Claude Code did not finish logging in to simplycom. Run: claude mcp login simplycom'));
  assert.ok(f.messages.includes('Codex did not finish logging in to simplycom. Run: codex mcp login simplycom'));
});

test('a failed Codex add that saved nothing is an error', t => {
  const f = fixture(t);
  const manager = createMcpManager({...f.options, execute: (command, args, options) =>
    command === 'codex' && args[1] === 'add' ? {status: 1} : f.options.execute(command, args, options)});
  assert.throws(() => manager.install(), /codex mcp add simplycom failed/);
});

test('a missing CLI fails clearly before any change', t => {
  for (const missing of ['claude', 'codex']) {
    const f = fixture(t, {missing: [missing]});
    assert.throws(() => f.manager.install(), new RegExp(`${missing} was not found on PATH or in ~/.local/bin`));
    assert.deepEqual(changes(f.calls), []);
  }
});

test('CLAUDE_CONFIG_DIR is read the same way Claude Code writes it', t => {
  const configDir = fs.mkdtempSync(path.join(tmpdir(), 'dotfiles-mcp-claude-'));
  t.after(() => fs.rmSync(configDir, {recursive: true, force: true}));
  const f = fixture(t, {env: {CLAUDE_CONFIG_DIR: configDir}});
  f.writeClaude({mcpServers: {simplycom: {type: 'http', url: 'https://mcp.simply.com/v2'}}});
  f.manager.install();
  assert.deepEqual(changes(f.calls).map(call => call.slice(0, 3)), [['codex', 'mcp', 'add']]);
  assert.equal(fs.existsSync(path.join(f.homeDir, '.claude.json')), false);
});

test('the manifest rejects credentials, non-HTTPS URLs, invalid names and duplicates', t => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'dotfiles-mcp-manifest-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const server = {name: 'example', url: 'https://example.com/mcp', oauth: true};
  for (const servers of [[{...server, headers: {Authorization: 'Bearer x'}}], [{...server, url: 'http://example.com/mcp'}],
    [{...server, name: 'bad name'}], [server, server], [{...server, oauth: 'yes'}], []]) {
    const filename = path.join(dir, 'mcp.json');
    fs.writeFileSync(filename, JSON.stringify({version: 1, servers}));
    assert.throws(() => readMcpManifest(filename), /Invalid/);
  }
});
