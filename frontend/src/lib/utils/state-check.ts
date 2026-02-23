const PREFIX = '[state-check]';

/** Returns true when running with mock bindings (Vitest / Vite dev). */
export function isTestMode(): boolean {
  return !window.go?.main?.App;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entity = Record<string, any>;

/** Compare specific fields of a frontend entity against the backend version. */
export function checkEntity(type: string, id: string, frontend: Entity, backend: Entity, fields: string[]): void {
  for (const f of fields) {
    const fe = JSON.stringify(frontend[f]);
    const be = JSON.stringify(backend[f]);
    if (fe !== be) console.warn(`${PREFIX} ${type} ${id}: ${f} expected ${be} got ${fe}`);
  }
}

/** In test mode, re-fetch the full list and compare against frontend state. */
export async function checkFullState(type: string, frontendList: Entity[], fetchFn: () => Promise<Entity[]>, idKey: string, fields: string[]): Promise<void> {
  if (!isTestMode()) return;
  const backendList = await fetchFn();
  const backendMap = new Map(backendList.map(e => [String(e[idKey]), e]));
  const frontendMap = new Map(frontendList.map(e => [String(e[idKey]), e]));
  for (const [id, fe] of frontendMap) {
    const be = backendMap.get(id);
    if (!be) { console.warn(`${PREFIX} ${type} ${id}: exists in frontend but not backend`); continue; }
    checkEntity(type, id, fe, be, fields);
  }
  for (const id of backendMap.keys()) {
    if (!frontendMap.has(id)) console.warn(`${PREFIX} ${type} ${id}: exists in backend but not frontend`);
  }
}
