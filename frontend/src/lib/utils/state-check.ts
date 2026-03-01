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

/** Group entity IDs by a key function. */
function groupIds(list: Entity[], idKey: string, groupByFn: (e: Entity) => string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const e of list) {
    const zone = groupByFn(e);
    const ids = groups.get(zone);
    if (ids) ids.push(String(e[idKey]));
    else groups.set(zone, [String(e[idKey])]);
  }
  return groups;
}

/** Compare frontend and backend entity lists without fetching. */
export function checkStateFromData(type: string, frontendList: Entity[], backendList: Entity[], idKey: string, fields: string[], groupByFn?: (e: Entity) => string): string[] {
  const mismatches: string[] = [];
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
  // Compare ID order
  if (groupByFn) {
    const feGroups = groupIds(frontendList, idKey, groupByFn);
    const beGroups = groupIds(backendList, idKey, groupByFn);
    const allZones = new Set([...feGroups.keys(), ...beGroups.keys()]);
    for (const zone of allZones) {
      const feIds = feGroups.get(zone) ?? [];
      const beIds = beGroups.get(zone) ?? [];
      if (feIds.length === beIds.length && feIds.some((id, i) => id !== beIds[i])) {
        const msg = `${type} order mismatch in zone ${zone}: frontend [${feIds.join(',')}] vs backend [${beIds.join(',')}]`;
        console.warn(`${PREFIX} ${msg}`);
        mismatches.push(msg);
      }
    }
  } else {
    const frontendIds = frontendList.map(e => String(e[idKey]));
    const backendIds = backendList.map(e => String(e[idKey]));
    if (frontendIds.length === backendIds.length && frontendIds.some((id, i) => id !== backendIds[i])) {
      const msg = `${type} order mismatch: frontend [${frontendIds.join(',')}] vs backend [${backendIds.join(',')}]`;
      console.warn(`${PREFIX} ${msg}`);
      mismatches.push(msg);
    }
  }
  return mismatches;
}

/** Re-fetch the full list and compare against frontend state. */
export async function checkFullState(type: string, frontendList: Entity[], fetchFn: () => Promise<Entity[]>, idKey: string, fields: string[], groupByFn?: (e: Entity) => string): Promise<string[]> {
  const backendList = await fetchFn();
  return checkStateFromData(type, frontendList, backendList, idKey, fields, groupByFn);
}
