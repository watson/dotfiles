import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createManager, readManifest} from './skills.mjs';
import {renderPlist, schedule} from './schedule.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const manifest = readManifest();
const names = manifest.sources.flatMap(source => source.skills.map(skill => skill.name));

function fixture(t) {
  const homeDir = fs.mkdtempSync(path.join(tmpdir(), 'dotfiles-skills-'));
  t.after(() => fs.rmSync(homeDir, {recursive: true, force: true}));
  const lockPath = path.join(homeDir, '.agents', '.skill-lock.json');
  const calls = [];
  const readLock = () => fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) :
    {version: 3, skills: {}};
  const writeLock = value => {
    fs.mkdirSync(path.dirname(lockPath), {recursive: true});
    fs.writeFileSync(lockPath, JSON.stringify(value));
  };
  const execute = (command, args, options) => {
    calls.push({command, args, options});
    assert.equal(command, 'npx');
    assert.deepEqual(args.slice(0, 4), ['--yes', 'skills@1.7.0', 'add', args[3]]);
    assert.deepEqual(args.slice(4, 10), ['--global', '--yes', '--json', '--agent', 'codex', 'claude-code']);
    assert.equal(options.cwd, homeDir);
    assert.equal(options.env.DISABLE_TELEMETRY, '1');
    assert.equal(options.env.DO_NOT_TRACK, '1');
    const source = manifest.sources.find(source => source.repository === args[3]);
    const selectedNames = args.slice(args.indexOf('--skill') + 1);
    const lock = readLock();
    for (const name of selectedNames) {
      const skill = source.skills.find(skill => skill.name === name);
      assert.ok(skill, 'only manifest skills may be installed');
      const dest = path.join(homeDir, '.agents', 'skills', name);
      fs.mkdirSync(dest, {recursive: true});
      fs.writeFileSync(path.join(dest, 'SKILL.md'), `${name} content\n`);
      lock.skills[name] = {source: source.repository, sourceType: 'github',
        sourceUrl: `https://github.com/${source.repository}.git`, skillPath: skill.path,
        skillFolderHash: 'a'.repeat(40)};
    }
    writeLock(lock);
    return {status: 0, stdout: JSON.stringify(selectedNames.map(name => ({name, status: 'installed'})))};
  };
  const options = {homeDir, execute, manifest, env: {}, output: () => {}};
  return {homeDir, lockPath, calls, options, readLock, writeLock, manager: createManager(options)};
}

test('fresh install creates all 15 shared skills and relative Claude links; repeat is offline', t => {
  const f = fixture(t);
  assert.equal(f.manager.status(), false);
  f.manager.install();
  assert.equal(f.calls.length, 4);
  assert.equal(f.manager.status(), true);
  assert.equal(names.length, 15);
  for (const name of names) {
    assert.equal(fs.readlinkSync(path.join(f.homeDir, '.claude', 'skills', name)), `../../.agents/skills/${name}`);
  }
  f.calls.length = 0;
  f.manager.install();
  assert.equal(f.calls.length, 0);
});

test('adopts the existing provenance format and repairs links without replacing skill contents', t => {
  const f = fixture(t);
  f.manager.install();
  const skill = path.join(f.homeDir, '.agents', 'skills', 'pr', 'SKILL.md');
  fs.writeFileSync(skill, 'existing local content');
  fs.unlinkSync(path.join(f.homeDir, '.claude', 'skills', 'pr'));
  f.calls.length = 0;
  f.manager.install();
  assert.equal(f.calls.length, 0);
  assert.equal(fs.readFileSync(skill, 'utf8'), 'existing local content');
  assert.equal(f.manager.status(), true);
});

test('update passes exact names and both agents, preserving unrelated lock entries and synced/project skills', t => {
  const f = fixture(t);
  f.manager.install();
  const lock = f.readLock();
  lock.skills.unrelated = {source: 'someone/else', custom: true};
  lock.dismissed = {findSkillsPrompt: true};
  f.writeLock(lock);
  const protectedFiles = ['.claude/skills/synced/account/SKILL.md', '.agents/skills/unrelated/SKILL.md',
    'project/.agents/skills/private/SKILL.md', '.codex/config.toml'];
  for (const filename of protectedFiles) {
    const full = path.join(f.homeDir, filename);
    fs.mkdirSync(path.dirname(full), {recursive: true});
    fs.writeFileSync(full, 'preserve');
  }
  f.calls.length = 0;
  f.manager.update();
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.calls.flatMap(call => call.args.slice(call.args.indexOf('--skill') + 1)), names);
  assert.deepEqual(f.readLock().skills.unrelated, lock.skills.unrelated);
  assert.deepEqual(f.readLock().dismissed, lock.dismissed);
  for (const filename of protectedFiles) assert.equal(fs.readFileSync(path.join(f.homeDir, filename), 'utf8'), 'preserve');
});

test('a conflict in the last source aborts the whole install before any downloads', t => {
  const f = fixture(t);
  const conflict = path.join(f.homeDir, '.claude', 'skills', 'frontend-design');
  fs.mkdirSync(conflict, {recursive: true});
  fs.writeFileSync(path.join(conflict, 'SKILL.md'), 'foreign');
  assert.throws(() => f.manager.install(), /frontend-design: Claude path/);
  assert.equal(f.calls.length, 0);
  assert.equal(fs.readFileSync(path.join(conflict, 'SKILL.md'), 'utf8'), 'foreign');
});

test('untracked directories and foreign shared symlinks are never adopted or overwritten', t => {
  const f = fixture(t);
  const dir = path.join(f.homeDir, '.agents', 'skills', 'pr');
  fs.mkdirSync(dir, {recursive: true});
  assert.throws(() => f.manager.install(), /untracked/);
  fs.rmdirSync(dir);
  fs.symlinkSync(f.homeDir, dir);
  assert.throws(() => f.manager.install(), /untracked/);
  assert.equal(f.calls.length, 0);
});

test('changed upstream identity is reported and blocks update', t => {
  const f = fixture(t);
  f.manager.install();
  const lock = f.readLock();
  lock.skills.pr.source = 'someone/else';
  f.writeLock(lock);
  f.calls.length = 0;
  assert.equal(f.manager.status(), false);
  assert.throws(() => f.manager.update(), /source\/path\/ref/);
  assert.equal(f.calls.length, 0);
});

test('malformed lockfiles, custom config locations and symlinked parent directories fail closed', t => {
  const f = fixture(t);
  f.writeLock({version: 2, skills: {}});
  assert.throws(() => f.manager.install(), /Unsupported/);
  fs.writeFileSync(f.lockPath, '{');
  assert.throws(() => f.manager.install(), SyntaxError);
  assert.throws(() => createManager({...f.options, env: {XDG_STATE_HOME: '/elsewhere'}}).install(), /unsupported/);
  fs.rmSync(path.dirname(f.lockPath), {recursive: true});
  fs.symlinkSync(f.homeDir, path.dirname(f.lockPath));
  assert.throws(() => f.manager.install(), /real directory/);
  assert.equal(f.calls.length, 0);
});

test('update requires complete installation and refuses missing links', t => {
  const f = fixture(t);
  assert.throws(() => f.manager.update(), /repair/);
  assert.equal(f.calls.length, 0);
  f.manager.install();
  fs.unlinkSync(path.join(f.homeDir, '.claude', 'skills', 'pr'));
  assert.throws(() => f.manager.update(), /repair/);
});

test('zero exit does not hide skipped results, invalid JSON, or absent installation/provenance', t => {
  const f = fixture(t);
  for (const stdout of ['not JSON', '[]', JSON.stringify(manifest.sources[0].skills.map(skill =>
    ({name: skill.name, status: 'installed'})))]) {
    const manager = createManager({...f.options, execute: () => ({status: 0, stdout})});
    assert.throws(() => manager.install(), /invalid JSON|exactly|verification/);
    assert.equal(fs.existsSync(path.join(f.homeDir, '.agents', '.dotfiles-skills.lock')), false);
  }
});

test('a concurrent or stale lock is preserved; failed CLI calls release our own lock', t => {
  const f = fixture(t);
  const mutex = path.join(f.homeDir, '.agents', '.dotfiles-skills.lock');
  fs.mkdirSync(mutex, {recursive: true});
  assert.throws(() => f.manager.install(), /Another install/);
  assert.equal(fs.existsSync(mutex), true);
  fs.rmdirSync(mutex);
  const manager = createManager({...f.options, execute: () => ({status: 1, stderr: 'network failure'})});
  assert.throws(() => manager.install(), /network failure/);
  assert.equal(fs.existsSync(mutex), false);
});

function scheduleFixture(t, {loaded = false, failBootstrap = false} = {}) {
  const f = fixture(t);
  const calls = [];
  const plist = path.join(f.homeDir, 'Library', 'LaunchAgents', 'com.watson.skills-update.plist');
  const execute = (command, args) => {
    calls.push([command, ...args]);
    if (command.endsWith('plutil')) return {status: 0, stdout: args[0] === '-extract' ? 'com.watson.skills-update\n' : 'OK'};
    if (args[0] === 'print') return loaded ? {status: 0, stdout: 'state = not running'} :
      {status: 113, stderr: 'Could not find service "com.watson.skills-update"'};
    if (args[0] === 'bootout') loaded = false;
    if (args[0] === 'bootstrap') {
      if (failBootstrap) { failBootstrap = false; return {status: 5, stderr: 'load failure'}; }
      loaded = true;
    }
    return {status: 0, stdout: ''};
  };
  const invoke = args => schedule(args, {homeDir: f.homeDir, directory, execute,
    platform: 'darwin', uid: 123, output: () => {}});
  return {...f, plist, calls, invoke};
}

test('schedule is opt-in, uses the persistent launcher, and is idempotent', t => {
  const f = scheduleFixture(t);
  assert.equal(fs.existsSync(f.plist), false);
  f.invoke(['install']);
  const text = fs.readFileSync(f.plist, 'utf8');
  assert.match(text, /<integer>4<\/integer>/);
  assert.match(text, /<key>RunAtLoad<\/key><true\/>/);
  assert.ok(text.includes(path.join(directory, 'run.sh')));
  assert.ok(!text.includes(process.execPath));
  f.calls.length = 0;
  f.invoke(['install']);
  assert.equal(f.calls.filter(call => call.includes('bootstrap') || call.includes('bootout')).length, 0);
  assert.ok(f.calls.some(call => call[1] === 'enable'));
  f.invoke(['remove']);
  assert.equal(fs.existsSync(f.plist), false);
  assert.ok(f.calls.some(call => call[1] === 'bootout' && call[2] === 'gui/123/com.watson.skills-update'));
});

test('migration requires --replace, backs up the old plist and reuses the same job label', t => {
  const f = scheduleFixture(t, {loaded: true});
  fs.mkdirSync(path.dirname(f.plist), {recursive: true});
  fs.writeFileSync(f.plist, 'legacy plist');
  assert.throws(() => f.invoke(['install']), /--replace/);
  assert.equal(fs.readFileSync(f.plist, 'utf8'), 'legacy plist');
  assert.equal(f.calls.some(call => call.includes('bootout')), false);
  f.invoke(['install', '--replace']);
  const backup = fs.readdirSync(path.dirname(f.plist)).find(name => name.includes('.backup-'));
  assert.equal(fs.readFileSync(path.join(path.dirname(f.plist), backup), 'utf8'), 'legacy plist');
  assert.equal(f.calls.filter(call => call[1] === 'bootout').length, 1);
  assert.ok(f.calls.some(call => call[1] === 'bootstrap' && call[2] === 'gui/123' && call[3] === f.plist));
});

test('a failed replacement restores the previous plist and reloads the old job', t => {
  const f = scheduleFixture(t, {loaded: true, failBootstrap: true});
  fs.mkdirSync(path.dirname(f.plist), {recursive: true});
  fs.writeFileSync(f.plist, 'legacy plist');
  assert.throws(() => f.invoke(['install', '--replace']), /load failure/);
  assert.equal(fs.readFileSync(f.plist, 'utf8'), 'legacy plist');
  assert.equal(f.calls.filter(call => call[1] === 'bootstrap').length, 2);
});

test('plist values are XML escaped and unsupported platforms never invoke launchd', () => {
  const text = renderPlist(directory, '/tmp/user & <example>');
  assert.match(text, /user &amp; &lt;example&gt;/);
  assert.throws(() => schedule(['install'], {platform: 'linux', execute: () => assert.fail('must not run')}), /requires macOS/);
});

test('a dangling plist symlink is preserved and a loaded job without a plist is not replaced', t => {
  const f = scheduleFixture(t);
  fs.mkdirSync(path.dirname(f.plist), {recursive: true});
  fs.symlinkSync(path.join(f.homeDir, 'missing'), f.plist);
  assert.throws(() => f.invoke(['install', '--replace']), /non-regular/);
  assert.ok(fs.lstatSync(f.plist).isSymbolicLink());
  const orphan = scheduleFixture(t, {loaded: true});
  assert.throws(() => orphan.invoke(['install']), /no recoverable plist/);
  assert.equal(orphan.calls.some(call => call.includes('bootout')), false);
});
