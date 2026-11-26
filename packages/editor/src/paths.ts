export type Path = readonly (string | number)[];

export function getAt(root: unknown, path: Path): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/** Immutable set: copies only the objects along the path. Passing `undefined` removes an object key. */
export function setAt<T>(root: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  const base = (root !== null && typeof root === 'object' ? root : typeof head === 'number' ? [] : {}) as Record<string | number, unknown>;
  const child = setAt(base[head], rest, value);
  if (Array.isArray(base)) {
    const copy = base.slice();
    copy[head as number] = child;
    return copy as unknown as T;
  }
  const copy: Record<string | number, unknown> = { ...base };
  if (child === undefined && rest.length === 0) delete copy[head];
  else copy[head] = child;
  return copy as T;
}

export function removeAt<T>(root: T, path: Path): T {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const last = path[path.length - 1]!;
  const parent = getAt(root, parentPath);
  if (Array.isArray(parent) && typeof last === 'number') {
    return setAt(root, parentPath, parent.filter((_, i) => i !== last));
  }
  return setAt(root, path, undefined);
}

export function pathKey(path: Path): string {
  return path.join('.');
}
