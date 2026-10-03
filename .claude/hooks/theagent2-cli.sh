# theagent2 hook support — resolve the runtime CLI, or fail loudly.
#
# Sourced by every wrapper in this directory. Not a hook itself; Claude Code
# never invokes this file.
#
# Why it exists (#890). The wrappers used to end in `exec theagent2 hook <event>
# "$@"` — a BARE command name. When the PATH lookup finds nothing, bash's `exec`
# still tries the name as a path relative to the CURRENT DIRECTORY. So in a
# container where the CLI was not installed, a session whose cwd is this
# repository resolved the `theagent2/` SOURCE DIRECTORY and died with
#
#     line 5: exec: theagent2: cannot execute: Is a directory
#
# reported as a non-blocking hook error. Non-blocking means the session ran on:
# no birth assert, no context andon, no session-metrics row (ADR-056 §6) — for
# every session in that container, with one cryptic line as the only trace. The
# workspace wrappers had already learned this lesson (#696: absolute path, never
# a bare name off the session PATH); the workstream wrappers had not.
#
# Resolution order, first hit wins:
#
#   1. $THEAGENT2_CLI          explicit override. A value that does not work is
#                              a LOUD failure, never a silent fall-through to
#                              some other runtime.
#   2. `command -v theagent2`  a PATH lookup that cannot fall back to the cwd,
#                              and whose answer must be an ABSOLUTE path to an
#                              executable FILE — the check the bare `exec`
#                              never made.
#   3. paths under the project the project root is derived from THIS file's own
#                              location, never from the cwd: node_modules bins
#                              first, then a self-hosted runtime build (the
#                              theagent2 repository developing itself).
#
# Nothing resolved => exit 127 (`command not found`, per shell convention) with
# a diagnosis that names what is dead and how to repair it.
#
# GENERATED-ADJACENT: this file is a runtime TEMPLATE. Edit
# theagent2/packages/runtime/templates/claude/hooks/theagent2-cli.sh and run
# `theagent2 sync`; do not hand-patch the installed copy under .claude/ (#846).

# Absolute path to a usable `node`, on stdout. Non-zero if there is none.
theagent2_hook_node() {
  local n
  n=$(command -v node 2>/dev/null) || return 1
  case "$n" in
    /*) if [ -f "$n" ] && [ -x "$n" ]; then printf '%s\n' "$n"; return 0; fi ;;
  esac
  return 1
}

# Report an unresolvable CLI and exit. Loud by construction: it names the
# consequence (the ADR-056 duties are not running), not just the symptom.
theagent2_hook_die() {
  local event="$1" why="$2"
  {
    printf 'theagent2 hook %s: FATAL — the theagent2 CLI could not be resolved (%s).\n' "$event" "$why"
    printf '  This session has NO birth assert, NO context andon and NO session-metrics row (ADR-056 §6, #890).\n'
    if [ "$event" = session-start ]; then
      printf '  Looked for, in order: $THEAGENT2_CLI; `theagent2` on PATH (absolute executable file only);\n'
      printf '  <project>/node_modules/.bin/theagent2; <project>/[theagent2/]packages/runtime/dist/index.js.\n'
      printf '  Repair one of these and start a new session:\n'
      printf '    build the in-repo runtime — cd theagent2/packages/runtime && npm install && npm run build\n'
      printf '    or install the CLI       — npm i -g @theagent2/runtime\n'
      printf '    or point at it directly  — export THEAGENT2_CLI=/absolute/path/to/theagent2\n'
    fi
  } >&2
  exit 127
}

# Run `theagent2 hook <event>` on the resolved CLI, replacing this process.
# Never returns: it execs, or it dies with a diagnosis.
theagent2_hook_exec() {
  local event="$1"
  shift

  local self_dir="" project_root="" node_bin="" candidate="" on_path=""
  if self_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P); then
    # .claude/hooks/ -> .claude/ -> the project root.
    project_root=$(CDPATH= cd -- "$self_dir/../.." && pwd -P) || project_root=""
  fi

  # 1. Explicit override.
  if [ -n "${THEAGENT2_CLI:-}" ]; then
    if [ -f "$THEAGENT2_CLI" ] && [ -x "$THEAGENT2_CLI" ]; then
      exec "$THEAGENT2_CLI" hook "$event" "$@"
    fi
    case "$THEAGENT2_CLI" in
      *.js | *.mjs | *.cjs)
        if [ -f "$THEAGENT2_CLI" ] && node_bin=$(theagent2_hook_node); then
          exec "$node_bin" "$THEAGENT2_CLI" hook "$event" "$@"
        fi
        ;;
    esac
    theagent2_hook_die "$event" \
      "THEAGENT2_CLI=$THEAGENT2_CLI is neither an executable file nor a .js entry runnable with node"
  fi

  # 2. PATH — absolute, and a real executable file.
  on_path=$(command -v theagent2 2>/dev/null) || on_path=""
  case "$on_path" in
    /*) if [ -f "$on_path" ] && [ -x "$on_path" ]; then exec "$on_path" hook "$event" "$@"; fi ;;
  esac

  # 3. The project's own copy, addressed from this file's location.
  if [ -n "$project_root" ]; then
    for candidate in \
      "$project_root/node_modules/.bin/theagent2" \
      "$project_root/theagent2/node_modules/.bin/theagent2"; do
      if [ -f "$candidate" ] && [ -x "$candidate" ]; then
        exec "$candidate" hook "$event" "$@"
      fi
    done
    for candidate in \
      "$project_root/node_modules/@theagent2/runtime/dist/index.js" \
      "$project_root/theagent2/packages/runtime/dist/index.js" \
      "$project_root/packages/runtime/dist/index.js"; do
      if [ -f "$candidate" ] && node_bin=$(theagent2_hook_node); then
        exec "$node_bin" "$candidate" hook "$event" "$@"
      fi
    done
  fi

  theagent2_hook_die "$event" "not on PATH, and no runtime build under ${project_root:-<unknown project root>}"
}
