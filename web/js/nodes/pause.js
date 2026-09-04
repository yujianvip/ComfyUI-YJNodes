import { app } from "../../../../scripts/app.js";
import { api } from "../../../../scripts/api.js";
import { findNodeById, focusNode, getActiveGraph, markGraphDirty } from "../shared/comfy_compat.js";
import { getCurrentLanguage, messageFor } from "../shared/i18n.js";
import {
  formatRemaining,
  isPauseNode,
  normalizePauseState,
  syncPauseConnectionType,
} from "./pause_core.js";

const ACTIVE_URL = "/yj_nodes/pause/active";
const ACTION_URL = "/yj_nodes/pause/action";
const NODE_RUNTIME = Symbol.for("ComfyUI-YJNodes.YJpauseRuntime");
const pendingRestarts = new Set();
const activeStates = new Map();
let countdownTimer = null;

const MESSAGES = Object.freeze({
  zh: {
    statusUnlimited: "已暂停 · 不自动停止",
    statusTimed: "已暂停 · {time} 后自动停止",
    continue: "继续",
    restart: "重新开始",
    stop: "停止",
    on: "开",
    off: "关",
    actionFailed: "YJpause 操作失败",
    sessionUnavailable: "暂停会话已结束或不可用",
    timedOut: "等待已超时，当前任务已停止",
    stopped: "当前任务已停止",
    restarted: "正在重新开始工作流",
  },
  en: {
    statusUnlimited: "Paused · no auto-stop",
    statusTimed: "Paused · auto-stop in {time}",
    continue: "Continue",
    restart: "Restart",
    stop: "Stop",
    on: "On",
    off: "Off",
    actionFailed: "YJpause action failed",
    sessionUnavailable: "The pause session has ended or is unavailable",
    timedOut: "Wait timed out. The current job was stopped.",
    stopped: "The current job was stopped.",
    restarted: "Restarting the workflow",
  },
});

function text(key, replacements = {}) {
  const language = getCurrentLanguage(app);
  let value = messageFor(MESSAGES, language, key);
  for (const [name, replacement] of Object.entries(replacements)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

function showMessage(detail, severity = "info") {
  const toast = app.extensionManager?.toast;
  if (toast?.add) {
    toast.add({ severity, summary: "YJpause", detail, life: 3500 });
  } else {
    console[severity === "error" ? "error" : "log"](`[ComfyUI-YJNodes] ${detail}`);
  }
}

function setWidgetVisible(widget, visible) {
  if (!widget) return;
  widget.hidden = !visible;
  widget.options ||= {};
  widget.options.disabled = !visible;
}

function labelWidget(widget, label) {
  if (!widget) return;
  widget.label = label;
}

async function requestAction(node, action) {
  const runtime = node?.[NODE_RUNTIME];
  const state = runtime?.state;
  if (!state || state.state !== "paused" || runtime.pending) return;
  runtime.pending = true;
  if (action === "restart") pendingRestarts.add(state.prompt_id);
  try {
    const response = await api.fetchApi(ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-YJNodes-Request": "1" },
      body: JSON.stringify({ session_id: state.session_id, node_id: state.node_id, action }),
    });
    if (!response.ok) throw new Error(text("sessionUnavailable"));
    const payload = await response.json();
    applyState(payload.session);
  } catch (error) {
    if (action === "restart") pendingRestarts.delete(state.prompt_id);
    runtime.pending = false;
    showMessage(`${text("actionFailed")}：${error?.message || String(error)}`, "error");
  }
}

function ensureNodeRuntime(node) {
  if (!isPauseNode(node)) return null;
  if (node[NODE_RUNTIME]) return node[NODE_RUNTIME];
  const runtime = { state: null, pending: false, originalDraw: node.onDrawForeground };
  runtime.status = node.addWidget?.("button", "YJpause", undefined, () => {}, { disabled: true });
  runtime.continue = node.addWidget?.("button", "Continue", undefined, () => requestAction(node, "continue"));
  runtime.restart = node.addWidget?.("button", "Restart", undefined, () => requestAction(node, "restart"));
  runtime.stop = node.addWidget?.("button", "Stop", undefined, () => requestAction(node, "stop"));
  for (const widget of [runtime.status, runtime.continue, runtime.restart, runtime.stop]) {
    if (!widget) continue;
    widget.serialize = false;
    setWidgetVisible(widget, false);
  }
  node.onDrawForeground = function (...args) {
    runtime.originalDraw?.apply(this, args);
    if (runtime.state?.state !== "paused") return;
    const [ctx] = args;
    if (!ctx) return;
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 12;
    ctx.strokeRect(2, 2, Math.max(0, this.size[0] - 4), Math.max(0, this.size[1] - 4));
    ctx.restore();
  };
  Object.defineProperty(node, NODE_RUNTIME, { value: runtime });
  syncPauseConnectionType(node);
  return runtime;
}

function updatePausedWidgets(node, state) {
  const runtime = ensureNodeRuntime(node);
  if (!runtime) return;
  runtime.state = state;
  runtime.pending = false;
  const paused = state?.state === "paused";
  for (const widget of [runtime.status, runtime.continue, runtime.restart, runtime.stop]) {
    setWidgetVisible(widget, paused);
  }
  if (runtime.status?.options) runtime.status.options.disabled = true;
  labelWidget(runtime.continue, text("continue"));
  labelWidget(runtime.restart, text("restart"));
  labelWidget(runtime.stop, text("stop"));
  updateCountdownLabel(node);
  markGraphDirty(app, node.graph || getActiveGraph(app), node);
  node.setSize?.(node.computeSize?.() || node.size);
}

function updateCountdownLabel(node) {
  const runtime = node?.[NODE_RUNTIME];
  const state = runtime?.state;
  if (!state || state.state !== "paused") return;
  if (state.remaining_seconds === null) {
    labelWidget(runtime.status, text("statusUnlimited"));
  } else {
    labelWidget(runtime.status, text("statusTimed", { time: formatRemaining(state.remaining_seconds) }));
  }
  markGraphDirty(app, node.graph || getActiveGraph(app), node);
}

function applyState(rawState, focus = false) {
  const state = normalizePauseState(rawState);
  if (!state) return;
  if (state.state === "paused") activeStates.set(state.node_id, state);
  else activeStates.delete(state.node_id);
  const node = findNodeById(app, state.node_id);
  if (isPauseNode(node)) {
    updatePausedWidgets(node, state);
    if (focus && state.state === "paused") focusNode(app, node);
  }
  if (state.state === "timed_out") showMessage(text("timedOut"), "warn");
  else if (state.state === "stopped") showMessage(text("stopped"));
  else if (state.state === "restarting") showMessage(text("restarted"));
}

function tickCountdowns() {
  for (const [nodeId, state] of activeStates) {
    if (state.remaining_seconds !== null) state.remaining_seconds = Math.max(0, state.remaining_seconds - 1);
    const node = findNodeById(app, nodeId);
    if (isPauseNode(node)) updateCountdownLabel(node);
  }
}

async function recoverActiveStates() {
  try {
    const clientId = api.clientId ? `?client_id=${encodeURIComponent(api.clientId)}` : "";
    const response = await api.fetchApi(`${ACTIVE_URL}${clientId}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    for (const state of payload.sessions || []) applyState(state, false);
  } catch (error) {
    console.warn("[ComfyUI-YJNodes] failed to recover YJpause states", error);
  }
}

function initializeNode(node) {
  if (!isPauseNode(node)) return;
  const runtime = ensureNodeRuntime(node);
  const state = activeStates.get(String(node.id));
  if (state) updatePausedWidgets(node, state);
  if (runtime.initialized) return;
  const enabledWidget = node.widgets?.find((widget) => widget.name === "enabled");
  if (enabledWidget) {
    enabledWidget.options ||= {};
    enabledWidget.options.on = text("on");
    enabledWidget.options.off = text("off");
  }
  const original = node.onConnectionsChange;
  node.onConnectionsChange = function (...args) {
    const result = original?.apply(this, args);
    setTimeout(() => {
      syncPauseConnectionType(this);
      markGraphDirty(app, this.graph || getActiveGraph(app), this);
    }, 0);
    return result;
  };
  runtime.initialized = true;
}

function onPauseState(event) {
  applyState(event.detail, true);
}

function onExecutionInterrupted(event) {
  const promptId = String(event.detail?.prompt_id || "");
  if (!pendingRestarts.delete(promptId)) return;
  setTimeout(() => app.queuePrompt(0, 1), 0);
}

app.registerExtension({
  name: "ComfyUI-YJNodes.YJpause",
  nodeCreated: initializeNode,
  loadedGraphNode: initializeNode,
  async setup() {
    api.addEventListener("yj_pause_state", onPauseState);
    api.addEventListener("execution_interrupted", onExecutionInterrupted);
    countdownTimer ||= setInterval(tickCountdowns, 1000);
    await recoverActiveStates();
  },
});
