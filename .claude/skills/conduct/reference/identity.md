# conduct — reference: Who commits — one identity per actor (#815)

Part of the `conduct` skill — this section stood in `SKILL.md` and moved here VERBATIM (#1322), so a conductor's boot carries the protocol and opens this at the moment the duty applies. Nothing in it became optional by moving; `SKILL.md` names when to read it.

## Who commits — one identity per actor (#815)

Every session a conducted run launches commits as **itself**: `<role>/<ledger-id>`, with
the run's own email subaddressed by the id (`architect/S-012
<run4+S-012@bellavista.invalid>`). `theagent2 conduct dispatch` and `theagent2 succeed`
inject it at the launch; the retro recipe above picks it up from
`theagent2 conduct identity <id>`.

- It is **per process** (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`), never repo config. The
  checkout's configured identity is the **Software Architect's** and stays his — his
  commits are the ones with no `+S-###` in them.
- `git log --author=+S-012` is now one session's work; `--author=@<run domain>` is still
  the whole run. `git shortlog -sne` reads as a roster of actors rather than one name.
- Run 4 had one identity for conductor, architect, test engineer, retro and proxy owner,
  and then rested a delivery receipt on a commit (#781). `git log` could not tell the
  owner's Contract disposition from a conductor writing what it believed the owner said.
- If a session was launched by hand and you are not sure: `theagent2 conduct identity
  <your-id> --check` — exit 6 prints what it would commit as against what it should.
  `export $(theagent2 conduct identity <your-id>)` fixes it for the session, and touches
  nothing outside it.
