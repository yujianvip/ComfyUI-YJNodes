// 与界面无关的纯逻辑集中在这里，便于独立测试。
import { findGraphNodeById, getGraphItems, getGraphLink as getCompatibleGraphLink } from "../../shared/comfy_compat.js";

function isKJNodeType(node, expected) {
  // 标题可由用户修改；只接受 KJNodes 注册的稳定类型名。
  return node?.type === expected || node?.constructor?.comfyClass === expected;
}

export function isSetNode(node) {
  return isKJNodeType(node, "SetNode");
}

export function isGetNode(node) {
  return isKJNodeType(node, "GetNode");
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
  return getCompatibleGraphLink(graph, linkId);
}

export function buildResolverPlan(graph, nodes = getGraphItems(graph)) {
  const setNodes = [];
  const getNodes = [];

  for (const node of nodes) {
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

    const sourceNode = findGraphNodeById(graph, link.origin_id ?? link.originId, nodes);
    if (!sourceNode) continue;
    const sources = variables.get(variableName) || [];
    sources.push({
      sourceNode,
      sourceSlot: link.origin_slot ?? link.originSlot,
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
      setNode: source.setNode,
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
    const targetNode = findGraphNodeById(graph, link.target_id ?? link.targetId);
    if (!targetNode) continue;
    targets.push({ targetNode, targetSlot: link.target_slot ?? link.targetSlot });
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

function restoreOriginalLinks(graph, changes) {
  const errors = [];
  for (const change of [...changes].reverse()) {
    if (!change.attempted) continue;
    const input = change.targetNode.inputs?.[change.targetSlot];
    const wasChanged = input && "link" in input
      ? input.link !== change.originalLinkId || !getGraphLink(graph, change.originalLinkId)
      : change.succeeded;
    if (!wasChanged) continue;
    try {
      const restored = change.originalNode.connect(change.originalSlot, change.targetNode, change.targetSlot);
      if (restored === null || restored === false || restored === undefined) {
        throw new Error(`无法恢复节点 #${change.targetNode.id} 的输入 ${change.targetSlot}`);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function restoreDeletedNodes(graph, nodesToDelete, setInputs) {
  const errors = [];
  for (const node of nodesToDelete) {
    if (getGraphItems(graph).includes(node) || findGraphNodeById(graph, node.id) === node) continue;
    try {
      if (typeof graph?.add !== "function") throw new Error("图不支持重新添加节点");
      graph.add(node);
      if (!getGraphItems(graph).includes(node) && findGraphNodeById(graph, node.id) !== node) {
        throw new Error(`节点 #${node.id} 未能重新加入图`);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  for (const { setNode, sourceNode, sourceSlot, originalLinkId } of setInputs) {
    if (setNode.inputs?.[0]?.link === originalLinkId && getGraphLink(graph, originalLinkId)) continue;
    try {
      const restored = sourceNode.connect(sourceSlot, setNode, 0);
      if (restored === null || restored === false || restored === undefined) {
        throw new Error(`无法恢复 Set 节点 #${setNode.id} 的输入`);
      }
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

export function applyResolverOperations(graph, operations, nodesToDelete = null) {
  let connectedCount = 0;
  if (nodesToDelete && operations.some(({ sourceNode }) => nodesToDelete.has(sourceNode))) {
    throw new Error("Set 节点互相串接，不能安全删除；请使用仅连线模式");
  }
  const jobs = operations.map((operation) => ({ ...operation, outputNode: operation.getNode }));
  if (nodesToDelete) {
    const visitedSets = new Set();
    for (const operation of operations) {
      const setNode = operation.setNode || [...nodesToDelete].find((node) => isSetNode(node) && getVariableName(node) === getVariableName(operation.getNode));
      if (!setNode || visitedSets.has(setNode)) continue;
      visitedSets.add(setNode);
      jobs.push({ ...operation, outputNode: setNode });
    }
  }
  // 连线前先保存全部目标，避免 connect 修改输出 links 后漏掉后续目标。
  const changes = jobs.flatMap((job) => collectTargets(graph, job.outputNode).map(({ targetNode, targetSlot }) => {
    const input = targetNode.inputs?.[targetSlot];
    const originalLinkId = input?.link;
    const originalLink = getGraphLink(graph, originalLinkId);
    return {
      ...job, targetNode, targetSlot, originalLinkId,
      originalNode: findGraphNodeById(graph, originalLink?.origin_id ?? originalLink?.originId) || job.outputNode,
      originalSlot: originalLink?.origin_slot ?? originalLink?.originSlot ?? 0,
      attempted: false, succeeded: false,
    };
  }));
  const setInputs = nodesToDelete ? [...new Set(operations.map((item) => item.setNode).filter(Boolean))]
    .map((setNode) => {
      const operation = operations.find((item) => item.setNode === setNode);
      return { setNode, sourceNode: operation.sourceNode, sourceSlot: operation.sourceSlot, originalLinkId: setNode.inputs?.[0]?.link };
    }) : [];
  let deletionStarted = false;
  try {
    for (const change of changes) {
      change.attempted = true;
      const link = change.sourceNode.connect(change.sourceSlot, change.targetNode, change.targetSlot);
      if (link === null || link === false || link === undefined) {
        throw new Error(
          `无法连接节点 #${change.sourceNode.id} 到 #${change.targetNode.id} 的输入 ${change.targetSlot}`,
        );
      }
      change.succeeded = true;
      connectedCount += 1;
    }
    if (nodesToDelete) {
      deletionStarted = true;
      for (const node of nodesToDelete) graph.remove(node);
    }
  } catch (error) {
    const rollbackErrors = deletionStarted ? restoreDeletedNodes(graph, nodesToDelete, setInputs) : [];
    rollbackErrors.push(...restoreOriginalLinks(graph, changes));
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], "转换失败，且部分原连线未能恢复；请检查工作流");
    }
    throw error;
  }
  return connectedCount;
}
