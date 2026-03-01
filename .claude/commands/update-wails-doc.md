Fetch the latest Wails v2 documentation snapshot by running:

```bash
bash .claude/scripts/update-wails-docs.sh
```

Report the output of the script to the user, including the commit SHA and file count. If the script exits with an error, show the error and stop.

If `tmp/docs/` is not listed in `.gitignore`, remind the user to add it.