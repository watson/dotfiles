#!/usr/bin/env bash

script_dir="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$script_dir/scripts/install.sh" "$@"
