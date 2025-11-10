
set nocompatible              " be iMproved, required
filetype off                  " required

" Vundle confifg
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()

" let Vundle manage Vundle, required
Plugin 'VundleVim/Vundle.vim'

Plugin 'preservim/nerdcommenter'
  let g:NERDSpaceDelims = 2
  let g:NERDDefaultAlign = 'left'

Plugin 'tpope/vim-surround'
Plugin 'ervandew/supertab'

Plugin 'wincent/Command-T'
  let g:CommandTMaxHeight=20
  map <Leader>ft :CommandTFlush<CR>

Plugin 'marcweber/vim-addon-mw-utils'   " required dependency for garbas/vim-snipmate
Plugin 'tomtom/tlib_vim'                " optional dependency for garbas/vim-snipmate
Plugin 'honza/vim-snippets'             " optional dependency for garbas/vim-snipmate
Plugin 'garbas/vim-snipmate'

Plugin 'jlanzarotta/bufexplorer'

Plugin 'mileszs/ack.vim'

Plugin 'prettier/vim-prettier'
  let g:prettier#autoformat = 0
  au BufWritePre *.js,*.jsx,*.mjs,*.ts,*.tsx,*.css,*.less,*.scss,*.json,*.graphql,*.md,*.vue,*.yaml,*.html PrettierAsync

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required
" To ignore plugin indent changes, instead use:
"filetype plugin on
"
" Brief help
" :PluginList       - lists configured plugins
" :PluginInstall    - installs plugins; append `!` to update or just :PluginUpdate
" :PluginSearch foo - searches for foo; append `!` to refresh local cache
" :PluginClean      - confirms removal of unused plugins; append `!` to auto-approve removal
"
" see :h vundle for more details or wiki for FAQ
" Put your non-Plugin stuff after this
