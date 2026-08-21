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

# Preserve the user's existing zsh configuration. Never overwrite an earlier
# backup, since it may be the only copy of the original file.
if { [ -e "$HOME/.zshrc" ] || [ -L "$HOME/.zshrc" ]; } && \
   ! { [ -L "$HOME/.zshrc" ] && [ "$(readlink "$HOME/.zshrc")" = "$dotfiles_dir/zsh/zshrc" ]; }; then
  if [ -e "$zshrc_backup" ] || [ -L "$zshrc_backup" ]; then
    echo "Cannot install: $zshrc_backup already exists." >&2
    echo "Move or remove it after confirming which copy you want to keep." >&2
    exit 1
  fi

  mv "$HOME/.zshrc" "$zshrc_backup"
  echo "Backed up $HOME/.zshrc to $zshrc_backup"
fi

# folders
ln -sfn "$dotfiles_dir/vim"                 "$HOME/.vim"
ln -sfn "$dotfiles_dir/tmux"                "$HOME/.tmux"

# files
ln -sfn "$dotfiles_dir/zsh/zshrc"           "$HOME/.zshrc"
ln -sfn "$dotfiles_dir/vim/vimrc"           "$HOME/.vimrc"
ln -sfn "$dotfiles_dir/tmux/tmux.conf"      "$HOME/.tmux.conf"
ln -sfn "$dotfiles_dir/gitconfig"           "$HOME/.gitconfig"
ln -sfn "$dotfiles_dir/npmrc"               "$HOME/.npmrc"

# Install the configured Vim plugins when Vim is already available. Vundle is
# needed before Vim can understand the Plugin commands in bundles.vim.
if command -v vim >/dev/null 2>&1; then
  vundle_dir="$dotfiles_dir/vim/bundle/Vundle.vim"

  if [ ! -d "$vundle_dir/.git" ]; then
    if ! command -v git >/dev/null 2>&1; then
      echo "Cannot install Vim plugins: git is not installed." >&2
      exit 1
    fi

    mkdir -p "$(dirname "$vundle_dir")"
    git clone https://github.com/VundleVim/Vundle.vim.git "$vundle_dir"
  fi

  echo "Installing Vim plugins..."
  vim -Nu "$dotfiles_dir/vim/vimrc" +PluginInstall +qall
fi

# linux only
# if [ "$(uname)" == "Linux" ] && [ -f /etc/pacman.conf ]; then
#   # put linux only commands here
# fi

# mac only
# if [ "$(uname)" == "Darwin" ]; then
#   # put mac only commands here
# fi
