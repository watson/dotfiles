#!/usr/bin/env bash

set -e

repository_url="https://github.com/watson/dotfiles.git"
install_dir="$HOME/dotfiles"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This bootstrap script currently supports macOS only." >&2
  exit 1
fi

ensure_command_line_tools() {
  if git --version >/dev/null 2>&1; then
    return
  fi

  echo "Xcode Command Line Tools are required."
  echo "Opening Apple's installer..."
  xcode-select --install >/dev/null 2>&1 || true

  while ! git --version >/dev/null 2>&1; do
    if ! read -r -p "Finish installing Command Line Tools, then press Return to continue: " reply; then
      echo >&2
      echo "Run this bootstrap command again after Command Line Tools finish installing." >&2
      return 1
    fi
  done
}

checkout_is_dotfiles_repository() {
  local checkout="$1"
  local origin_url

  [ -d "$checkout/.git" ] || return 1
  origin_url="$(git -C "$checkout" remote get-url origin 2>/dev/null || true)"

  case "$origin_url" in
    https://github.com/watson/dotfiles|https://github.com/watson/dotfiles.git|git@github.com:watson/dotfiles.git)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

ensure_command_line_tools

if checkout_is_dotfiles_repository "$install_dir"; then
  echo "Using existing dotfiles checkout at $install_dir."
elif [ -e "$install_dir" ] || [ -L "$install_dir" ]; then
  echo "Cannot install: $install_dir already exists and is not the expected repository." >&2
  exit 1
else
  echo "Cloning dotfiles into $install_dir..."
  git clone "$repository_url" "$install_dir"
fi

exec "$install_dir/install.sh"
