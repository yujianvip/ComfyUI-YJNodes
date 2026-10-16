// Nodes 2.0 的公开对象优先；旧 LiteGraph 字段仅作为 Legacy Nodes 回退。
export function getActiveGraph(app) {
  return app?.canvas?.graph || app?.rootGraph || app?.graph || null;
}

export function getRootGraph(app) {
  return app?.rootGraph || app?.graph || app?.canvas?.graph || null;
}

function isGraphNode(item) {
  return Boolean(
    item &&
    item.id !== undefined &&
    (Array.isArray(item.inputs) || Array.isArray(item.outputs) || Array.isArray(item.widgets))
  );
}

export function getSelectedNodes(app) {
  const modernSelection = app?.canvas?.selectedItems;
  if (modernSelection && typeof modernSelection[Symbol.iterator] === "function") {
    return [...modernSelection].filter(isGraphNode);
  }
  return Object.values(app?.canvas?.selected_nodes || {}).filter(isGraphNode);
}

export function getGraphNodes(app, graph = getActiveGraph(app)) {
  return getGraphItems(graph).filter(isGraphNode);
}

export function getGraphItems(graph) {
  if (Array.isArray(graph?.nodes)) return graph.nodes;
  return Array.isArray(graph?._nodes) ? graph._nodes : [];
}

export function getGraphLink(graph, linkId) {
  if (linkId === null || linkId === undefined) return null;
  if (typeof graph?.getLink === "function") return graph.getLink(linkId) || null;
  if (typeof graph?.getLinkById === "function") return graph.getLinkById(linkId) || null;
  const links = graph?.links ?? graph?._links;
  return links instanceof Map ? links.get(linkId) || null : links?.[linkId] || null;
}

export function findGraphNodeById(graph, id, nodes = getGraphItems(graph)) {
  if (typeof graph?.getNodeById === "function") {
    const found = graph.getNodeById(id) || graph.getNodeById(Number(id));
    if (found) return found;
  }
  return nodes.find((node) => String(node?.id) === String(id)) || null;
}

export function getGraphGroups(graph) {
  if (Array.isArray(graph?.groups)) return graph.groups;
  return Array.isArray(graph?._groups) ? graph._groups : [];
}

export function getGraphItemBounds(item) {
  const bounds = item?.getBounding?.() || item?.boundingRect;
  const raw = bounds && bounds.length >= 4
    ? [bounds[0], bounds[1], bounds[2], bounds[3]]
    : bounds && "x" in bounds
      ? [bounds.x, bounds.y, bounds.width, bounds.height]
      : [item?.pos?.[0], item?.pos?.[1], item?.size?.[0], item?.size?.[1]];
  const result = raw.map(Number);
  return result.every(Number.isFinite) && result[2] > 0 && result[3] > 0 ? result : null;
}

export function beginGraphChange(app, graph = getActiveGraph(app)) {
  app?.canvas?.emitBeforeChange?.();
  if (typeof graph?.beforeChange === "function") graph.beforeChange();
  else graph?.change?.();
}

export function endGraphChange(app, graph = getActiveGraph(app)) {
  if (typeof graph?.afterChange === "function") graph.afterChange();
  else graph?.change?.();
  app?.canvas?.emitAfterChange?.();
  markGraphDirty(app, graph);
}

export function markGraphDirty(app, graph = getActiveGraph(app), node = null) {
  node?.setDirtyCanvas?.(true, true);
  graph?.setDirtyCanvas?.(true, true);
  app?.canvas?.setDirty?.(true, true);
}

export function findNodeById(app, id) {
  for (const graph of [getActiveGraph(app), getRootGraph(app)]) {
    if (!graph) continue;
    const node = typeof graph.getNodeById === "function"
      ? graph.getNodeById(id) || graph.getNodeById(Number(id))
      : (graph._nodes || []).find((item) => String(item.id) === String(id));
    if (node) return node;
  }
  return null;
}

export function focusNode(app, node) {
  const canvas = app?.canvas;
  if (!canvas || !node) return false;
  if (typeof canvas.selectItems === "function") canvas.selectItems([node]);
  else canvas.selectNode?.(node, false);
  canvas.centerOnNode?.(node);
  markGraphDirty(app, node.graph || getActiveGraph(app), node);
  return true;
}
