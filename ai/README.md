# Shared AI skills

`skills.json` is the source of truth for 15 user-level skills shared by Codex
and Claude Code. It records their upstream repositories, skill paths, target
agents, and the pinned installer version (`skills@1.7.0`).

This manages standalone skills only. Plugins, account-synced skills, project
skills, MCP connections, credentials, and the agents' settings are outside its
scope. It does not install the Matt Pocock plugin or execute any skill workflow.

## Selection

| Repository | Skills |
| --- | --- |
| `mattpocock/skills` | `code-review`, `codebase-design`, `domain-modeling`, `grill-me`, `grilling`, `improve-codebase-architecture`, `pr`, `retro`, `setup-matt-pocock-skills`, `triage`, `wizard`, `writing-for-agents` |
| `upstash/context7` | `find-docs` |
| `vercel-labs/skills` | `find-skills` |
| `anthropics/skills` | `frontend-design` |

## Install and inspect

Requires Git and Node.js 22.20.0 or newer with npm/npx. The launcher uses Node on `PATH`, the
standard Homebrew locations, or nvm's installed default version. It does not
source your shell profiles or embed a username or a particular Node version.

```sh
~/dotfiles/ai/run.sh status    # offline; exit 1 for missing/conflicting skills
~/dotfiles/ai/run.sh install   # installs missing skills and repairs missing links
~/dotfiles/ai/run.sh update    # refreshes the entire selected set from upstream
```

Codex reads `~/.agents/skills/`. Claude Code uses relative symlinks in
`~/.claude/skills/` to the same directories. The skills CLI maintains provenance
in `~/.agents/.skill-lock.json`; the live lockfile stays outside this public repo.

Installation is repeatable: existing skills with matching provenance are left
alone, and missing Claude links are recreated without downloading skills again.
Before any download, all selected destinations are checked. Conflicting files,
foreign symlinks, untracked skill folders, unexpected sources/paths/refs, and an
unsupported lockfile cause a failure without overwriting those paths. Investigate
and move conflicting files aside yourself, then rerun `install`.

`update` requires a complete installation. It uses `skills add` with explicit
skill names, agents, global scope, and structured JSON results for each source.
Unlike `skills update` in version 1.7.0, this does not auto-detect the agents for
child installs. Successful exit codes are also checked against returned results,
installed provenance, and filesystem state. Telemetry is disabled with
`DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1` for every CLI invocation.

The scripts support the standard `~/.agents` and `~/.claude` locations. They fail
explicitly for a custom `CLAUDE_CONFIG_DIR` or `XDG_STATE_HOME`, rather than
checking one installation and modifying another. Other tools that also read
`~/.agents/skills` can naturally see these shared skills.

## Update policy and recovery

The selection and installer version are version-controlled; skill content follows
each source's current default branch. This preserves the existing rolling-update
policy. A fresh install recreates the selected skills, **not an exact historical
snapshot** of their contents. Status checks provenance and links offline; it does
not claim that installed content is the newest upstream version or detect local
edits to skill contents. Keep personal skill edits in a separately named skill or
an upstream fork, since `update` replaces managed skill contents.

To add a skill, edit the manifest and run `install`. To change an existing skill's
source/path/ref, resolve its existing installation deliberately first. Removing a
manifest entry stops managing it; it does not uninstall anything. Removing skills
is a separate, explicit operation. No command here removes unrelated skills.

Network errors can leave a partially completed installation/update. The command
exits unsuccessfully; fix the cause, run `status`, and rerun `install` or `update`
as appropriate. Completed sources are not rolled back. Install/update commands
exclude each other using `~/.agents/.dotfiles-skills.lock`. After a hard kill,
check the PID recorded inside it before removing a stale lock. Do not run other
skills installers concurrently, since they do not share this lock.

To recover the latest selected setup on another machine, clone dotfiles, install
Node and Git, run `ai/run.sh install`, then `status`. Restoring an older dotfiles
revision restores its selection, but still fetches current upstream skill content.

## Optional macOS schedule

Run this from a persistent checkout, normally `~/dotfiles`, not a temporary
worktree. The job runs the checkout's scripts and manifest in place, so later
changes to them take effect on the next run. Moving the checkout requires
reinstalling the schedule.

```sh
~/dotfiles/ai/run.sh schedule install
~/dotfiles/ai/run.sh schedule status
~/dotfiles/ai/run.sh schedule remove
```

Installation creates `~/Library/LaunchAgents/com.watson.skills-update.plist`,
loads it, and reads back its launchd state. Updates run at **04:00 local time**
and whenever the job loads, including installation. Nothing is scheduled merely
by cloning dotfiles or installing the skills. Removing the schedule preserves
skills and logs. The general dotfiles uninstaller does not remove this opt-in job;
remove the schedule before deleting or moving the checkout.

Output is recorded in `~/Library/Logs/selected-skills-update.log`. A completed job
normally shows `state = not running`; check `last exit code = 0` and the log's
timestamped `Finished selected skill update; exit=0` entry. A loaded job is not
proof that its latest update succeeded. If Node is removed, the launcher retries
the standard locations and nvm default; an invalid/missing default produces a
visible error in the same log.

### Migrate the existing local updater

The existing `~/Library/Application Support/SkillUpdates/` installation and its
schedule are not changed by this PR or by `install`. After checking out this
change into your persistent dotfiles directory:

```sh
~/dotfiles/ai/run.sh install
~/dotfiles/ai/run.sh status
~/dotfiles/ai/run.sh schedule install --replace
```

`--replace` backs up a different existing plist alongside it, unloads only
`com.watson.skills-update`, and loads the new definition under the same label.
There is no second scheduled updater. If loading fails, the previous plist is
restored and its job reloaded if it was previously loaded. The old script and
README are retained so migration can be reversed. To revert, remove the new
schedule, restore the backed-up plist, and load it with `launchctl bootstrap`.

## Development checks

```sh
node --test ai/skills.test.mjs
bash -n ai/run.sh scripts/install.sh
```

Tests use temporary directories and simulated CLI/launchd processes. They do not
change the current user's skills, invoke launchd, or download upstream content.
