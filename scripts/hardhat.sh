#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export XDG_CONFIG_HOME="$project_root/.xdg/config"
export XDG_DATA_HOME="$project_root/.xdg/data"
export XDG_CACHE_HOME="$project_root/.xdg/cache"
export HARDHAT_DISABLE_TELEMETRY_PROMPT=true

exec "$project_root/node_modules/.bin/hardhat" "$@"
