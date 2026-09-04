// 与界面无关的纯逻辑集中在这里，便于独立测试。
const MODEL_FILE_EXTENSIONS = [
  ".safetensors", ".ckpt", ".pt", ".pt2", ".pth", ".bin", ".pkl", ".sft",
  ".gguf", ".onnx", ".engine",
];

const WIDGET_NAME_TYPES = new Map([
  ["ckpt_name", ["checkpoints"]],
  ["checkpoint_name", ["checkpoints"]],
  ["lora_name", ["loras"]],
  ["vae_name", ["vae"]],
  ["unet_name", ["diffusion_models", "unet"]],
  ["diffusion_model_name", ["diffusion_models", "unet"]],
  ["clip_name", ["text_encoders", "clip"]],
  ["clip_name1", ["text_encoders", "clip"]],
  ["clip_name2", ["text_encoders", "clip"]],
  ["clip_name3", ["text_encoders", "clip"]],
  ["clip_name4", ["text_encoders", "clip"]],
  ["text_encoder_name", ["text_encoders", "clip"]],
  ["clip_vision_name", ["clip_vision"]],
  ["control_net_name", ["controlnet"]],
  ["controlnet_name", ["controlnet"]],
  ["upscale_model", ["upscale_models"]],
  ["upscale_model_name", ["upscale_models"]],
  ["style_model_name", ["style_models"]],
  ["gligen_name", ["gligen"]],
  ["photomaker_model_name", ["photomaker"]],
  ["hypernetwork_name", ["hypernetworks"]],
  ["audio_encoder_name", ["audio_encoders"]],
]);

const NODE_TYPE_PATTERNS = [
  [/clip.?vision/i, "clip_vision"],
  [/control.?net/i, "controlnet"],
  [/text.?encoder/i, "text_encoders"],
  [/checkpoint|ckpt/i, "checkpoints"],
  [/diffusion|unet/i, "diffusion_models"],
  [/upscale/i, "upscale_models"],
  [/audio.?encoder/i, "audio_encoders"],
  [/frame.?interpolation/i, "frame_interpolation"],
  [/hypernetwork/i, "hypernetworks"],
  [/photomaker/i, "photomaker"],
  [/lora/i, "loras"],
  [/vae/i, "vae"],
  [/clip/i, "text_encoders"],
];

function normalizeModelName(value) {
  return String(value ?? "").trim().replaceAll("\\", "/").toLowerCase();
}

function normalizeIdentifier(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function registryContainsNodeType(registeredNodeTypes, nodeType) {
  if (!registeredNodeTypes || !nodeType) return null;
  if (registeredNodeTypes instanceof Set || registeredNodeTypes instanceof Map) {
    return registeredNodeTypes.has(nodeType);
  }
  return Object.prototype.hasOwnProperty.call(registeredNodeTypes, nodeType);
}

function isUnknownNode(node, serializedNode, registeredNodeTypes) {
  if (String(node?.type || "").toUpperCase() === "UNKNOWN") return true;
  const originalType = serializedNode?.type || node?.last_serialization?.type || node?.type;
  return registryContainsNodeType(registeredNodeTypes, originalType) === false;
}

export function buildModelCatalog(models, modelTypes = []) {
  const byName = new Map();
  const byType = new Map();
  for (const type of modelTypes || []) {
    if (type) byType.set(String(type), new Set());
  }
  for (const model of models || []) {
    const name = normalizeModelName(model?.name);
    const type = String(model?.type || "");
    if (!name || !type) continue;
    if (!byName.has(name)) byName.set(name, new Set());
    if (!byType.has(type)) byType.set(type, new Set());
    byName.get(name).add(type);
    byType.get(type).add(name);
  }
  return { byName, byType };
}

export function buildSerializedNodeMap(serializedGraph) {
  return new Map((serializedGraph?.nodes || []).map((node) => [Number(node.id), node]));
}

export function defaultCandidateName(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  return String(candidates[0]?.name || "");
}

export function shouldSkipCandidateByDefault(candidates) {
  return Number(candidates?.[0]?.score) === 100;
}

export function shouldDisableCandidateSelect(canApply, skipChecked) {
  return canApply !== true || skipChecked === true;
}

export function modelSearchName(value) {
  const normalized = String(value ?? "").trim().replaceAll("\\", "/");
  return normalized.split("/").pop() || normalized;
}

export function groupMatcherResults(results) {
  const groups = [];
  const clipGroups = new Map();
  for (const result of results || []) {
    const isNumberedClip = /^clip_name\d+$/i.test(String(result?.widget_name || ""));
    const key = isNumberedClip ? `clip:${result.node_id}` : null;
    if (key && clipGroups.has(key)) {
      clipGroups.get(key).push(result);
      continue;
    }
    const group = [result];
    groups.push(group);
    if (key) clipGroups.set(key, group);
  }
  return groups;
}

export function filterModelCandidates(candidates, query) {
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...(candidates || [])];
  return (candidates || []).filter((candidate) =>
    String(candidate?.name || "").toLocaleLowerCase().includes(normalizedQuery)
  );
}

export function getWidgetChoices(widget) {
  let values = widget?.options?.values;
  if (typeof values === "function") {
    try {
      values = values.call(widget);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === "string");
}

export function resolveWidgetChoice(widget, candidateName) {
  const normalizedCandidate = normalizeModelName(candidateName);
  return getWidgetChoices(widget).find(
    (choice) => normalizeModelName(choice) === normalizedCandidate,
  ) ?? candidateName;
}

export function isModelValueAvailable(widget) {
  const current = normalizeModelName(widget?.value);
  return Boolean(current) && getWidgetChoices(widget).some(
    (choice) => normalizeModelName(choice) === current,
  );
}

function inferTypesFromWidgetName(widget, node) {
  const name = String(widget?.name || "").toLowerCase();
  if (name === "clip_name" && /clip.?vision/i.test(String(node?.type || ""))) {
    return ["clip_vision"];
  }
  return WIDGET_NAME_TYPES.get(name) || [];
}

function inferTypesFromNodeType(nodeType, catalog) {
  const value = String(nodeType || "");
  for (const [pattern, type] of NODE_TYPE_PATTERNS) {
    if (pattern.test(value)) return [type];
  }

  const normalizedNodeType = normalizeIdentifier(value);
  const dynamicMatches = [...(catalog?.byType?.keys?.() || [])].filter((type) => {
    const normalizedType = normalizeIdentifier(type);
    return normalizedType.length >= 4 && normalizedNodeType.includes(normalizedType);
  });
  return dynamicMatches.length === 1 ? dynamicMatches : [];
}

export function classifyModelWidget(widget, node, catalog) {
  const widgetTypes = inferTypesFromWidgetName(widget, node).filter((type) =>
    !catalog?.byType || catalog.byType.size === 0 || catalog.byType.has(type)
  );
  const isDropdown = widget?.type === "combo"
    || Array.isArray(widget?.options?.values)
    || typeof widget?.options?.values === "function"
    || widgetTypes.length === 1;
  if (!isDropdown) {
    return { modelTypes: [], conflict: false, evidence: "not_dropdown" };
  }

  if (widgetTypes.length > 0) {
    return { modelTypes: widgetTypes, conflict: false, evidence: "widget_name" };
  }

  const counts = new Map();
  for (const choice of getWidgetChoices(widget)) {
    const matchedTypes = catalog?.byName?.get(normalizeModelName(choice));
    if (!matchedTypes) continue;
    for (const type of matchedTypes) counts.set(type, (counts.get(type) || 0) + 1);
  }

  if (counts.size > 0) {
    const highest = Math.max(...counts.values());
    const winners = [...counts.entries()]
      .filter(([, count]) => count === highest)
      .map(([type]) => type)
      .sort();
    if (winners.length === 1) {
      return { modelTypes: winners, conflict: false, evidence: "catalog_overlap" };
    }
    return { modelTypes: [], conflict: true, evidence: "catalog_conflict" };
  }

  const nodeTypes = inferTypesFromNodeType(node?.type, catalog);
  if (nodeTypes.length === 1 && getWidgetChoices(widget).length === 0) {
    return { modelTypes: nodeTypes, conflict: false, evidence: "node_type" };
  }

  return { modelTypes: [], conflict: false, evidence: "unconfirmed" };
}

export function getModelTypesForWidget(widget, catalog, node = {}) {
  return classifyModelWidget(widget, node, catalog).modelTypes;
}

export function isModelDropdown(widget, catalog, node = {}) {
  return classifyModelWidget(widget, node, catalog).modelTypes.length > 0;
}

function looksLikeSerializedModelValue(value, catalog) {
  if (typeof value !== "string") return false;
  const normalized = normalizeModelName(value);
  if (catalog?.byName?.has(normalized)) return true;
  return MODEL_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

export function extractModelReferencesFromNode(
  node,
  serializedNode,
  catalog,
  registeredNodeTypes = null,
) {
  const references = [];
  const unknown = isUnknownNode(node, serializedNode, registeredNodeTypes);

  if (!unknown) {
    const modelWidgets = [];
    for (let index = 0; index < (node?.widgets || []).length; index += 1) {
      const widget = node.widgets[index];
      const classification = classifyModelWidget(widget, node, catalog);
      if (classification.modelTypes.length === 0) continue;
      modelWidgets.push({
        index,
        widget,
        classification,
        available: isModelValueAvailable(widget),
      });
    }

    const numberedClipWidgets = modelWidgets.filter(({ widget }) =>
      /^clip_name\d+$/i.test(String(widget?.name || ""))
    );
    const includeCompleteClipGroup = numberedClipWidgets.length > 1
      && numberedClipWidgets.some(({ available }) => !available);
    const groupedClipIndexes = new Set(numberedClipWidgets.map(({ index }) => index));

    for (const { index, widget, classification, available } of modelWidgets) {
      if (available && !(includeCompleteClipGroup && groupedClipIndexes.has(index))) continue;
      references.push({
        node_id: node.id,
        node_type: node.type,
        widget_index: index,
        widget_name: widget.name || `widget[${index}]`,
        value: widget.value,
        model_types: classification.modelTypes,
        source: "widget",
        can_apply: true,
        is_unknown_node: false,
      });
    }
  }

  if (!unknown) return references;

  const serializedValues = Array.isArray(serializedNode?.widgets_values)
    ? serializedNode.widgets_values
    : [];
  const inferredTypes = inferTypesFromNodeType(serializedNode?.type, catalog);
  if (inferredTypes.length !== 1) return references;

  const seen = new Set(references.map((reference) => `${reference.widget_index}:${reference.value}`));
  for (let index = 0; index < serializedValues.length; index += 1) {
    const value = serializedValues[index];
    if (!looksLikeSerializedModelValue(value, catalog)) continue;
    const key = `${index}:${value}`;
    if (seen.has(key)) continue;
    references.push({
      node_id: node.id,
      node_type: node.type,
      widget_index: index,
      widget_name: `widgets_values[${index}]`,
      value,
      model_types: inferredTypes,
      source: "serialized_widgets_values",
      can_apply: false,
      is_unknown_node: true,
    });
  }
  return references;
}
