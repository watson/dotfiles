#!/usr/bin/env bash

install_oh_my_zsh() {
  if [ -e "$HOME/.oh-my-zsh" ] || [ -L "$HOME/.oh-my-zsh" ]; then
    echo "Oh My Zsh is already installed."
  elif confirm "Install Oh My Zsh?"; then
    if command -v git >/dev/null 2>&1; then
      git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$HOME/.oh-my-zsh"
    else
      echo "Cannot install Oh My Zsh: git is not installed." >&2
    fi
  fi
}

install_tpm() {
  local dotfiles_dir="$1"
  local tpm_dir="$dotfiles_dir/tmux/plugins/tpm"

  if [ -d "$tpm_dir" ]; then
    echo "TPM is already installed."
  elif confirm "Install the tmux plugin manager (TPM)?"; then
    if command -v git >/dev/null 2>&1; then
      mkdir -p "$(dirname "$tpm_dir")"
      git clone --depth=1 https://github.com/tmux-plugins/tpm.git "$tpm_dir"
    else
      echo "Cannot install TPM: git is not installed." >&2
    fi
  fi
}

install_vim_plugins() {
  local dotfiles_dir="$1"
  local vundle_dir="$dotfiles_dir/vim/bundle/Vundle.vim"

  if ! command -v vim >/dev/null 2>&1; then
    return
  fi

  if ! confirm "Install the configured Vim plugins with Vundle?"; then
    return
  fi

  if [ ! -d "$vundle_dir/.git" ]; then
    if ! command -v git >/dev/null 2>&1; then
      echo "Cannot install Vim plugins: git is not installed." >&2
      return 1
    fi

    mkdir -p "$(dirname "$vundle_dir")"
    git clone https://github.com/VundleVim/Vundle.vim.git "$vundle_dir"
  fi

  echo "Installing Vim plugins..."
  vim -Nu "$dotfiles_dir/vim/vimrc" +PluginInstall +qall
}

install_tmux_plugins() {
  local dotfiles_dir="$1"
  local tpm_dir="$dotfiles_dir/tmux/plugins/tpm"

  if [ -x "$tpm_dir/bin/install_plugins" ] && command -v tmux >/dev/null 2>&1; then
    if confirm "Install the configured tmux plugins?"; then
      TMUX_PLUGIN_MANAGER_PATH="$dotfiles_dir/tmux/plugins/" \
        "$tpm_dir/bin/install_plugins"
    fi
  fi
}
