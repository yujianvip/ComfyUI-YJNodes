export const PAUSE_NODE_TYPE = "YJpause";

export function isPauseNode(node) {
  return node?.type === PAUSE_NODE_TYPE
    || node?.constructor?.comfyClass === PAUSE_NODE_TYPE
    || node?.constructor?.nodeData?.name === PAUSE_NODE_TYPE;
}

function graphLink(graph, linkId) {
  if (linkId === null || linkId === undefined) return null;
  if (typeof graph?.getLinkById === "function") return graph.getLinkById(linkId);
  if (graph?.links instanceof Map) return graph.links.get(linkId) || null;
  return graph?.links?.[linkId] || null;
}

function graphNode(graph, nodeId) {
  if (typeof graph?.getNodeById === "function") return graph.getNodeById(nodeId);
  return (graph?._nodes || []).find((node) => String(node.id) === String(nodeId)) || null;
}

function linkOriginId(link) {
  return link?.origin_id ?? link?.originId;
}

function linkOriginSlot(link) {
  return link?.origin_slot ?? link?.originSlot;
}

function linkTargetId(link) {
  return link?.target_id ?? link?.targetId;
}

function linkTargetSlot(link) {
  return link?.target_slot ?? link?.targetSlot;
}

export function inferPauseConnectionType(node, graph = node?.graph) {
  const inputLink = graphLink(graph, node?.inputs?.[0]?.link);
  if (inputLink) {
    const origin = graphNode(graph, linkOriginId(inputLink));
    const type = origin?.outputs?.[Number(linkOriginSlot(inputLink))]?.type || inputLink.type;
    if (type && type !== "*") return type;
  }

  for (const linkId of node?.outputs?.[0]?.links || []) {
    const link = graphLink(graph, linkId);
    const target = graphNode(graph, linkTargetId(link));
    const type = target?.inputs?.[Number(linkTargetSlot(link))]?.type || link?.type;
    if (type && type !== "*") return type;
  }
  return "*";
}

export function syncPauseConnectionType(node, graph = node?.graph) {
  if (!isPauseNode(node) || !node.inputs?.[0] || !node.outputs?.[0]) return "*";
  const type = inferPauseConnectionType(node, graph);
  node.inputs[0].type = type;
  node.outputs[0].type = type;
  return type;
}

export function normalizePauseState(value) {
  if (!value || typeof value !== "object") return null;
  const state = String(value.state || "");
  const sessionId = String(value.session_id || "");
  const nodeId = String(value.node_id ?? "");
  if (!state || !sessionId || !nodeId) return null;
  const remaining = value.remaining_seconds;
  return {
    ...value,
    state,
    session_id: sessionId,
    node_id: nodeId,
    prompt_id: String(value.prompt_id || ""),
    timeout_minutes: Math.max(0, Number(value.timeout_minutes) || 0),
    remaining_seconds: remaining === null || remaining === undefined
      ? null
      : Math.max(0, Number(remaining) || 0),
  };
}

export function formatRemaining(seconds) {
  if (seconds === null || seconds === undefined) return null;
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
