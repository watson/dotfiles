#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# launchd does not read shell profiles. Try standard installations, then ask
# nvm for its default version without activating it or sourcing a shell profile.
node_bin="$(command -v node || true)"
if [ -z "$node_bin" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ]; then
      node_bin="$candidate"
      break
    fi
  done
fi
if [ -z "$node_bin" ] && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  node_bin="$(
    set +u
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh" --no-use
    nvm which default
  )" || true
fi
if [ -z "$node_bin" ] || [ ! -x "$node_bin" ]; then
  echo "Node.js is required. Install Node, or set an installed nvm default version." >&2
  exit 1
fi

# Keep npm/npx and their child processes on the same Node installation.
export PATH="$(dirname "$node_bin"):$PATH"
exec "$node_bin" "$script_dir/skills.mjs" "$@"
