#!/usr/bin/env sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
(
  cd "$repo_dir/backend"
  ./mvnw -B test
)

if command -v npm >/dev/null 2>&1; then
  (
    cd "$repo_dir/frontend"
    npm ci
    npm run lint
    npm run typecheck
    npm test -- --run
    npm run build
  )
else
  printf '%s\n' 'npm is not on PATH; run the frontend checks in the Node 24 container or install Node 24 LTS.' >&2
fi

if command -v docker >/dev/null 2>&1; then
  docker compose -f "$repo_dir/docker-compose.yml" config --quiet
  docker compose -f "$repo_dir/docker-compose.yml" build
else
  printf '%s\n' 'Docker is not on PATH; Compose validation was skipped.' >&2
fi
