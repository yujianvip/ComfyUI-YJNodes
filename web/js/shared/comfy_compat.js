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
  if (Array.isArray(graph?.nodes)) return graph.nodes.filter(isGraphNode);
  return Array.isArray(graph?._nodes) ? graph._nodes.filter(isGraphNode) : [];
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
