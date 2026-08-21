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
zshrc_backup="$dotfiles_dir/.zshrc.backup"

remove_managed_link() {
  link_path="$1"
  expected_target="$2"

  if [ -L "$link_path" ] && [ "$(readlink "$link_path")" = "$expected_target" ]; then
    rm "$link_path"
    echo "Removed $link_path"
  elif [ -e "$link_path" ] || [ -L "$link_path" ]; then
    echo "Kept $link_path because it is not managed by this dotfiles checkout"
  fi
}

remove_managed_link "$HOME/.vim"        "$dotfiles_dir/vim"
remove_managed_link "$HOME/.tmux"       "$dotfiles_dir/tmux"
remove_managed_link "$HOME/.zshrc"      "$dotfiles_dir/zsh/zshrc"
remove_managed_link "$HOME/.vimrc"      "$dotfiles_dir/vim/vimrc"
remove_managed_link "$HOME/.tmux.conf"  "$dotfiles_dir/tmux/tmux.conf"
remove_managed_link "$HOME/.gitconfig"  "$dotfiles_dir/gitconfig"
remove_managed_link "$HOME/.npmrc"      "$dotfiles_dir/npmrc"

if [ -e "$zshrc_backup" ] || [ -L "$zshrc_backup" ]; then
  if [ ! -e "$HOME/.zshrc" ] && [ ! -L "$HOME/.zshrc" ]; then
    mv "$zshrc_backup" "$HOME/.zshrc"
    echo "Restored $HOME/.zshrc from $zshrc_backup"
  else
    echo "Kept backup at $zshrc_backup because $HOME/.zshrc is in use"
  fi
fi
