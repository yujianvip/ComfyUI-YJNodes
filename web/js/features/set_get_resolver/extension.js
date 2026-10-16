import { app } from "../../../../../scripts/app.js";
import { registerYJCanvasMenuItem } from "../../shared/canvas_menu.js";
import { beginGraphChange, endGraphChange, getActiveGraph, getGraphNodes } from "../../shared/comfy_compat.js";
import { getCurrentLanguage } from "../../shared/i18n.js";
import {
  applyResolverOperations,
  buildResolverPlan,
  graphHasSubgraphs,
} from "./core.js";

const I18N = {
  zh: {
    menu: "⚡ 将 Set/Get 替换为连线",
    noNodes: "未找到 Set/Get 节点。",
    noPairs: "找到了 Set/Get 节点，但没有已连接且变量名匹配的节点对。",
    conflictsOnly: (details) => `检测到同名 Set 冲突，未修改工作流：\n${details}`,
    title: "⚡ Set/Get 连线转换",
    found: (count) => `找到 ${count} 个匹配连接，请选择操作：`,
    conflicts: (details) => `以下同名 Set 存在歧义，将跳过：\n${details}`,
    conflictLine: (name, setIds, getIds) =>
      `“${name}”：Set 节点 ${setIds}，影响 Get 节点 ${getIds}`,
    cancel: "取消",
    wireOnly: "仅连线",
    wireDelete: "连线并删除",
    subgraphWarning: "检测到子图：为避免破坏跨子图引用，本次只允许连线，不删除 Set/Get。",
    applyFailed: (message) => `转换失败，已尝试恢复原节点连接；请检查工作流。\n${message}`,
  },
  en: {
    menu: "⚡ Replace Set/Get with Wires",
    noNodes: "No Set/Get nodes found.",
    noPairs: "Found Set/Get nodes, but no matching pairs connected.",
    conflictsOnly: (details) => `Duplicate Set names found; the workflow was not changed:\n${details}`,
    title: "⚡ Set/Get Resolver",
    found: (count) => `Found ${count} matching connections. Select an action:`,
    conflicts: (details) => `Ambiguous duplicate Set names will be skipped:\n${details}`,
    conflictLine: (name, setIds, getIds) =>
      `“${name}”: Set nodes ${setIds}; affected Get nodes ${getIds}`,
    cancel: "Cancel",
    wireOnly: "Wire Only",
    wireDelete: "Wire & Delete",
    subgraphWarning: "Subgraphs detected. Set/Get deletion is disabled to protect cross-subgraph references.",
    applyFailed: (message) => `Conversion failed. Original links were restored where possible; please check the workflow.\n${message}`,
  },
};

function text() {
  return I18N[getCurrentLanguage(app)] || I18N.en;
}

function showAlert(message) {
  const dialog = app?.extensionManager?.dialog;
  if (typeof dialog?.alert === "function") {
    void dialog.alert({ title: text().title, message });
    return;
  }
  if (typeof app?.ui?.dialog?.show === "function") {
    app.ui.dialog.show(message);
    return;
  }
  console.warn(`[ComfyUI-YJNodes.SetGetResolver] ${message}`);
}

function applyChanges(operations, nodesToDelete) {
  const graph = getActiveGraph(app);
  let connectedCount = 0;
  beginGraphChange(app, graph);

  try {
    connectedCount = applyResolverOperations(graph, operations, nodesToDelete);
  } catch (error) {
    console.error("[ComfyUI-YJNodes.SetGetResolver] conversion failed", error);
    showAlert(text().applyFailed(error?.message || String(error)));
    return;
  } finally {
    endGraphChange(app, graph);
  }

  const action = nodesToDelete ? "rewired & deleted nodes" : "rewired only";
  console.log(
    `[ComfyUI-YJNodes.SetGetResolver] Processed ${operations.length} pairs, ` +
      `created ${connectedCount} wires, ${action}.`,
  );
}

function ensureStyles() {
  if (document.getElementById("yj-set-get-resolver-style")) return;
  const style = document.createElement("style");
  style.id = "yj-set-get-resolver-style";
  style.textContent = `
    .yj-sgr-backdrop{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
    .yj-sgr-dialog{min-width:340px;max-width:520px;padding:20px;color:#fff;background:#353535;border:1px solid #555;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,.5);font-family:Microsoft YaHei,Arial,sans-serif}
    .yj-sgr-dialog h3{margin:0 0 14px;font-size:19px}.yj-sgr-dialog p{margin:0;line-height:1.6;white-space:pre-line}
    .yj-sgr-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.yj-sgr-actions button{padding:8px 16px;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:14px}
    .yj-sgr-actions button:hover{filter:brightness(1.2)}.yj-sgr-cancel{background:#666}.yj-sgr-wire{background:#2196f3}.yj-sgr-delete{background:#f44336}
  `;
  document.head.appendChild(style);
}

function conflictDetails(conflicts) {
  const lang = text();
  return conflicts
    .map((conflict) =>
      lang.conflictLine(
        conflict.variableName,
        conflict.setNodes.map((node) => `#${node.id}`).join(", "),
        conflict.getNodes.map((node) => `#${node.id}`).join(", "),
      ),
    )
    .join("\n");
}

function showSelectionDialog(operations, nodesToDelete, conflicts, hasSubgraphs) {
  ensureStyles();
  document.querySelector(".yj-sgr-backdrop")?.remove();
  const lang = text();
  const backdrop = document.createElement("div");
  backdrop.className = "yj-sgr-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "yj-sgr-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const title = document.createElement("h3");
  title.textContent = lang.title;
  const message = document.createElement("p");
  message.textContent = lang.found(operations.length);
  if (conflicts.length > 0) {
    message.textContent += `\n\n${lang.conflicts(conflictDetails(conflicts))}`;
  }
  if (hasSubgraphs) {
    message.textContent += `\n\n${lang.subgraphWarning}`;
  }
  const actions = document.createElement("div");
  actions.className = "yj-sgr-actions";

  const closeOnEscape = (event) => {
    if (event.key === "Escape") closeDialog();
  };
  function closeDialog() {
    document.removeEventListener("keydown", closeOnEscape);
    backdrop.remove();
  }

  function addButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", () => {
      closeDialog();
      handler();
    });
    actions.appendChild(button);
    return button;
  }

  const cancelButton = addButton(lang.cancel, "yj-sgr-cancel", () => {});
  addButton(lang.wireOnly, "yj-sgr-wire", () => applyChanges(operations, null));
  if (!hasSubgraphs) {
    addButton(lang.wireDelete, "yj-sgr-delete", () =>
      applyChanges(operations, nodesToDelete),
    );
  }

  document.addEventListener("keydown", closeOnEscape);

  dialog.append(title, message, actions);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  cancelButton.focus();
}

function initiateResolver() {
  const graph = getActiveGraph(app);
  const plan = buildResolverPlan(graph, getGraphNodes(app, graph));
  if (plan.setNodes.length === 0 && plan.getNodes.length === 0) {
    showAlert(text().noNodes);
    return;
  }
  if (plan.operations.length === 0) {
    if (plan.conflicts.length > 0) {
      showAlert(text().conflictsOnly(conflictDetails(plan.conflicts)));
      return;
    }
    showAlert(text().noPairs);
    return;
  }
  showSelectionDialog(
    plan.operations,
    plan.nodesToDelete,
    plan.conflicts,
    graphHasSubgraphs(graph),
  );
}

app.registerExtension({
  name: "ComfyUI-YJNodes.SetGetResolver",
  setup() {
    registerYJCanvasMenuItem({
      id: "set-get-resolver",
      order: 10,
      content: () => text().menu,
      callback: initiateResolver,
    });
  },
});
