// 与界面无关的纯逻辑集中在这里，便于独立测试。
function nodeTypeAndTitle(node) {
  return {
    type: String(node?.type || "").toLowerCase(),
    title: String(node?.title || "").toLowerCase(),
  };
}

export function isSetNode(node) {
  const { type, title } = nodeTypeAndTitle(node);
  return (
    type.includes("setnode") ||
    (type.includes("set") && type.includes("node") && title.includes("set"))
  );
}

export function isGetNode(node) {
  const { type, title } = nodeTypeAndTitle(node);
  return (
    type.includes("getnode") ||
    (type.includes("get") && type.includes("node") && title.includes("get"))
  );
}

export function getVariableName(node) {
  for (const widget of node?.widgets || []) {
    if (widget?.type === "text" || typeof widget?.value === "string") {
      return widget.value;
    }
  }
  return null;
}

export function getGraphLink(graph, linkId) {
  if (linkId === null || linkId === undefined) return null;
  if (graph?.links instanceof Map) return graph.links.get(linkId) || null;
  return graph?.links?.[linkId] || null;
}

function getNodeById(graph, nodeId) {
  if (typeof graph?.getNodeById === "function") {
    return graph.getNodeById(nodeId);
  }
  return (graph?._nodes || []).find(
    (node) => String(node?.id) === String(nodeId),
  );
}

export function buildResolverPlan(graph) {
  const setNodes = [];
  const getNodes = [];

  for (const node of graph?._nodes || []) {
    if (isSetNode(node)) setNodes.push(node);
    else if (isGetNode(node)) getNodes.push(node);
  }

  const setGroups = new Map();
  const variables = new Map();
  for (const setNode of setNodes) {
    const variableName = getVariableName(setNode);
    if (!variableName) continue;

    const sameNameSets = setGroups.get(variableName) || [];
    sameNameSets.push(setNode);
    setGroups.set(variableName, sameNameSets);

    const linkId = setNode?.inputs?.[0]?.link;
    const link = getGraphLink(graph, linkId);
    if (!link) continue;

    const sourceNode = getNodeById(graph, link.origin_id);
    if (!sourceNode) continue;
    const sources = variables.get(variableName) || [];
    sources.push({
      sourceNode,
      sourceSlot: link.origin_slot,
      setNode,
    });
    variables.set(variableName, sources);
  }

  const operations = [];
  const nodesToDelete = new Set();
  const conflicts = new Map();
  for (const getNode of getNodes) {
    const variableName = getVariableName(getNode);
    const sameNameSets = setGroups.get(variableName);
    if (!variableName || !sameNameSets) continue;

    if (sameNameSets.length > 1) {
      if (!conflicts.has(variableName)) {
        conflicts.set(variableName, {
          variableName,
          setNodes: sameNameSets,
          getNodes: [],
        });
      }
      conflicts.get(variableName).getNodes.push(getNode);
      continue;
    }

    const sources = variables.get(variableName);
    if (!sources) continue;

    const source = sources[0];

    operations.push({
      getNode,
      sourceNode: source.sourceNode,
      sourceSlot: source.sourceSlot,
    });
    nodesToDelete.add(getNode);
    nodesToDelete.add(source.setNode);
  }

  return {
    setNodes,
    getNodes,
    operations,
    nodesToDelete,
    conflicts: [...conflicts.values()],
  };
}

export function collectTargets(graph, getNode) {
  const targets = [];
  const linkIds = [...(getNode?.outputs?.[0]?.links || [])];
  for (const linkId of linkIds) {
    const link = getGraphLink(graph, linkId);
    if (!link) continue;
    const targetNode = getNodeById(graph, link.target_id);
    if (!targetNode) continue;
    targets.push({ targetNode, targetSlot: link.target_slot });
  }
  return targets;
}

export function graphHasSubgraphs(graph) {
  const serialized = graph?.serialize?.() || {};
  return Boolean(
    graph?._subgraphs?.length ||
    graph?.subgraphs?.length ||
    serialized?.subgraphs?.length ||
    serialized?.definitions?.subgraphs?.length
  );
}

export function applyResolverOperations(graph, operations, nodesToDelete = null) {
  let connectedCount = 0;
  const completed = [];
  try {
    for (const operation of operations) {
      const targets = collectTargets(graph, operation.getNode);
      for (const { targetNode, targetSlot } of targets) {
        const link = operation.sourceNode.connect(
          operation.sourceSlot,
          targetNode,
          targetSlot,
        );
        if (link === null || link === false || link === undefined) {
          throw new Error(
            `无法连接节点 #${operation.sourceNode.id} 到 #${targetNode.id} 的输入 ${targetSlot}`,
          );
        }
        completed.push({ operation, targetNode, targetSlot });
        connectedCount += 1;
      }
    }
  } catch (error) {
    // connect 会替换目标输入上的原 Get 连线；失败时按逆序恢复原连接。
    for (const { operation, targetNode, targetSlot } of completed.reverse()) {
      operation.getNode.connect(0, targetNode, targetSlot);
    }
    throw error;
  }

  if (nodesToDelete) {
    for (const node of nodesToDelete) graph.remove(node);
  }
  return connectedCount;
}
