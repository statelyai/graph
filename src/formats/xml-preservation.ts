/** Private, JSON-safe provenance. This is not a source-document/CST API. */
export function getFormatMetadata(data: unknown, format: string): Record<string, any> | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const metadata = (data as Record<string, any>)[`_${format}`];
  return metadata?.format === `@statelyai/graph/${format}` && metadata.version === 1
    ? metadata
    : undefined;
}

export function getUserData(data: unknown, format: string): any {
  const metadata = getFormatMetadata(data, format);
  if (!metadata) return data;
  if (metadata.wrapped) return metadata.userData;
  const value = { ...(data as Record<string, any>) };
  delete value[`_${format}`];
  return metadata.absent && Object.keys(value).length === 0 ? undefined : value;
}

export function createFormatData(data: unknown, format: string, metadata: Record<string, any>): any {
  if (Object.keys(metadata).length === 0) return data;
  const key = `_${format}`;
  const header = { format: `@statelyai/graph/${format}`, version: 1, ...metadata };
  if (data === undefined) return { [key]: { ...header, absent: true } };
  if (data !== null && typeof data === 'object' && !Array.isArray(data) && !(key in data)) {
    return { ...data, [key]: header };
  }
  // Scalars and foreign reserved-key payloads are never discarded or spread.
  return { [key]: { ...header, wrapped: true, userData: data } };
}

/** Normalize only elements bound to the expected namespaces; accept legacy unqualified XML. */
export function getNormalizedXML(value: any, namespace: string): any {
  const output: any = {};
  const pending = [{ input: value, output, bindings: {} as Record<string, string>, name:'' }];
  while (pending.length) {
    const frame = pending.pop()!;
    const bindings = { ...frame.bindings };
    for (const [key, val] of Object.entries(frame.input)) {
      if (key === '@_xmlns') bindings[''] = String(val);
      else if (key.startsWith('@_xmlns:')) bindings[key.slice(8)] = String(val);
    }
    if (['data','key','meta'].includes(frame.name.split(':').pop()!)) {
      for (const [prefix,uri] of Object.entries(bindings)) if (prefix) frame.output[`@_xmlns:${prefix}`] = uri;
    }
    for (const [key, val] of Object.entries(frame.input)) {
      let name = key;
      if (!key.startsWith('@_') && !key.startsWith('#') && !key.startsWith('?')) {
        const colon = key.indexOf(':');
        const prefix = colon < 0 ? '' : key.slice(0, colon);
        const local = colon < 0 ? key : key.slice(colon + 1);
        const child = Array.isArray(val) ? val[0] : val;
        const uri = child && typeof child === 'object'
          ? child[prefix ? `@_xmlns:${prefix}` : '@_xmlns'] ?? bindings[prefix]
          : bindings[prefix];
        if (uri === namespace || (colon < 0 && uri === undefined)) name = local;
        else if (uri === 'http://gexf.net/1.3/viz' || uri === 'http://gexf.net/1.2draft/viz' || uri === 'http://www.gexf.net/1.2draft/viz') name = `viz:${local}`;
        else if (colon < 0 && uri !== undefined) name = `{${uri}}${local}`;
      }
      if (Array.isArray(val)) {
        const children: any[] = [];
        frame.output[name] = children;
        for (const child of val) {
          if (child && typeof child === 'object') {
            const next = {};
            children.push(next);
            pending.push({ input: child, output: next, bindings, name });
          } else children.push(child);
        }
      } else if (val && typeof val === 'object') {
        const next = {};
        frame.output[name] = next;
        pending.push({ input: val, output: next, bindings, name });
      } else frame.output[name] = val;
    }
  }
  return output;
}

/** Re-emit preserved unknown XML with its local namespace declarations. */
export function getNativeXML(value: any): any {
  if (!value || typeof value !== 'object') return value;
  const output: any = Array.isArray(value) ? [] : {};
  const pending = [{input:value,output}];
  while (pending.length) {
    const current = pending.pop()!;
    for (const [key,child] of Object.entries(current.input)) {
      const name = key.replace(/^\{[^}]+\}/,'');
      if (child && typeof child === 'object') {
        const next: any = Array.isArray(child) ? [] : {};
        current.output[name] = next;
        pending.push({input:child,output:next});
      } else current.output[name] = child;
    }
  }
  return output;
}
