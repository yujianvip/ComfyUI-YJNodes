import { app } from "../../../../scripts/app.js";
import { getActiveGraph, markGraphDirty } from "../shared/comfy_compat.js";
import { getCurrentLanguage } from "../shared/i18n.js";
import { isDynamicImageConcatNode, syncDynamicInputs } from "./dynamic_image_concat_core.js";

const CONNECTION_HANDLER = Symbol.for("ComfyUI-YJNodes.DynamicImageConcatConnectionHandler");

function refreshNode(node) {
  let changed = syncDynamicInputs(node);
  const language = getCurrentLanguage(app);
  for (const input of node.inputs || []) {
    const number = Number(/^image(\d+)$/.exec(input.name)?.[1]);
    if (!Number.isInteger(number)) continue;
    if (number < 3 || number > 20) continue;
    const label = language === "zh" ? `图片 ${number}` : `Image ${number}`;
    if (input.label !== label) {
      input.label = label;
      changed = true;
    }
  }
  if (changed) markGraphDirty(app, node.graph || getActiveGraph(app), node);
}

function attachNode(node) {
  if (!isDynamicImageConcatNode(node) || node[CONNECTION_HANDLER]) return;
  const original = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) {
    const result = original?.apply(this, args);
    setTimeout(() => refreshNode(this), 0);
    return result;
  };
  node[CONNECTION_HANDLER] = true;
  setTimeout(() => refreshNode(node), 0);
}

app.registerExtension({
  name: "ComfyUI-YJNodes.DynamicImageConcat",
  nodeCreated: attachNode,
  loadedGraphNode: attachNode,
});
