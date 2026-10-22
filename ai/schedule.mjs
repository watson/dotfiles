import * as fs from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';

const label = 'com.watson.skills-update';
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');

export function renderPlist(directory, homeDir) {
  return fs.readFileSync(path.join(directory, 'macos', 'skills-update.plist.template'), 'utf8')
    .replace('@RUNNER@', xml(path.join(directory, 'run.sh')))
    .replace('@LOG@', xml(path.join(homeDir, 'Library', 'Logs', 'selected-skills-update.log')));
}

export function schedule(args, {directory, execute, homeDir = homedir(),
  platform = process.platform, uid = process.getuid?.(), output = console.log} = {}) {
  if (platform !== 'darwin') throw new Error('The optional schedule requires macOS launchd.');
  const [action, ...flags] = args;
  if (!['install', 'status', 'remove'].includes(action) ||
      (flags.length && (action !== 'install' || flags.join() !== '--replace'))) {
    throw new Error('Usage: ai/run.sh schedule install [--replace] | status | remove');
  }
  const domain = `gui/${uid}`;
  const target = `${domain}/${label}`;
  const plist = path.join(homeDir, 'Library', 'LaunchAgents', `${label}.plist`);
  const call = (command, argv) => {
    const result = execute(command, argv);
    if (result.status !== 0) throw new Error(`${command} ${argv.join(' ')} failed: ${result.stderr || result.stdout}`);
    return result.stdout;
  };
  const state = execute('/bin/launchctl', ['print', target]);
  const loaded = state.status === 0;
  if (!loaded && !/Could not find service/.test(state.stderr || state.stdout || '')) {
    throw new Error(`Cannot inspect launchd job: ${state.stderr || state.stdout}`);
  }
  if (action === 'status') {
    output(loaded ? state.stdout : 'Selected skill updater is not loaded.');
    output(`Plist: ${plist}`);
    return;
  }
  let plistStat;
  try { plistStat = fs.lstatSync(plist); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const exists = !!plistStat;
  if (exists) {
    if (!plistStat.isFile()) throw new Error(`Refusing to replace a non-regular plist: ${plist}`);
    if (call('/usr/bin/plutil', ['-extract', 'Label', 'raw', '-o', '-', plist]).trim() !== label) {
      throw new Error(`Refusing to manage a plist with a different label: ${plist}`);
    }
  }
  if (action === 'remove') {
    if (loaded) call('/bin/launchctl', ['bootout', target]);
    if (exists) fs.unlinkSync(plist);
    output('Removed the selected skill update schedule; skills and logs were preserved.');
    return;
  }
  const contents = renderPlist(directory, homeDir);
  const previous = exists ? fs.readFileSync(plist, 'utf8') : null;
  if (previous !== null && previous !== contents && !flags.includes('--replace')) {
    throw new Error('A different updater is already configured. Use schedule install --replace to back it up and migrate it.');
  }
  if (previous === contents && loaded) {
    call('/bin/launchctl', ['enable', target]);
    output('The selected skill update schedule is already installed and loaded.');
    return;
  }
  if (loaded && (previous === null || /state = running/.test(state.stdout))) {
    throw new Error('Cannot replace an updater that is running or has no recoverable plist. Wait for completion and restore its plist first.');
  }
  fs.mkdirSync(path.dirname(plist), {recursive: true});
  fs.mkdirSync(path.join(homeDir, 'Library', 'Logs'), {recursive: true});
  const temporary = `${plist}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporary, contents, {mode: 0o600, flag: 'wx'});
    call('/usr/bin/plutil', ['-lint', temporary]);
    if (previous !== null && previous !== contents) {
      const backup = `${plist}.backup-${Date.now()}`;
      fs.copyFileSync(plist, backup, fs.constants.COPYFILE_EXCL);
      output(`Previous LaunchAgent backed up to ${backup}`);
    }
    if (loaded) call('/bin/launchctl', ['bootout', target]);
    fs.renameSync(temporary, plist);
    try {
      call('/bin/launchctl', ['enable', target]);
      call('/bin/launchctl', ['bootstrap', domain, plist]);
    } catch (error) {
      if (previous !== null) fs.writeFileSync(plist, previous, {mode: 0o600});
      else fs.unlinkSync(plist);
      if (loaded) {
        try { call('/bin/launchctl', ['bootstrap', domain, plist]); } catch (restoreError) {
          throw new Error(`${error.message}\nPrevious plist restored, but reloading it failed: ${restoreError.message}`);
        }
      }
      throw error;
    }
  } finally {
    fs.rmSync(temporary, {force: true});
  }
  output('Scheduled daily updates at 04:00 local time and on job load (including now).');
  output(call('/bin/launchctl', ['print', target]));
}
