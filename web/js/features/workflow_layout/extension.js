import { app } from "../../../../../scripts/app.js";
import { beginGraphChange, endGraphChange, getActiveGraph, getGraphNodes } from "../../shared/comfy_compat.js";
import { getCurrentLanguage } from "../../shared/i18n.js";
import { registerYJCanvasMenuItem } from "../../shared/canvas_menu.js";
import { applyLayoutPlan, buildLayoutPlan } from "./core.js";

const TEXT = {
  zh: { menu: "🧭 整理工作流布局", empty: "当前画布没有可整理的节点。", done: "已按模块和连接顺序整理工作流。" },
  en: { menu: "🧭 Organize Workflow Layout", empty: "There are no nodes to organize on this canvas.", done: "The workflow was organized by module and connection order." },
};
function message(key) { return TEXT[getCurrentLanguage(app)]?.[key] || TEXT.en[key]; }
function notify(text) {
  if (app?.extensionManager?.toast?.add) app.extensionManager.toast.add({ severity: "success", summary: text, life: 3000 });
  else console.info(`[ComfyUI-YJNodes.WorkflowLayout] ${text}`);
}
function organize() {
  const graph = getActiveGraph(app);
  const nodes = getGraphNodes(app, graph);
  if (!nodes.length) { notify(message("empty")); return; }
  beginGraphChange(app, graph);
  try { applyLayoutPlan(graph, buildLayoutPlan(nodes, graph, getCurrentLanguage(app))); }
  finally { endGraphChange(app, graph); }
  notify(message("done"));
}
app.registerExtension({ name: "ComfyUI-YJNodes.WorkflowLayout", setup() {
  registerYJCanvasMenuItem({ id: "workflow-layout", order: 30, content: () => message("menu"), callback: organize });
} });
