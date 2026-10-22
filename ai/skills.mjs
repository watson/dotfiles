import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {schedule} from './schedule.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));

export function readManifest(filename = path.join(directory, 'skills.json')) {
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (manifest.version !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.cliVersion) ||
      JSON.stringify(manifest.agents) !== '["codex","claude-code"]' ||
      !Array.isArray(manifest.sources) || !manifest.sources.length) {
    throw new Error('Invalid skills manifest version, CLI version, sources, or agents.');
  }
  const names = new Set();
  for (const source of manifest.sources) {
    if (!/^[\w][\w.-]*\/[\w][\w.-]*$/.test(source.repository) || !source.skills?.length) {
      throw new Error('Each source must name a GitHub repository and explicit skills.');
    }
    for (const skill of source.skills) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.name) || names.has(skill.name) ||
          !/^([\w.-]+\/)+SKILL\.md$/.test(skill.path) || skill.path.split('/').includes('..')) {
        throw new Error(`Invalid or duplicate skill: ${skill.name}`);
      }
      names.add(skill.name);
    }
  }
  return manifest;
}

function stat(filename) {
  try { return fs.lstatSync(filename); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  if (result.error) throw result.error;
  return result;
}

export function createManager({homeDir = homedir(), manifest = readManifest(),
  execute = run, env = process.env, output = console.log} = {}) {
  const agentsDir = path.join(homeDir, '.agents');
  const sharedDir = path.join(agentsDir, 'skills');
  const claudeDir = path.join(homeDir, '.claude', 'skills');
  const lockFile = path.join(agentsDir, '.skill-lock.json');
  const selected = manifest.sources.flatMap(source => source.skills.map(skill =>
    ({...skill, repository: source.repository})));

  function inspect() {
    if ((env.CLAUDE_CONFIG_DIR && path.resolve(env.CLAUDE_CONFIG_DIR) !== path.join(homeDir, '.claude')) ||
        env.XDG_STATE_HOME) {
      throw new Error('This setup uses ~/.claude and ~/.agents; custom CLAUDE_CONFIG_DIR or XDG_STATE_HOME is unsupported.');
    }
    for (const dir of [agentsDir, sharedDir, path.dirname(claudeDir), claudeDir]) {
      const entry = stat(dir);
      if (entry && !entry.isDirectory()) throw new Error(`Expected a real directory, not a file or symlink: ${dir}`);
    }
    const lockStat = stat(lockFile);
    if (lockStat && !lockStat.isFile()) throw new Error(`Expected a regular lockfile: ${lockFile}`);
    const lock = lockStat ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : {version: 3, skills: {}};
    if (lock.version !== 3 || !lock.skills || typeof lock.skills !== 'object' || Array.isArray(lock.skills)) {
      throw new Error('Unsupported skills CLI lockfile. Refusing to overwrite it.');
    }
    return selected.map(skill => {
      const target = path.join(sharedDir, skill.name);
      const link = path.join(claudeDir, skill.name);
      const entry = lock.skills[skill.name];
      const targetStat = stat(target);
      const linkStat = stat(link);
      let conflict;
      if (entry && (entry.source !== skill.repository || entry.sourceType !== 'github' ||
          entry.skillPath !== skill.path || entry.ref ||
          entry.sourceUrl !== `https://github.com/${skill.repository}.git`)) {
        conflict = 'installed source/path/ref differs from the manifest';
      } else if (targetStat && (!targetStat.isDirectory() || !entry)) {
        conflict = 'shared path is untracked or is not a real directory';
      } else if (linkStat && (!linkStat.isSymbolicLink() ||
          path.resolve(path.dirname(link), fs.readlinkSync(link)) !== target)) {
        conflict = 'Claude path is not the expected shared-skill symlink';
      }
      const skillFile = targetStat?.isDirectory() ? stat(path.join(target, 'SKILL.md')) : null;
      const installed = !!(targetStat?.isDirectory() && skillFile?.isFile() && entry?.skillFolderHash);
      return {...skill, target, link, conflict, installed, linked: !!linkStat && !conflict,
        hash: entry?.skillFolderHash, updatedAt: entry?.updatedAt};
    });
  }

  function requireSafe(rows) {
    const conflicts = rows.filter(row => row.conflict);
    if (conflicts.length) throw new Error(conflicts.map(row => `${row.name}: ${row.conflict}`).join('\n'));
  }

  function status() {
    const rows = inspect();
    for (const row of rows) {
      const state = row.conflict ? `CONFLICT: ${row.conflict}` :
        !row.installed ? 'MISSING installation/provenance' : !row.linked ? 'MISSING Claude link' : 'OK';
      output(`${row.name}: ${state}${row.hash ? ` (${row.hash.slice(0, 12)})` : ''}`);
    }
    return rows.every(row => row.installed && row.linked && !row.conflict);
  }

  function apply(update = false) {
    // Check the entire selection before changing any skill, even on a partial install.
    requireSafe(inspect());
    fs.mkdirSync(agentsDir, {recursive: true});
    const mutex = path.join(agentsDir, '.dotfiles-skills.lock');
    try { fs.mkdirSync(mutex, {mode: 0o700}); } catch (error) {
      if (error.code === 'EEXIST') throw new Error(`Another install/update may be running. Check before removing stale lock: ${mutex}`);
      throw error;
    }
    try {
      fs.writeFileSync(path.join(mutex, 'pid'), `${process.pid}\n`);
      const rows = inspect();
      requireSafe(rows);
      if (update && rows.some(row => !row.installed || !row.linked)) {
        throw new Error('Run ai/run.sh install to repair missing skills/links before updating.');
      }
      for (const source of manifest.sources) {
        const wanted = rows.filter(row => row.repository === source.repository && (update || !row.installed));
        if (!wanted.length) continue;
        output(`${update ? 'Updating' : 'Installing'} ${wanted.map(row => row.name).join(', ')} from ${source.repository}`);
        // Re-add only the selected skills: `skills update` auto-detects agents in
        // its child installs and cannot accept an explicit agent selection.
        const result = execute('npx', ['--yes', `skills@${manifest.cliVersion}`, 'add', source.repository,
          '--global', '--yes', '--json', '--agent', ...manifest.agents,
          '--skill', ...wanted.map(row => row.name)], {
          cwd: homeDir,
          env: {...env, DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', CI: '1',
            GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1'},
        });
        if (result.status !== 0) throw new Error(`skills CLI failed for ${source.repository}:\n${result.stderr || result.stdout}`);
        let results;
        try { results = JSON.parse(result.stdout); } catch {
          throw new Error(`skills CLI returned invalid JSON for ${source.repository}`);
        }
        if (!Array.isArray(results) || results.length !== wanted.length ||
            results.some(item => item.status !== 'installed') ||
            wanted.some(row => !results.some(item => item.name === row.name))) {
          throw new Error(`skills CLI did not install exactly the requested skills from ${source.repository}`);
        }
        const after = inspect();
        requireSafe(after);
        if (wanted.some(row => !after.find(item => item.name === row.name)?.installed)) {
          throw new Error(`Installation/provenance verification failed for ${source.repository}`);
        }
      }
      fs.mkdirSync(claudeDir, {recursive: true});
      const after = inspect();
      requireSafe(after);
      for (const row of after) {
        if (!row.installed) throw new Error(`Missing installed skill: ${row.name}`);
        if (!row.linked) fs.symlinkSync(path.relative(claudeDir, row.target), row.link);
      }
      if (!status()) throw new Error('Skill verification failed.');
    } finally {
      fs.rmSync(mutex, {recursive: true, force: true});
    }
  }
  return {inspect, status, install: () => apply(false), update: () => apply(true)};
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 20)) {
    throw new Error('skills@1.7.0 requires Node.js 22.20.0 or newer. Upgrade Node or the nvm default.');
  }
  const [command, ...args] = process.argv.slice(2);
  if (command === 'schedule') {
    if (args[0] === 'install' && !createManager().status()) {
      throw new Error('Run ai/run.sh install before enabling scheduled updates.');
    }
    return schedule(args, {directory, execute: run});
  }
  if (!['install', 'status', 'update'].includes(command) ||
      args.some(arg => arg !== '--log') || (args.length && command !== 'update')) {
    throw new Error('Usage: ai/run.sh install | status | update [--log] | schedule install [--replace] | schedule status | schedule remove');
  }
  let log;
  if (args.includes('--log')) {
    const logDir = path.join(homedir(), 'Library', 'Logs');
    fs.mkdirSync(logDir, {recursive: true});
    log = fs.openSync(path.join(logDir, 'selected-skills-update.log'), 'a', 0o600);
  }
  const output = message => {
    console.log(message);
    if (log !== undefined) fs.writeSync(log, `${message}\n`);
  };
  try {
    if (log !== undefined) output(`[${new Date().toISOString()}] Starting selected skill update`);
    const manager = createManager({output});
    if (command === 'status') process.exitCode = manager.status() ? 0 : 1;
    else manager[command]();
    if (log !== undefined) output(`[${new Date().toISOString()}] Finished selected skill update; exit=0`);
  } catch (error) {
    if (log !== undefined) output(`[${new Date().toISOString()}] Finished selected skill update; exit=1\n${error.message}`);
    throw error;
  } finally {
    if (log !== undefined) fs.closeSync(log);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
