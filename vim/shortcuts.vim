"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
"" SHORTCUTS
"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""

" cool feature
nnoremap ; :

" Tired of clearing highlighted searches by searching for “ldsfhjkhgakjks”?
nmap <silent> ,/ :nohlsearch<CR>

" Easy window navigation
map <C-h> <C-w>h
map <C-j> <C-w>j
map <C-k> <C-w>k
map <C-l> <C-w>l

" Opens an edit command with the path of the currently edited file filled in
" Normal mode: <Leader>e
" map <Leader>e :e <C-R>=expand("%:p:h") . "/" <CR>

" Opens a tab edit command with the path of the currently edited file filled in
" Normal mode: <Leader>t
map <Leader>te :tabe <C-R>=expand("%:p:h") . "/" <CR>

" Unimpaired configuration
" Bubble single lines
" nmap <C-Up> [e
" nmap <C-Down> ]e
" Bubble multiple lines
" vmap <C-Up> [egv
" vmap <C-Down> ]egv

" reindent the entire file
map <Leader>I gg=G``<CR>

" Open a new tab
map <Leader>e :tabnew<CR>
map <Leader>> :tabnext<CR>
map <Leader>< :tabprevious<CR>

" help with hash type in Ruby
imap <C-l> <Space>=><Space>

" reload all buffers
map <Leader>R :bufdo :e!<CR>

" reload current buffer
map <Leader>r :e!<CR>

" q to split a line to 80 char long
map Q 080lwbels<CR><ESC>
