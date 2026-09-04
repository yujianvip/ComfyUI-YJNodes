export const NODE_TYPE = "YJDynamicImageBatchConcat";
const INPUT_PREFIX = "image";
const MAX_INPUTS = 20;
const SYNCING_KEY = Symbol.for("ComfyUI-YJNodes.dynamicImageConcatSyncing");

export function isDynamicImageConcatNode(node) {
  return (
    node?.constructor?.comfyClass === NODE_TYPE ||
    node?.comfyClass === NODE_TYPE ||
    node?.type === NODE_TYPE
  );
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
  if (index >= 0) node.removeInput(index);
}

export function syncDynamicInputs(node) {
  if (!isDynamicImageConcatNode(node) || node[SYNCING_KEY]) return false;
  node[SYNCING_KEY] = true;

  try {
    const before = imageInputs(node).map(({ input }) => input.name).join("\0");
    const linkedNumbers = imageInputs(node)
      .filter(({ input }) => hasLink(input))
      .map(({ number }) => number);
    const lastLinked = Math.max(1, ...linkedNumbers);
    const targetLast = Math.min(MAX_INPUTS, lastLinked + 1);

    for (let number = 1; number <= targetLast; number += 1) addImageInput(node, number);
    for (const { input, number } of imageInputs(node).reverse()) {
      if (number <= 1 || number <= targetLast || hasLink(input)) continue;
      removeInputByName(node, input.name);
    }

    node.setSize?.(node.computeSize?.() || node.size);
    const after = imageInputs(node).map(({ input }) => input.name).join("\0");
    return before !== after;
  } finally {
    node[SYNCING_KEY] = false;
  }
}
