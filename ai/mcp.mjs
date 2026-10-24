import * as fs from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));

export function readMcpManifest(filename = path.join(directory, 'mcp.json')) {
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.servers) || !manifest.servers.length) {
    throw new Error('Invalid MCP manifest version or servers.');
  }
  const names = new Set();
  for (const server of manifest.servers) {
    let url;
    try { url = new URL(server.url); } catch {}
    // Only names, URLs and an auth flag belong here: this repo is public, so
    // headers, tokens and other credentials are deliberately unsupported.
    if (!/^[A-Za-z0-9_-]+$/.test(server.name) || names.has(server.name) || url?.protocol !== 'https:' ||
        typeof server.oauth !== 'boolean' || Object.keys(server).some(key => !['name', 'url', 'oauth'].includes(key))) {
      throw new Error(`Invalid or duplicate MCP server: ${server.name}`);
    }
    names.add(server.name);
  }
  return manifest;
}

export function createMcpManager({homeDir = homedir(), manifest = readMcpManifest(),
  execute, env = process.env, output = console.log} = {}) {
  // Claude Code keeps user-scoped servers in .claude.json, next to (not inside) ~/.claude by default.
  const claudeConfig = path.join(env.CLAUDE_CONFIG_DIR ? path.resolve(env.CLAUDE_CONFIG_DIR) : homeDir, '.claude.json');
  // Both native installers use ~/.local/bin, which may not be on PATH yet during a first install.
  const cliEnv = {...env, PATH: [env.PATH, path.join(homeDir, '.local', 'bin')].filter(Boolean).join(path.delimiter)};

  function cli(command, args, options) {
    try {
      return execute(command, args, {cwd: homeDir, env: cliEnv, ...options});
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`${command} was not found on PATH or in ~/.local/bin. Install it, then rerun.`);
      throw error;
    }
  }

  function codexServer(name) {
    const result = cli('codex', ['mcp', 'get', name, '--json']);
    if (result.status === 0) return JSON.parse(result.stdout);
    if (/No MCP server named/.test(result.stderr)) return null;
    throw new Error(`codex mcp get ${name} failed:\n${result.stderr || result.stdout}`);
  }

  function inspect() {
    const version = cli('claude', ['--version']);
    if (version.status !== 0) throw new Error(`claude --version failed:\n${version.stderr || version.stdout}`);
    let claude = {};
    if (fs.existsSync(claudeConfig)) claude = JSON.parse(fs.readFileSync(claudeConfig, 'utf8')).mcpServers ?? {};
    return manifest.servers.flatMap(server => {
      const claudeEntry = claude[server.name];
      const codexEntry = codexServer(server.name);
      return [
        {...server, agent: 'claude', label: 'Claude Code', configured: !!claudeEntry,
          conflict: !!claudeEntry && (claudeEntry.type !== 'http' || claudeEntry.url !== server.url)},
        {...server, agent: 'codex', label: 'Codex', configured: !!codexEntry,
          conflict: !!codexEntry && (codexEntry.transport?.type !== 'streamable_http' || codexEntry.transport.url !== server.url)},
      ];
    });
  }

  function status() {
    const rows = inspect();
    for (const row of rows) {
      const state = row.conflict ? 'CONFLICT: configured with a different transport or URL' :
        row.configured ? 'OK' : 'MISSING';
      output(`${row.name} (${row.label}): ${state}`);
    }
    return rows.every(row => row.configured && !row.conflict);
  }

  function install() {
    // Check every server in both agents before changing any of them.
    const rows = inspect();
    const conflicts = rows.filter(row => row.conflict);
    if (conflicts.length) {
      throw new Error(conflicts.map(row => `${row.name} (${row.label}): configured with a different transport or URL. ` +
        `Inspect it with \`${row.agent} mcp get ${row.name}\` and remove it yourself before rerunning.`).join('\n'));
    }
    const warnings = [];
    for (const row of rows.filter(row => !row.configured)) {
      output(`Adding ${row.name} to ${row.label}`);
      if (row.agent === 'claude') {
        const result = cli('claude', ['mcp', 'add', '--scope', 'user', '--transport', 'http', row.name, row.url]);
        if (result.status !== 0) throw new Error(`claude mcp add ${row.name} failed:\n${result.stderr || result.stdout}`);
        if (row.oauth && cli('claude', ['mcp', 'login', row.name], {stdio: 'inherit'}).status !== 0) {
          warnings.push(`Claude Code did not finish logging in to ${row.name}. Run: claude mcp login ${row.name}`);
        }
      } else {
        // Codex saves the server first and then starts its own OAuth login when the
        // server supports it, so give it the terminal and judge by the saved config.
        if (cli('codex', ['mcp', 'add', row.name, '--url', row.url], {stdio: 'inherit'}).status !== 0) {
          if (!codexServer(row.name)) throw new Error(`codex mcp add ${row.name} failed.`);
          warnings.push(`Codex did not finish logging in to ${row.name}. Run: codex mcp login ${row.name}`);
        }
      }
    }
    if (!status()) throw new Error('MCP server verification failed.');
    for (const warning of warnings) output(warning);
  }

  return {inspect, status, install};
}

export function mcp(args, options) {
  const [action, ...rest] = args;
  if (!['install', 'status'].includes(action) || rest.length) throw new Error('Usage: ai/run.sh mcp install | status');
  const manager = createMcpManager(options);
  if (action === 'status') process.exitCode = manager.status() ? 0 : 1;
  else manager.install();
}
