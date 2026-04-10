#!/usr/bin/env python3
"""Migrate routines from themes.json to independent routines.json.

Usage:
    python3 scripts/migrate-routines.py [data_dir]

The optional data_dir argument overrides the default ~/.bearing.

Idempotent: if routines.json already exists, prints a message and exits.
Creates .bak backups before modifying any file.
"""

import glob
import json
import os
import shutil
import sys


def main():
    data_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.bearing")
    themes_path = os.path.join(data_dir, "themes", "themes.json")
    routines_path = os.path.join(data_dir, "routines.json")
    calendar_dir = os.path.join(data_dir, "calendar")

    # 1. Idempotency check
    if os.path.exists(routines_path):
        print("routines.json already exists at %s, skipping migration" % routines_path)
        return

    # 2. Read themes
    if not os.path.exists(themes_path):
        print("ERROR: themes.json not found at %s" % themes_path, file=sys.stderr)
        sys.exit(1)

    with open(themes_path, "r") as f:
        themes_data = json.load(f)

    # 3. Extract routines from all themes, build old->new ID mapping
    id_map = {}  # old_id -> new_id
    routines = []
    counter = 1

    for theme in themes_data.get("themes", []):
        for routine in theme.get("routines", []):
            old_id = routine["id"]
            new_id = "R%d" % counter
            id_map[old_id] = new_id
            # Create a copy with the new ID
            migrated = dict(routine)
            migrated["id"] = new_id
            routines.append(migrated)
            counter += 1

    # 4. Write routines.json
    with open(routines_path, "w") as f:
        json.dump({"routines": routines}, f, indent=2)
        f.write("\n")
    print("Wrote %s with %d routines" % (routines_path, len(routines)))

    # 5. Backup and update themes.json (remove routines arrays)
    shutil.copy2(themes_path, themes_path + ".bak")
    for theme in themes_data.get("themes", []):
        theme.pop("routines", None)
    with open(themes_path, "w") as f:
        json.dump(themes_data, f, indent=2)
        f.write("\n")
    print("Updated %s (backup at %s)" % (themes_path, themes_path + ".bak"))

    # 6. Update calendar files: remap routineChecks IDs
    cal_count = 0
    if os.path.isdir(calendar_dir):
        for cal_file in sorted(glob.glob(os.path.join(calendar_dir, "*.json"))):
            with open(cal_file, "r") as f:
                cal_data = json.load(f)

            changed = False
            for entry in cal_data.get("entries", []):
                checks = entry.get("routineChecks", [])
                if checks:
                    entry["routineChecks"] = [id_map.get(c, c) for c in checks]
                    changed = True

            if changed:
                shutil.copy2(cal_file, cal_file + ".bak")
                with open(cal_file, "w") as f:
                    json.dump(cal_data, f, indent=2)
                    f.write("\n")
                cal_count += 1
    else:
        print("No calendar directory found at %s, skipping calendar updates" % calendar_dir)

    # 7. Summary
    print("")
    print("Migration complete:")
    print("  Routines migrated: %d" % len(routines))
    print("  Calendar files updated: %d" % cal_count)
    if id_map:
        print("  ID mapping:")
        for old_id, new_id in id_map.items():
            print("    %s -> %s" % (old_id, new_id))
    else:
        print("  No routines found in themes")


if __name__ == "__main__":
    main()
