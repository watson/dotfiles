#!/usr/bin/env bash

path_exists() {
  [ -e "$1" ] || [ -L "$1" ]
}

install_oh_my_zsh() {
  local install_dir="$HOME/.oh-my-zsh"

  if [ -d "$install_dir/.git" ] && [ -f "$install_dir/oh-my-zsh.sh" ]; then
    echo "Oh My Zsh is already installed."
    return
  fi

  if path_exists "$install_dir"; then
    echo "Cannot install Oh My Zsh: $install_dir exists but is not a complete installation." >&2
    return 1
  fi

  if confirm "Install Oh My Zsh?"; then
    if command -v git >/dev/null 2>&1; then
      git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$install_dir"
    else
      echo "Cannot install Oh My Zsh: git is not installed." >&2
      return 1
    fi
  fi
}

install_tpm() {
  local dotfiles_dir="$1"
  local tpm_dir="$dotfiles_dir/tmux/plugins/tpm"

  if [ -d "$tpm_dir/.git" ] && [ -x "$tpm_dir/tpm" ]; then
    echo "TPM is already installed."
    return
  fi

  if path_exists "$tpm_dir"; then
    echo "Cannot install TPM: $tpm_dir exists but is not a complete installation." >&2
    return 1
  fi

  if confirm "Install the tmux plugin manager (TPM)?"; then
    if command -v git >/dev/null 2>&1; then
      mkdir -p "$(dirname "$tpm_dir")"
      git clone --depth=1 https://github.com/tmux-plugins/tpm.git "$tpm_dir"
    else
      echo "Cannot install TPM: git is not installed." >&2
      return 1
    fi
  fi
}

collect_vim_plugin_state() {
  local dotfiles_dir="$1"
  local repository
  local plugin_name
  local plugin_dir

  MISSING_VIM_PLUGINS=()
  CONFLICTING_VIM_PLUGIN_PATHS=()

  while IFS= read -r repository; do
    plugin_name="${repository##*/}"
    plugin_dir="$dotfiles_dir/vim/bundle/$plugin_name"

    if [ -d "$plugin_dir/.git" ] && \
       { [ "$plugin_name" != "Vundle.vim" ] || [ -f "$plugin_dir/autoload/vundle.vim" ]; }; then
      continue
    fi

    if path_exists "$plugin_dir"; then
      CONFLICTING_VIM_PLUGIN_PATHS+=("$plugin_dir")
    else
      MISSING_VIM_PLUGINS+=("$repository")
    fi
  done < <(awk -F"'" '/^[[:space:]]*Plugin / { print $2 }' "$dotfiles_dir/vim/bundles.vim")
}

install_vim_plugins() {
  local dotfiles_dir="$1"
  local vundle_dir="$dotfiles_dir/vim/bundle/Vundle.vim"
  local plugin

  if ! command -v vim >/dev/null 2>&1; then
    return
  fi

  collect_vim_plugin_state "$dotfiles_dir"

  if [ "${#CONFLICTING_VIM_PLUGIN_PATHS[@]}" -ne 0 ]; then
    echo "Cannot install Vim plugins; incomplete plugin paths already exist:" >&2
    for plugin in "${CONFLICTING_VIM_PLUGIN_PATHS[@]}"; do
      echo "  - $plugin" >&2
    done
    return 1
  fi

  if [ "${#MISSING_VIM_PLUGINS[@]}" -eq 0 ]; then
    echo "All configured Vim plugins are installed."
    return
  fi

  echo "Missing configured Vim plugins:"
  for plugin in "${MISSING_VIM_PLUGINS[@]}"; do
    echo "  - $plugin"
  done

  if ! confirm "Install these Vim plugins?"; then
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

  vim -Nu "$dotfiles_dir/vim/vimrc" +PluginInstall +qall
  collect_vim_plugin_state "$dotfiles_dir"

  if [ "${#MISSING_VIM_PLUGINS[@]}" -ne 0 ] || \
     [ "${#CONFLICTING_VIM_PLUGIN_PATHS[@]}" -ne 0 ]; then
    echo "Vim plugin installation did not complete successfully." >&2
    return 1
  fi
}

collect_tmux_plugin_state() {
  local dotfiles_dir="$1"
  local repository
  local plugin_name
  local plugin_dir

  MISSING_TMUX_PLUGINS=()
  CONFLICTING_TMUX_PLUGIN_PATHS=()

  while IFS= read -r repository; do
    plugin_name="${repository##*/}"
    [ "$plugin_name" = "tpm" ] && continue
    plugin_dir="$dotfiles_dir/tmux/plugins/$plugin_name"

    if [ -d "$plugin_dir/.git" ]; then
      continue
    fi

    if path_exists "$plugin_dir"; then
      CONFLICTING_TMUX_PLUGIN_PATHS+=("$plugin_dir")
    else
      MISSING_TMUX_PLUGINS+=("$repository")
    fi
  done < <(awk -F"'" '/^[[:space:]]*set-option -g @plugin / { print $2 }' "$dotfiles_dir/tmux/tmux.conf")
}

install_tmux_plugins() {
  local dotfiles_dir="$1"
  local tpm_dir="$dotfiles_dir/tmux/plugins/tpm"
  local plugin

  if [ ! -x "$tpm_dir/bin/install_plugins" ] || ! command -v tmux >/dev/null 2>&1; then
    return
  fi

  collect_tmux_plugin_state "$dotfiles_dir"

  if [ "${#CONFLICTING_TMUX_PLUGIN_PATHS[@]}" -ne 0 ]; then
    echo "Cannot install tmux plugins; incomplete plugin paths already exist:" >&2
    for plugin in "${CONFLICTING_TMUX_PLUGIN_PATHS[@]}"; do
      echo "  - $plugin" >&2
    done
    return 1
  fi

  if [ "${#MISSING_TMUX_PLUGINS[@]}" -eq 0 ]; then
    echo "All configured tmux plugins are installed."
    return
  fi

  echo "Missing configured tmux plugins:"
  for plugin in "${MISSING_TMUX_PLUGINS[@]}"; do
    echo "  - $plugin"
  done

  if ! confirm "Install these tmux plugins?"; then
    return
  fi

  TMUX_PLUGIN_MANAGER_PATH="$dotfiles_dir/tmux/plugins/" \
    "$tpm_dir/bin/install_plugins"
  collect_tmux_plugin_state "$dotfiles_dir"

  if [ "${#MISSING_TMUX_PLUGINS[@]}" -ne 0 ] || \
     [ "${#CONFLICTING_TMUX_PLUGIN_PATHS[@]}" -ne 0 ]; then
    echo "tmux plugin installation did not complete successfully." >&2
    return 1
  fi
}
