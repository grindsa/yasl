#!/usr/bin/env sh
set -eu

# Restore utility for archives created by scripts/backup.yasl.sh.
# Restores .env + config/groups.yml + runtime data + scripts and restarts yasl.

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose --project-directory $PROJECT_DIR}"
TMP_ROOT="${TMP_ROOT:-${TMPDIR:-/tmp}}"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-no}"

GROUPS_CONFIG_PATH="${GROUPS_CONFIG_PATH:-$PROJECT_DIR/config/groups.yml}"
DATA_DIR="${DATA_DIR:-/srv/data/yasl}"
YASL_SCRIPTS_DIR="${YASL_SCRIPTS_DIR:-$PROJECT_DIR/scripts}"
ENV_FILE_PATH="${ENV_FILE_PATH:-$PROJECT_DIR/.env}"

usage() {
  echo "Usage: $0 /path/to/yasl-backup-YYYYmmdd-HHMMSS.tar.gz"
  echo "Set RESTORE_CONFIRM=yes to run a destructive restore."
}

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

archive_path="$1"

if [ ! -f "$archive_path" ]; then
  echo "ERROR: archive not found: $archive_path" >&2
  exit 1
fi

if [ "$RESTORE_CONFIRM" != "yes" ]; then
  echo "ERROR: restore is destructive. Re-run with RESTORE_CONFIRM=yes" >&2
  exit 1
fi

work_dir="$TMP_ROOT/restore-yasl-$(date -u +%Y%m%d-%H%M%S)"
mkdir -p "$work_dir"
trap 'rm -rf "$work_dir"' EXIT INT TERM

cd "$PROJECT_DIR"

echo "Extracting archive to $work_dir"
tar -xzf "$archive_path" -C "$work_dir"

for required in .env groups.yml yasl_data.tar.gz yasl_scripts.tar.gz manifest.sha256; do
  if [ ! -f "$work_dir/$required" ]; then
    echo "ERROR: missing $required in backup archive" >&2
    exit 1
  fi
done

echo "Validating checksum manifest"
(
  cd "$work_dir"
  sha256sum -c manifest.sha256
)

echo "Stopping yasl"
$COMPOSE_CMD stop yasl

echo "Restoring groups config"
mkdir -p "$(dirname "$GROUPS_CONFIG_PATH")"
cp "$work_dir/groups.yml" "$GROUPS_CONFIG_PATH"
chmod 600 "$GROUPS_CONFIG_PATH" 2>/dev/null || true

echo "Restoring .env"
mkdir -p "$(dirname "$ENV_FILE_PATH")"
cp "$work_dir/.env" "$ENV_FILE_PATH"
chmod 600 "$ENV_FILE_PATH" 2>/dev/null || true

echo "Restoring yasl data"
mkdir -p "$DATA_DIR"
rm -rf "$DATA_DIR"/*
tar -xzf "$work_dir/yasl_data.tar.gz" -C "$DATA_DIR"

echo "Restoring yasl scripts"
mkdir -p "$YASL_SCRIPTS_DIR"
# Extract into a staging dir first so we do not wipe this running restore.sh mid-run.
scripts_stage="$work_dir/scripts_restore"
mkdir -p "$scripts_stage"
tar -xzf "$work_dir/yasl_scripts.tar.gz" -C "$scripts_stage"
# Copy restored scripts over existing ones (keeps restore.sh runnable until exit).
find "$YASL_SCRIPTS_DIR" -mindepth 1 -maxdepth 1 ! -name '.*' -exec rm -rf {} +
cp -a "$scripts_stage"/. "$YASL_SCRIPTS_DIR"/

echo "Starting yasl"
$COMPOSE_CMD up -d yasl

echo "Restore completed successfully."
