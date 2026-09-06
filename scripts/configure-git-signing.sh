#!/usr/bin/env bash

print_git_signing_setup() {
  local local_config="$1"

  echo "WARNING: Git commit signing is enabled, but no machine-local signing key is configured." >&2
  echo "Create $local_config with one of these forms:" >&2
  echo >&2
  echo "  Public-key file:" >&2
  echo "    [user]" >&2
  echo "      signingkey = /absolute/path/to/signing-key.pub" >&2
  echo >&2
  echo "  SSH-agent-backed public key:" >&2
  echo "    [user]" >&2
  echo "      signingkey = key::ssh-ed25519 AAAA..." >&2
  echo >&2
  echo "The corresponding private key must be available when Git signs." >&2
  echo "Key generation, SSH-agent selection, and Keychain or 1Password setup are left to you." >&2
}

write_git_signing_config() {
  local local_config="$1"
  local public_key="$2"
  local temporary_config

  if [ -e "$local_config" ] || [ -L "$local_config" ]; then
    echo "Cannot create $local_config: the path already exists." >&2
    return 1
  fi

  if ! temporary_config="$(mktemp "${local_config}.tmp.XXXXXX")"; then
    echo "Cannot create $local_config: could not create a temporary file." >&2
    return 1
  fi

  chmod 600 "$temporary_config"
  if ! printf '[user]\n\tsigningkey = %s\n' "$public_key" > "$temporary_config"; then
    rm -f "$temporary_config"
    echo "Cannot create $local_config: could not write the configuration." >&2
    return 1
  fi

  if ! mv "$temporary_config" "$local_config"; then
    rm -f "$temporary_config"
    echo "Cannot create $local_config: could not install the configuration." >&2
    return 1
  fi

  echo "Created machine-local Git signing configuration: $local_config"
}

verify_git_signing() {
  local test_dir

  if ! test_dir="$(mktemp -d -t dotfiles-git-signing)"; then
    echo "Cannot verify Git signing: could not create a temporary directory." >&2
    return 1
  fi

  if ! git init -q "$test_dir"; then
    rm -rf "$test_dir"
    echo "Cannot verify Git signing: could not initialize a temporary repository." >&2
    return 1
  fi

  if ! git -C "$test_dir" \
    -c core.hooksPath=/dev/null \
    -c user.name="Git signing verification" \
    -c user.email="git-signing-verification@example.invalid" \
    commit --allow-empty --quiet -m "Verify Git signing"; then
    rm -rf "$test_dir"
    echo "Git signing verification failed. The private key may be unavailable to the signing process." >&2
    return 1
  fi

  if ! git -C "$test_dir" cat-file commit HEAD | grep -q '^gpgsig '; then
    rm -rf "$test_dir"
    echo "Git signing verification failed: the temporary commit was not signed." >&2
    return 1
  fi

  rm -rf "$test_dir"
  echo "Git commit signing verified successfully."
}

configure_git_signing() {
  local local_config="${DOTFILES_GIT_SIGNING_CONFIG:-$HOME/.gitconfig-signing.local}"
  local default_public_key="${DOTFILES_GIT_SIGNING_PUBLIC_KEY:-$HOME/.ssh/id_ed25519_git_signing.pub}"
  local signing_key=""

  if ! command -v git >/dev/null 2>&1; then
    echo "WARNING: Cannot configure Git signing because Git is unavailable." >&2
    return
  fi

  if signing_key="$(git config --file "$local_config" --get user.signingkey 2>/dev/null)" && \
    [ -n "$signing_key" ]; then
    echo "Machine-local Git signing key is configured."
  elif [ -e "$local_config" ] || [ -L "$local_config" ]; then
    echo "WARNING: $local_config exists but does not define user.signingkey." >&2
    print_git_signing_setup "$local_config"
    return
  elif [ -f "$default_public_key" ]; then
    echo "Found a dedicated Git signing public key: $default_public_key"
    if confirm "Create $local_config using this public key?"; then
      if ! write_git_signing_config "$local_config" "$default_public_key"; then
        print_git_signing_setup "$local_config"
        return
      fi
    else
      print_git_signing_setup "$local_config"
      return
    fi
  else
    print_git_signing_setup "$local_config"
    return
  fi

  if confirm "Verify Git commit signing in a temporary repository?"; then
    if ! verify_git_signing; then
      echo "Continuing setup without verified Git commit signing." >&2
    fi
  fi
}
