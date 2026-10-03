// resource-danger — the DANGER CLASSES of `resource-protocol/1` (ADR-059), in one place.
//
// The Software Architect's Gate-3 review question is "what can wipe data" (ruling 2026-08-23,
// #969). A danger class is therefore defined by one property, not by its spelling:
//
//     an effect class is a DANGER CLASS when invoking it DESTROYS CONTENT THAT WAS ALREADY
//     STORED — content a later read would otherwise still have found.
//
// That is why a File-kind `rewrite` is on the list beside `delete` (#977): overwriting a file
// destroys everything the file held, which answers the SA's question exactly as a row deletion
// does. `append` and `read` do not; `update`/`upsert`/`insert` replace or add a value the design
// says they own, they do not remove content the design meant to keep. `ddl` is on the list
// because a schema change can drop a table whole.
//
// TWO CONSUMERS, ONE TABLE — deliberately (#977). `resource-protocol.mjs --check` reports the
// danger-class operations and who may invoke them, and the gate dossier renders the same
// crossing as "What can delete data" on the Gate-3 page. The reviewed list and the reported list
// must be the same list; two copies of this table would be a mirror nothing checks, which is the
// #797 disease ADR-059 exists to end.
//
// A NEW RESOURCE KIND OWES AN ANSWER HERE. Adding a kind means stating which of its classes
// destroy stored content — the table below is exhaustive by construction, and a kind that is
// absent from it is treated as unknown, not as safe (see `dangerClassesFor`).
// The format spec states the same table in prose: process-specs/resource-protocol-format.md,
// "Effect classes and shape vocabulary per resourceKind".

/** resourceKind → the effect classes that destroy content already stored. */
export const DANGER_CLASSES = {
  RelationalDB: ['delete', 'ddl'],
  DocumentDB: ['delete'],
  RestApi: ['DELETE'],
  File: ['rewrite', 'delete'],
}

/** The shape section a kind speaks in — the one key a sheet alone carries, so a reader holding
 *  only the sheet (the dossier) can still name the kind. */
export const KIND_BY_SHAPE_KEY = {
  tables: 'RelationalDB',
  collections: 'DocumentDB',
  endpoints: 'RestApi',
  files: 'File',
}

/** Every danger class of every kind — the fallback set when the kind cannot be determined. */
export const ALL_DANGER_CLASSES = [...new Set(Object.values(DANGER_CLASSES).flat())]

/** The kind a sheet's `shape:` section speaks, or null when it speaks none this format knows. */
export function kindOfShape (shape) {
  if (!shape || typeof shape !== 'object') return null
  for (const [key, kind] of Object.entries(KIND_BY_SHAPE_KEY)) {
    const v = shape[key]
    if (Array.isArray(v) ? v.length : v) return kind
  }
  return null
}

/**
 * The danger classes of a kind. An unknown kind falls back to the union of every kind's danger
 * classes — never to the empty set: "the kind is not in my table" must not read as "nothing here
 * can wipe data" on a review surface.
 */
export function dangerClassesFor (kind) {
  return DANGER_CLASSES[kind] ?? ALL_DANGER_CLASSES
}

/** Does this operation's effect class destroy stored content? Case-insensitive, because the
 *  RestApi vocabulary spells its class `DELETE` and a sheet is authored by hand. */
export function isDangerEffect (effect, kind) {
  const e = String(effect ?? '').trim().toLowerCase()
  return dangerClassesFor(kind).some(d => d.toLowerCase() === e)
}
