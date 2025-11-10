
function s:setupWrapping()
  set wrap
  set wrapmargin=2
  set textwidth=72
endfunction

function s:setupMarkup()
  call s:setupWrapping()
  map <buffer> <Leader>p :Mm <CR>
endfunction

" Thorfile, Rakefile, Vagrantfile and Gemfile are Ruby
au BufRead,BufNewFile {Gemfile,Rakefile,Vagrantfile,Thorfile,config.ru}  set ft=ruby

" md, markdown, and mk are markdown and define buffer-local preview
au BufRead,BufNewFile *.{md,markdown,mdown,mkd,mkdn} call s:setupMarkup()

" add json syntax highlighting
au BufNewFile,BufRead *.json set ft=javascript

" au BufRead,BufNewFile *.txt call s:setupWrapping()

" make Python follow PEP8 ( http://www.python.org/dev/peps/pep-0008/ )
au FileType python set softtabstop=4 tabstop=4 shiftwidth=4 textwidth=79

" make uses real tabs
au FileType make set noexpandtab

" to hide the code of method 
" function! FoldEndBlock()
"   let spec_idx = line('.') 
"   let ctx_idx  = search('end', 'n')
"   let cmd = (spec_idx).','.(ctx_idx).'fold'
"   exec cmd
" endfunction

" nmap ff :call FoldEndBlock()<CR>
" nmap fo :foldopen! <CR>

" set foldmethod=indent
" set foldlevelstart=100

" let javaScript_fold=1
" let perl_fold=1
" let php_folding=1
" let r_syntax_folding=1
" let ruby_fold=1
" let sh_fold_enabled=1
" let vimsyn_folding='af'
" let xml_syntax_folding=1
