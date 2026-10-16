import { getGraphGroups, getGraphItemBounds } from "../../shared/comfy_compat.js";

const GAP_X = 36;
const GAP_Y = 22;
const GROUP_PADDING = 14;
const LAYOUT_GROUP_MARKER = "yjNodesWorkflowLayout";

export const MODULES = [
  { id: "model", zh: "模型加载", en: "Model Loading", color: "#47775b" },
  { id: "input", zh: "输入与参考素材", en: "Inputs & References", color: "#355f73" },
  { id: "conditioning", zh: "条件准备", en: "Conditioning", color: "#537f83" },
  { id: "sampling", zh: "采样", en: "Sampling", color: "#645c8c" },
  { id: "upscale", zh: "放大与后处理", en: "Upscale & Post-process", color: "#9a713d" },
  { id: "output", zh: "输出", en: "Output", color: "#477783" },
  { id: "other", zh: "其他节点", en: "Other Nodes", color: "#666666" },
];

function nodeText(node) {
  return `${node?.type || ""} ${node?.title || ""}`.toLowerCase();
}

export function classifyNode(node) {
  const text = nodeText(node);
  if (/unetloader|checkpointloader|cliploader|vaeloader|loraloader|attentionpatch|model.*loader/.test(text)) return "model";
  if (/loadimage|loadaudio|loadvideo|primitive|resolutionselector|mathexpression|textencode|prompt/.test(text)) return "input";
  if (/conditioning|controlnet|ipadapter|reference.*video|guider/.test(text)) return "conditioning";
  if (/sampler|scheduler|sigmas|noise|latentreconcile|detailmixer/.test(text)) return "sampling";
  if (/upscale|upscaler|scale|sharpen|restore/.test(text)) return "upscale";
  if (/save|preview|decode|createvideo|clean.*gpu|combine/.test(text)) return "output";
  return "other";
}

function modelOrder(node) {
  const text = nodeText(node);
  if (/unetloader|checkpointloader/.test(text)) return 0;
  if (/cliploader/.test(text)) return 1;
  if (/vaeloader/.test(text)) return 2;
  return 3;
}

function linksFor(graph) {
  const raw = graph?.links;
  if (raw instanceof Map) return [...raw.values()].filter(Boolean);
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (raw && typeof raw === "object") return Object.values(raw).filter(Boolean);
  return [];
}

function edgePair(link) {
  const from = link?.origin_id ?? link?.originId ?? link?.[1];
  const to = link?.target_id ?? link?.targetId ?? link?.[3];
  return from === undefined || to === undefined ? null : [String(from), String(to)];
}

export function buildLayoutPlan(nodes, graph, language = "en") {
  const manualBounds = getGraphGroups(graph)
    .filter((group) => group?.flags?.[LAYOUT_GROUP_MARKER] !== true)
    .map(getGraphItemBounds).filter(Boolean);
  const outsideManualGroup = (node) => {
    const bounds = getGraphItemBounds(node);
    if (!bounds) return true;
    const centerX = bounds[0] + bounds[2] / 2;
    const centerY = bounds[1] + bounds[3] / 2;
    return !manualBounds.some(([x, y, width, height]) =>
      centerX >= x && centerX <= x + width && centerY >= y && centerY <= y + height);
  };
  const records = nodes.filter(outsideManualGroup)
    .map((node, index) => ({ node, index, id: String(node.id), module: classifyNode(node), depth: 0 }));
  const byId = new Map(records.map((item) => [item.id, item]));
  const edges = linksFor(graph).map(edgePair).filter(Boolean).filter(([from, to]) => byId.has(from) && byId.has(to));
  const incoming = new Map(records.map((item) => [item.id, 0]));
  const children = new Map(records.map((item) => [item.id, []]));
  for (const [from, to] of edges) { incoming.set(to, incoming.get(to) + 1); children.get(from).push(to); }
  const ready = records.filter((item) => incoming.get(item.id) === 0).sort((a, b) => a.index - b.index);
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const current = ready[cursor];
    for (const childId of children.get(current.id)) {
      const child = byId.get(childId);
      child.depth = Math.max(child.depth, current.depth + 1);
      incoming.set(childId, incoming.get(childId) - 1);
      if (incoming.get(childId) === 0) ready.push(child);
    }
  }
  // 环状或无法读取的连线仍可整理：按原始顺序放置在后续列。
  for (const item of records) if (incoming.get(item.id) > 0) item.depth = Math.max(item.depth, item.index);

  const moduleIndex = new Map(MODULES.map((module, index) => [module.id, index]));
  const ordered = [...records].sort((a, b) =>
    moduleIndex.get(a.module) - moduleIndex.get(b.module) ||
    (a.module === "model" ? modelOrder(a.node) - modelOrder(b.node) : 0) ||
    a.depth - b.depth || a.index - b.index);
  const cursorByModule = new Map();
  const plan = [];
  let modelColumnBottom = 0;
  const modelColumnWidth = Math.max(0, ...ordered
    .filter((item) => item.module === "model" && /unetloader|checkpointloader|cliploader|vaeloader/.test(nodeText(item.node)))
    .map((item) => Number(item.node.size?.[0]) || 240));
  let otherModelX = 0;
  for (const item of ordered) {
    const width = Number(item.node.size?.[0]) || 240;
    const height = Number(item.node.size?.[1]) || 80;
    const state = cursorByModule.get(item.module) || { x: 0, y: 0, rowHeight: 0 };
    // 主模型加载器同列纵向排列，其余模型节点置于右侧。
    const text = nodeText(item.node);
    const isPrimaryModel = item.module === "model" && /unetloader|checkpointloader|cliploader|vaeloader/.test(text);
    let pos;
    if (isPrimaryModel) {
      const tier = /cliploader/.test(text) ? 210 : /vaeloader/.test(text) ? 350 : 0;
      const y = Math.max(tier, modelColumnBottom);
      pos = [0, y];
      modelColumnBottom = y + height + GAP_Y;
    } else if (item.module === "model") {
      pos = [Math.max(modelColumnWidth + GAP_X, otherModelX), 0];
      otherModelX = pos[0] + width + GAP_X;
    } else {
      pos = [state.x, state.y];
      state.x += width + GAP_X;
    }
    plan.push({ ...item, pos, width, height });
    state.rowHeight = Math.max(state.rowHeight, height);
    cursorByModule.set(item.module, state);
  }
  let moduleX = Math.max(0, ...manualBounds.map(([x, , width]) => x + width + GAP_X * 2));
  for (const module of MODULES) {
    const items = plan.filter((item) => item.module === module.id);
    if (!items.length) continue;
    const minX = Math.min(...items.map((item) => item.pos[0]));
    const maxX = Math.max(...items.map((item) => item.pos[0] + item.width));
    for (const item of items) item.pos[0] += moduleX - minX;
    moduleX += maxX - minX + GAP_X * 2;
  }
  const groups = MODULES.map((module) => {
    const items = plan.filter((item) => item.module === module.id);
    if (!items.length) return null;
    const left = Math.min(...items.map((item) => item.pos[0])) - GROUP_PADDING;
    const top = Math.min(...items.map((item) => item.pos[1])) - 50;
    const right = Math.max(...items.map((item) => item.pos[0] + item.width)) + GROUP_PADDING;
    const bottom = Math.max(...items.map((item) => item.pos[1] + item.height)) + GROUP_PADDING;
    return { title: language === "zh" ? module.zh : module.en, color: module.color, bounding: [left, top, right - left, bottom - top] };
  }).filter(Boolean);
  return { plan, groups };
}

export function applyLayoutPlan(graph, plan) {
  for (const item of plan.plan) item.node.pos = item.pos;
  if (typeof graph?.add !== "function" || !globalThis.LGraphGroup) return;
  for (const group of [...getGraphGroups(graph)]) {
    if (group?.flags?.[LAYOUT_GROUP_MARKER] === true) graph.remove?.(group);
  }
  for (const spec of plan.groups) {
    const group = new globalThis.LGraphGroup(spec.title);
    // LGraphGroup.serialize() 会持久化 flags，重载工作流后仍能识别本插件分组。
    group.flags = { ...group.flags, [LAYOUT_GROUP_MARKER]: true };
    group.color = spec.color;
    group.font_size = 16;
    const [x, y, width, height] = spec.bounding;
    group.pos = [x, y];
    group.size = [width, height];
    graph.add(group);
  }
}

