#!/usr/bin/env bash
# Deploy YASL on the webserver.
# Expected location: /srv/stacks/yasl
# Data volume:       /srv/data/yasl
# Usage (on the server): ./deploy.sh

set -euo pipefail

EXPECTED_ROOT="/srv/stacks/yasl"
DATA_ROOT="/srv/data/yasl"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ "$ROOT" != "$EXPECTED_ROOT" ]]; then
  echo "Warning: expected stack path ${EXPECTED_ROOT}, running from ${ROOT}" >&2
fi

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example and fill in values before deploying." >&2
  exit 1
fi

mkdir -p config "$DATA_ROOT"
chmod 755 config "$DATA_ROOT"

if [[ ! -f config/groups.yml ]]; then
  cat >&2 <<'MSG'
ERROR: missing config/groups.yml (gitignored — not restored by git pull).
Restore it from backup, or:
  cp config/groups.example.yml config/groups.yml
  $EDITOR config/groups.yml
MSG
  exit 1
fi

# Container user is node (uid 1000). Prefer owner:1000 + readable groups.yml.
if chown "$(id -u)":1000 config/groups.yml 2>/dev/null; then
  chmod 640 config/groups.yml
else
  chmod 644 config/groups.yml
  echo "Note: could not chown config/groups.yml to :1000 — using chmod 644 so the container can read it." >&2
fi

# Data must be writable by uid 1000 inside the container.
if chown -R "$(id -u)":1000 "$DATA_ROOT" 2>/dev/null; then
  chmod 775 "$DATA_ROOT"
else
  chmod 777 "$DATA_ROOT"
  echo "Note: could not chown ${DATA_ROOT} to :1000 — using chmod 777 so the container can write." >&2
fi

BRANCH="${DEPLOY_BRANCH:-main}"

if ! git config --global --get-all safe.directory 2>/dev/null | grep -Fxq "$ROOT"; then
  git config --global --add safe.directory "$ROOT"
fi

if [[ -z "${YASL_DEPLOY_UPDATED:-}" ]]; then
  echo "==> Fetching ${BRANCH} in ${ROOT}"
  git fetch origin
  git checkout "$BRANCH"
  # Deploy checkout must match origin. Local edits to tracked files (e.g. from
  # a manual tweak) would block `git pull --ff-only`. Secrets stay put because
  # .env / config/groups.yml are gitignored.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Note: discarding local changes to tracked files before reset to origin/${BRANCH}" >&2
    git status --short || true
  fi
  git reset --hard "origin/${BRANCH}"
  # Bash keeps executing the pre-pull copy of this file, so restart on the
  # version that was just checked out.
  export YASL_DEPLOY_UPDATED=1
  exec "$ROOT/deploy.sh" "$@"
fi

BUILD_TIME="$(TZ=Europe/Berlin date +%Y-%m-%d-%H-%M-%S)"
export BUILD_TIME

echo "==> Building and starting containers (version ${BUILD_TIME})"
if ! docker compose build --build-arg "BUILD_TIME=${BUILD_TIME}"; then
  echo "ERROR: docker compose build failed" >&2
  exit 1
fi
if ! docker compose up -d; then
  echo "ERROR: docker compose up failed" >&2
  exit 1
fi

echo "==> Status"
docker compose ps

if ! docker compose ps --status running --services | grep -qx 'yasl'; then
  echo "ERROR: yasl container is not running after deploy" >&2
  docker compose ps >&2 || true
  exit 1
fi

echo "==> Clearing Docker build cache"
docker builder prune -af

echo "Deploy complete."
echo "YASL_DEPLOY_OK"
