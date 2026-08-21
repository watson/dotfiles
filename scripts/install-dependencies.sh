#!/usr/bin/env bash

REQUIRED_HOMEBREW_DEPENDENCIES=(vim tmux fzf git git-lfs ack)
PREFERRED_HOMEBREW_DEPENDENCIES=(wget)

find_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    command -v brew
  elif [ -x /opt/homebrew/bin/brew ]; then
    echo /opt/homebrew/bin/brew
  elif [ -x /usr/local/bin/brew ]; then
    echo /usr/local/bin/brew
  else
    return 1
  fi
}

install_homebrew() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "Cannot install Homebrew: curl is not installed." >&2
    return 1
  fi

  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
}

offer_homebrew_dependencies() {
  local brew_bin="$1"
  local dependency_kind="$2"
  local dependency
  local -a missing_dependencies=()
  shift 2

  for dependency in "$@"; do
    if ! "$brew_bin" list --formula "$dependency" >/dev/null 2>&1; then
      missing_dependencies+=("$dependency")
    fi
  done

  if [ "${#missing_dependencies[@]}" -eq 0 ]; then
    echo "All $dependency_kind Homebrew dependencies are installed."
    return
  fi

  echo "Missing $dependency_kind Homebrew dependencies:"
  for dependency in "${missing_dependencies[@]}"; do
    echo "  - $dependency"
  done

  if confirm "Install these $dependency_kind dependencies with Homebrew?"; then
    "$brew_bin" install "${missing_dependencies[@]}"
  fi
}

install_required_dependencies() {
  local brew_bin=""

  if [ "$(uname -s)" != "Darwin" ]; then
    return
  fi

  if brew_bin="$(find_homebrew)"; then
    :
  elif confirm "Homebrew is not installed. Install it?"; then
    install_homebrew
    hash -r
    brew_bin="$(find_homebrew || true)"

    if [ -z "$brew_bin" ]; then
      echo "Homebrew was installed but could not be found in a supported location." >&2
    fi
  fi

  if [ -n "$brew_bin" ]; then
    eval "$("$brew_bin" shellenv)"
    offer_homebrew_dependencies \
      "$brew_bin" required "${REQUIRED_HOMEBREW_DEPENDENCIES[@]}"
    offer_homebrew_dependencies \
      "$brew_bin" preferred "${PREFERRED_HOMEBREW_DEPENDENCIES[@]}"
  else
    echo "Skipping Homebrew dependencies."
  fi
}
