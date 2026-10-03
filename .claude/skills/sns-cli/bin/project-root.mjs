/**
 * project-root — the C# ROOT NAMESPACE a checker must join on, and the spec composition project
 * that root actually names (figaro#372, the same defect class #1343 fixed for `spec-seqcheck`).
 *
 * WHY THIS FILE EXISTS. Every emitted namespace and every path under `csharp/` is built by the
 * scaffolder from the PROJECT name (`derive.ts`: `company = opts.company ?? projectName`, where
 * `projectName` is the model store's project file `name`). Two other names sit close enough to be
 * mistaken for it and are routinely a DIFFERENT STRING:
 *
 *   - `architecture.yaml`'s own top-level `name:` — what `construction-entry-check` read;
 *   - `deployment-view.yaml`'s `system:` — what `slot-wiring` read.
 *
 * Measured on figaro, whose project is `Figaro` and whose two documents both open lower case: every
 * path the two checkers looked for was one letter away from a path that exists, on a case-sensitive
 * filesystem. `[S2]` reported "no store-seam project — …/figaro.Access.Ledger.Resource.csproj does
 * not exist" for all four landed seams, and `[S4]` reported the spec slots file missing, over a tree
 * where all of it is there. #1343 had already ruled the counter-reading out: the scaffolder decides
 * what namespace the code HAS, a checker that disagrees with the code it checks is wrong by
 * construction, and a const artefact is not renamed to satisfy a tool.
 *
 * THE RESOLUTION ORDER is #1343's, kept identical on purpose — one derivation, three tools:
 *
 *   1. an explicit `--company` (the scaffolder's own flag name, and seqcheck's);
 *   2. the model store's `project.yaml`, `name` before `projectName`;
 *   3. the caller's fallback — the architecture `name:` or the view's `system:` — as a LAST resort.
 *
 * Inside the project file `name` wins over `projectName` because the current shape carries both and
 * `projectName` is the lower-cased store id (`figaro`) while `name` is the project (`Figaro`); the
 * older flat shape carries only `projectName`, and there it IS the project name (`Comanda`). An
 * unreadable project file falls back rather than refusing the run.
 *
 * CASE IS NEVER FOLDED and nothing is guessed: a namespace root is case-sensitive, and a lenient
 * comparison would swallow the next real mismatch instead of reporting it. What is added instead is
 * VISIBILITY — every caller prints the resolved root and where it came from, so this class of defect
 * is one line rather than eighty findings.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from './yaml-subset.mjs';

/** `--company <ns>`, read the same way every bin in this directory reads a flag. */
export function companyFlag(args) {
  const i = args.indexOf('--company');
  return i >= 0 && i + 1 < args.length ? String(args[i + 1]).trim() || undefined : undefined;
}

/**
 * The model store's `project.yaml`, looked for in each given directory and then in any `*.method`
 * directory under it. `construction-entry-check` is handed the `.method` directory itself (it holds
 * `architecture.yaml`); `slot-wiring` only knows the project root. Both find the same file.
 */
export function findProjectFile(...dirs) {
  for (const dir of dirs) {
    if (!dir || !existsSync(dir)) continue;
    const direct = join(dir, 'project.yaml');
    if (existsSync(direct)) return direct;
    let entries = [];
    try { entries = readdirSync(dir).filter((e) => e.endsWith('.method')).sort(); }
    catch { continue; }
    for (const e of entries) {
      const p = join(dir, e, 'project.yaml');
      try { if (statSync(join(dir, e)).isDirectory() && existsSync(p)) return p; } catch { /* next */ }
    }
  }
  return undefined;
}

/** The project name a `project.yaml` states, with the field it came from — or undefined. */
export function projectName(projectFile) {
  let doc;
  try { doc = parse(readFileSync(projectFile, 'utf-8'), projectFile); }
  catch { return undefined; }              // unreadable is a fallback, never a refusal
  if (!doc || typeof doc !== 'object') return undefined;
  const scope = doc.project && typeof doc.project === 'object' ? doc.project : doc;
  const where = scope === doc ? "project.yaml" : "project.yaml 'project'";
  for (const key of ['name', 'projectName']) {
    const v = scope[key];
    if (typeof v === 'string' && v.trim()) return { root: v.trim(), source: `${where} '${key}'` };
  }
  return undefined;
}

/**
 * The root namespace, resolved. `fallback`/`fallbackSource` are the caller's last resort, named so
 * the printed provenance says which document was believed.
 */
export function resolveRoot({ company, searchDirs = [], fallback, fallbackSource }) {
  if (company) return { root: company, source: '--company' };
  const file = findProjectFile(...searchDirs);
  const named = file && projectName(file);
  if (named) return named;
  return { root: fallback, source: fallbackSource };
}

/**
 * THE SPEC COMPOSITION PROJECT — `Spec/<Root>.Spec.Composition` by default, and
 * `Spec/<Root>.SpecLayer.Composition` when THAT is what the tree carries (figaro#372 part 2).
 *
 * `<Root>.Spec.Composition` declares a namespace `<Root>.Spec`, and that name SHADOWS the spec
 * framework's own `TheAgent.Spec` for every authored spec that lives under `<Root>.…`: inside
 * `namespace Figaro.SpecLayer.Listing`, a `Spec.For<T>(…)` under `using TheAgent.Spec;` binds `Spec`
 * to the enclosing `Figaro.Spec` NAMESPACE rather than to the framework's `Spec` class. Measured
 * downstream: 100+ `CS0234: The type or namespace name 'For' does not exist in the namespace
 * 'Figaro.Spec'` in one build, across nearly every spec assembly. The golden corpus never showed it
 * because its authored specs sit in `ComandaSpecs`, whose parent is the global namespace.
 *
 * This resolves rather than renames. The default name is what every landed tree already carries, and
 * changing what the generator emits would move a project, a solution file and every `using` in it —
 * a downstream-breaking change, and not a checker's to make.
 */
export function specCompositionDir(csharpDir, root) {
  const spec = join(resolve(csharpDir), 'Spec');
  const alternative = join(spec, `${root}.SpecLayer.Composition`);
  if (existsSync(alternative)) return { dir: alternative, name: `${root}.SpecLayer.Composition`, alternative: true };
  return { dir: join(spec, `${root}.Spec.Composition`), name: `${root}.Spec.Composition`, alternative: false };
}

/**
 * Would emitting `<Root>.Spec.Composition` into this tree shadow `TheAgent.Spec`? True when a spec
 * source already sits in a namespace under `<Root>.` that is NOT itself `<Root>.Spec…`, and names
 * `Spec.` by its simple name — which is exactly the binding the C# compiler resolves to the wrong
 * `Spec`. Nothing is guessed beyond that: a tree with no such file is not warned about.
 */
export function specRootWouldShadow(csharpDir, root) {
  const spec = join(resolve(csharpDir), 'Spec');
  if (!existsSync(spec)) return [];
  const hits = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (e === 'bin' || e === 'obj' || e === 'node_modules') continue;
      const p = join(dir, e);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { walk(p); continue; }
      if (!e.endsWith('.cs')) continue;
      let src; try { src = readFileSync(p, 'utf-8'); } catch { continue; }
      const ns = (src.match(/^\s*namespace\s+([\w.]+)\s*[;{]/m) || [])[1];
      if (!ns || !ns.startsWith(`${root}.`) || ns === `${root}.Spec` || ns.startsWith(`${root}.Spec.`)) continue;
      if (/(^|[^.\w])Spec\s*\./.test(src.replace(/^\s*using\s[^\n]*$/gm, ''))) hits.push(p);
    }
  };
  walk(spec);
  return hits;
}
