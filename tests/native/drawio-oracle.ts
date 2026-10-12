import { GraphDataModel, ModelXmlSerializer } from '@maxgraph/core';

/** Actual maxgraph mxGraph-compatible model import, without an adapter-side parser. */
export function getDrawioNativeSummary(modelXML: string) {
  const model = new GraphDataModel();
  new ModelXmlSerializer(model).import(modelXML);
  return Object.values(model.cells ?? {}).map((cell) => {
    const value = cell.getValue();
    const geometry = cell.getGeometry();
    return { id: cell.getId(), parent: cell.getParent()?.getId() ?? null,
      vertex: cell.isVertex(), edge: cell.isEdge(), source: cell.getTerminal(true)?.getId() ?? null, target: cell.getTerminal(false)?.getId() ?? null,
      value: value instanceof Element ? { element: value.tagName, attributes: Object.fromEntries([...value.attributes].map((attribute) => [attribute.name, attribute.value])) } : value,
      style: cell.getStyle(), geometry: geometry ? { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, relative: geometry.relative,
        offset: geometry.offset ? { x: geometry.offset.x, y: geometry.offset.y } : null,
        points: geometry.points?.map((point) => ({ x: point.x, y: point.y })) ?? null } : null };
  });
}
