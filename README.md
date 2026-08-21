# Dotfiles

Personal macOS configuration for Zsh, Vim, tmux, Git, and related command-line tools.

## Install

Run this command in Terminal:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/watson/dotfiles/main/scripts/bootstrap.sh)"
```

The bootstrap script:

1. Opens Apple's Command Line Tools installer when Git is unavailable.
2. Clones this repository over HTTPS into `~/dotfiles`.
3. Runs the interactive installer, which offers to install Homebrew, required tools, preferred tools, and configured plugins.

It will not overwrite an unrelated `~/dotfiles` directory or conflicting dotfiles.

The installer is safe to run again later:

```bash
~/dotfiles/install.sh
```
