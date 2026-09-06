#!/usr/bin/env bash

set -e

source_path="${BASH_SOURCE[0]}"
while [ -L "$source_path" ]; do
  source_dir="$(cd -P "$(dirname "$source_path")" && pwd)"
  source_path="$(readlink "$source_path")"
  case "$source_path" in
    /*) ;;
    *) source_path="$source_dir/$source_path" ;;
  esac
done

script_dir="$(cd -P "$(dirname "$source_path")" && pwd)"
dotfiles_dir="$(dirname "$script_dir")"

confirm() {
  local prompt="$1"
  local reply

  while true; do
    if ! read -r -p "$prompt [y/N] " reply; then
      echo
      return 1
    fi

    case "$reply" in
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      ""|[Nn]|[Nn][Oo]) return 1 ;;
      *) echo "Please answer yes or no." ;;
    esac
  done
}

source "$script_dir/install-dependencies.sh"
source "$script_dir/install-plugins.sh"
source "$script_dir/configure-git-signing.sh"

install_required_dependencies
install_nvm
install_claude_code
install_oh_my_zsh
"$script_dir/create-links.sh"
configure_git_signing
install_tpm "$dotfiles_dir"
install_vim_plugins "$dotfiles_dir"
install_tmux_plugins "$dotfiles_dir"
