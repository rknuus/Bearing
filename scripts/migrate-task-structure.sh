#!/usr/bin/env bash
# Migrate task directory structure from tasks/{themeID}/{status}/ to tasks/{status}/
# This is a one-time migration script. Safe to run multiple times (idempotent).
set -euo pipefail

DATA_DIR="${BEARING_DATA_DIR:-$HOME/.bearing}"
TASKS_DIR="$DATA_DIR/tasks"
STATUS_DIRS=("todo" "doing" "done" "archived")

if [ ! -d "$TASKS_DIR" ]; then
  echo "No tasks directory found at $TASKS_DIR — nothing to migrate."
  exit 0
fi

# Detect theme directories (any dir under tasks/ that isn't a status dir)
theme_dirs=()
for entry in "$TASKS_DIR"/*/; do
  [ -d "$entry" ] || continue
  dirname=$(basename "$entry")
  is_status=false
  for s in "${STATUS_DIRS[@]}"; do
    if [ "$dirname" = "$s" ]; then
      is_status=true
      break
    fi
  done
  if [ "$is_status" = false ]; then
    theme_dirs+=("$dirname")
  fi
done

if [ ${#theme_dirs[@]} -eq 0 ]; then
  echo "No theme directories found — already migrated or no tasks exist."
  exit 0
fi

echo "Found ${#theme_dirs[@]} theme directories: ${theme_dirs[*]}"

# Collect all filenames and check for collisions (same filename in different themes)
collision=false
seen_file=$(mktemp)
trap 'rm -f "$seen_file"' EXIT
for theme in "${theme_dirs[@]}"; do
  for status in "${STATUS_DIRS[@]}"; do
    dir="$TASKS_DIR/$theme/$status"
    [ -d "$dir" ] || continue
    for file in "$dir"/*.json; do
      [ -f "$file" ] || continue
      filename=$(basename "$file")
      dest="$TASKS_DIR/$status/$filename"
      key="$status/$filename"
      if [ -f "$dest" ]; then
        echo "ERROR: Collision — $dest already exists (source: $file)"
        collision=true
      elif grep -qxF "$key" "$seen_file"; then
        echo "ERROR: Collision — $key appears in multiple theme directories"
        collision=true
      fi
      echo "$key" >> "$seen_file"
    done
  done
done

if [ "$collision" = true ]; then
  echo "Aborting: filename collisions detected. Resolve duplicates first."
  exit 1
fi

# Ensure status directories exist
for status in "${STATUS_DIRS[@]}"; do
  mkdir -p "$TASKS_DIR/$status"
done

# Move files
moved=0
for theme in "${theme_dirs[@]}"; do
  for status in "${STATUS_DIRS[@]}"; do
    dir="$TASKS_DIR/$theme/$status"
    [ -d "$dir" ] || continue
    for file in "$dir"/*.json; do
      [ -f "$file" ] || continue
      dest="$TASKS_DIR/$status/$(basename "$file")"
      mv "$file" "$dest"
      moved=$((moved + 1))
    done
  done
done

# Remove empty theme directories
for theme in "${theme_dirs[@]}"; do
  find "$TASKS_DIR/$theme" -type d -empty -delete 2>/dev/null || true
  # Remove theme dir itself if empty
  rmdir "$TASKS_DIR/$theme" 2>/dev/null || true
done

echo "Moved $moved task files."

# Git commit if in a git repo
if [ -d "$DATA_DIR/.git" ]; then
  git -C "$DATA_DIR" add tasks/
  if git -C "$DATA_DIR" diff --cached --quiet; then
    echo "No changes to commit."
  else
    git -C "$DATA_DIR" commit -m "Migrate: flatten task directory structure (remove theme directories)"
    echo "Changes committed."
  fi
fi

echo "Migration complete."
