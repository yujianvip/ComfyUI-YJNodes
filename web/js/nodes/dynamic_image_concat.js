import { app } from "../../../../scripts/app.js";

const NODE_TYPE = "YJDynamicImageBatchConcat";
const INPUT_PREFIX = "image";
const MAX_INPUTS = 20;

function isTargetNode(node) {
  return node?.comfyClass === NODE_TYPE || node?.type === NODE_TYPE || node?.constructor?.comfyClass === NODE_TYPE;
}

function imageInputNumber(input) {
  const match = String(input?.name || "").match(/^image(\d+)$/);
  return match ? Number(match[1]) : null;
}

function imageInputs(node) {
  return (node.inputs || [])
    .map((input, index) => ({ input, index, number: imageInputNumber(input) }))
    .filter((item) => item.number !== null)
    .sort((a, b) => a.number - b.number);
}

function hasLink(input) {
  return input?.link !== null && input?.link !== undefined;
}

function addImageInput(node, number) {
  if (!node.inputs?.some((input) => input.name === `${INPUT_PREFIX}${number}`)) {
    node.addInput(`${INPUT_PREFIX}${number}`, "IMAGE");
  }
}

function removeInputByName(node, name) {
  const index = node.inputs?.findIndex((input) => input.name === name);
  if (index >= 0) {
    node.removeInput(index);
  }
}

function syncDynamicInputs(node) {
  if (!isTargetNode(node) || node.__yjSyncingInputs) return;
  node.__yjSyncingInputs = true;

  try {
    const inputs = imageInputs(node);
    const linkedNumbers = inputs
      .filter(({ input }) => hasLink(input))
      .map(({ number }) => number);
    const lastLinked = Math.max(1, ...linkedNumbers);
    const targetLast = Math.min(MAX_INPUTS, lastLinked + 1);

    for (let number = 1; number <= targetLast; number += 1) {
      addImageInput(node, number);
    }

    for (const { input, number } of imageInputs(node).reverse()) {
      if (number <= 1) continue;
      if (number <= targetLast) continue;
      if (hasLink(input)) continue;
      removeInputByName(node, input.name);
    }

    node.setSize?.(node.computeSize?.() || node.size);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
  } finally {
    node.__yjSyncingInputs = false;
  }
}

function wrapConnectionHandler(node) {
  if (node.__yjDynamicConcatWrapped) return;
  node.__yjDynamicConcatWrapped = true;

  const original = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) {
    const result = original?.apply(this, args);
    setTimeout(() => syncDynamicInputs(this), 0);
    return result;
  };
}

app.registerExtension({
  name: "ComfyUI-YJNodes.DynamicImageConcat",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_TYPE) return;
    if (nodeType.prototype.__yjDynamicConcatWrapped) return;
    const original = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function (...args) {
      const result = original?.apply(this, args);
      setTimeout(() => syncDynamicInputs(this), 0);
      return result;
    };
    nodeType.prototype.__yjDynamicConcatWrapped = true;
  },
  nodeCreated(node) {
    if (!isTargetNode(node)) return;
    wrapConnectionHandler(node);
    setTimeout(() => syncDynamicInputs(node), 0);
  },
  loadedGraphNode(node) {
    if (!isTargetNode(node)) return;
    wrapConnectionHandler(node);
    setTimeout(() => syncDynamicInputs(node), 0);
  },
});
