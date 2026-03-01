const PREFIX = '[state-check]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entity = Record<string, any>;

/** Compare specific fields of a frontend entity against the backend version. */
export function checkEntity(type: string, id: string, frontend: Entity, backend: Entity, fields: string[]): string[] {
  const mismatches: string[] = [];
  for (const f of fields) {
    const fe = JSON.stringify(frontend[f]);
    const be = JSON.stringify(backend[f]);
    if (fe !== be) {
      const msg = `${type} ${id}: ${f} expected ${be} got ${fe}`;
      console.warn(`${PREFIX} ${msg}`);
      mismatches.push(msg);
    }
  }
  return mismatches;
}

/** Re-fetch the full list and compare against frontend state. */
export async function checkFullState(type: string, frontendList: Entity[], fetchFn: () => Promise<Entity[]>, idKey: string, fields: string[]): Promise<string[]> {
  const mismatches: string[] = [];
  const backendList = await fetchFn();
  const backendMap = new Map(backendList.map(e => [String(e[idKey]), e]));
  const frontendMap = new Map(frontendList.map(e => [String(e[idKey]), e]));
  for (const [id, fe] of frontendMap) {
    const be = backendMap.get(id);
    if (!be) {
      const msg = `${type} ${id}: exists in frontend but not backend`;
      console.warn(`${PREFIX} ${msg}`);
      mismatches.push(msg);
      continue;
    }
    mismatches.push(...checkEntity(type, id, fe, be, fields));
  }
  for (const id of backendMap.keys()) {
    if (!frontendMap.has(id)) {
      const msg = `${type} ${id}: exists in backend but not frontend`;
      console.warn(`${PREFIX} ${msg}`);
      mismatches.push(msg);
    }
  }
  return mismatches;
}
