#!/usr/bin/env bash

unamestr=`uname`

rm -f ~/.zshrc

# folders
ln -sf ~/dotfiles/vim                 ~/.vim
ln -sf ~/dotfiles/tmux                ~/.tmux

# files
ln -sf ~/dotfiles/zsh/zshrc           ~/.zshrc
ln -sf ~/dotfiles/vim/vimrc           ~/.vimrc
ln -sf ~/dotfiles/tmux/tmux.conf      ~/.tmux.conf
ln -sf ~/dotfiles/gitconfig           ~/.gitconfig
ln -sf ~/dotfiles/npmrc               ~/.npmrc

# linux only
# if [ "$unamestr" == "Linux" ] && [ -f /etc/pacman.conf ]; then
#   # put linux only commands here
# fi

# mac only
# if [ "$unamestr" == "Darwin" ]; then
#   # put mac only commands here
# fi
