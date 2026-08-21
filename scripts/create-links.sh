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

check_link_destination() {
  local target="$1"
  local link_path="$2"

  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$target" ]; then
    return
  fi

  if [ -e "$link_path" ] || [ -L "$link_path" ]; then
    echo "Cannot manage $link_path: it already exists and is not the expected link." >&2
    return 1
  fi
}

ensure_link() {
  local target="$1"
  local link_path="$2"

  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$target" ]; then
    echo "Already linked: $link_path"
    return
  fi

  ln -s "$target" "$link_path"
  echo "Linked: $link_path -> $target"
}

create_links() {
  local index
  local conflicts=0
  local -a targets=(
    "$dotfiles_dir/vim"
    "$dotfiles_dir/tmux"
    "$dotfiles_dir/zsh/zshrc"
    "$dotfiles_dir/vim/vimrc"
    "$dotfiles_dir/tmux/tmux.conf"
    "$dotfiles_dir/gitconfig"
    "$dotfiles_dir/npmrc"
  )
  local -a link_paths=(
    "$HOME/.vim"
    "$HOME/.tmux"
    "$HOME/.zshrc"
    "$HOME/.vimrc"
    "$HOME/.tmux.conf"
    "$HOME/.gitconfig"
    "$HOME/.npmrc"
  )

  # Check every destination before changing anything, so a conflict never
  # leaves the link set half-installed.
  for index in "${!link_paths[@]}"; do
    if ! check_link_destination "${targets[$index]}" "${link_paths[$index]}"; then
      conflicts=1
    fi
  done

  if [ "$conflicts" -ne 0 ]; then
    echo "No links were changed. Move conflicting paths aside and run the installer again." >&2
    return 1
  fi

  for index in "${!link_paths[@]}"; do
    ensure_link "${targets[$index]}" "${link_paths[$index]}"
  done
}

create_links
