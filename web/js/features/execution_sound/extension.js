import { app } from "../../../../../scripts/app.js";
import { api } from "../../../../../scripts/api.js";
import {
  CompletionPolicy,
  normalizeExecutionSoundConfig,
} from "./core.js";

const LEGACY_STORAGE_KEY = "ComfyUI-YJNodes.ExecutionSound";
const SOUND_LIST_URL = "/yj_nodes/execution_sound/sounds";
const OPEN_FOLDER_URL = "/yj_nodes/execution_sound/open_folder";
const SOUND_FILE_URL = "/yj_nodes/execution_sound/file/";
const CATEGORY = ["YJNodes", "工作流完成提示音"];
const RUNTIME_KEY = Symbol.for("ComfyUI-YJNodes.executionSoundRuntime");
const SETTING_IDS = Object.freeze({
  enabled: "YJNodes.ExecutionSound.Enabled",
  mode: "YJNodes.ExecutionSound.Mode",
  sound: "YJNodes.ExecutionSound.Sound",
  volume: "YJNodes.ExecutionSound.Volume",
  actions: "YJNodes.ExecutionSound.Actions",
});

const policy = new CompletionPolicy();
let queueCheckTimer = null;
let delayedQueueCheckTimer = null;

function settingCategory(label) {
  return [...CATEGORY, label];
}

function getSetting(id) {
  return app.extensionManager?.setting?.get(id);
}

function loadConfig() {
  return normalizeExecutionSoundConfig({
    enabled: getSetting(SETTING_IDS.enabled),
    mode: getSetting(SETTING_IDS.mode),
    sound: getSetting(SETTING_IDS.sound),
    volume: getSetting(SETTING_IDS.volume),
  });
}

async function migrateLegacyConfig() {
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw || !app.extensionManager?.setting?.set) return;
  try {
    const config = normalizeExecutionSoundConfig(JSON.parse(raw));
    await Promise.all([
      app.extensionManager.setting.set(SETTING_IDS.enabled, config.enabled),
      app.extensionManager.setting.set(SETTING_IDS.mode, config.mode),
      app.extensionManager.setting.set(SETTING_IDS.sound, config.sound),
      app.extensionManager.setting.set(SETTING_IDS.volume, config.volume),
    ]);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.error("[ComfyUI-YJNodes] legacy execution sound migration failed", error);
  }
}

function showMessage(summary, detail, severity = "info") {
  const toast = app.extensionManager?.toast;
  if (toast?.add) {
    toast.add({ severity, summary, detail, life: 3500 });
  } else {
    console[severity === "error" ? "error" : "log"](`[ComfyUI-YJNodes] ${summary}: ${detail}`);
  }
}

class SoundPlayer {
  constructor() {
    this.context = null;
    this.buffers = new Map();
  }

  unlock() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    this.context ||= new AudioContext();
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }

  async getBuffer(name) {
    this.unlock();
    if (!this.context) throw new Error("当前环境不支持音频播放");
    if (!this.buffers.has(name)) {
      const promise = fetch(`${SOUND_FILE_URL}${encodeURIComponent(name)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`读取音效失败：HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then((data) => this.context.decodeAudioData(data));
      this.buffers.set(name, promise);
      promise.catch(() => this.buffers.delete(name));
    }
    return this.buffers.get(name);
  }

  clearCache() {
    this.buffers.clear();
  }

  async play(name, volume) {
    if (!name) throw new Error("请先选择音效");
    const buffer = await this.getBuffer(name);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = Math.min(1, Math.max(0, Number(volume)));
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.context.destination);
    source.start();
  }
}

const player = new SoundPlayer();

async function fetchSounds() {
  const response = await fetch(SOUND_LIST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`读取音效列表失败：HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.sounds) ? payload.sounds : [];
}

async function playConfiguredSound(config = loadConfig(), reportError = true) {
  try {
    await player.play(config.sound, config.volume);
  } catch (error) {
    console.error("[ComfyUI-YJNodes] execution sound failed", error);
    if (reportError) showMessage("提示音播放失败", error.message || String(error), "error");
  }
}

async function isQueueEmpty() {
  const response = await fetch("/queue", { cache: "no-store" });
  if (!response.ok) return false;
  const queue = await response.json();
  return (queue.queue_running?.length || 0) === 0 && (queue.queue_pending?.length || 0) === 0;
}

async function checkQueueCompletion() {
  try {
    if (policy.finishQueueIfEmpty(await isQueueEmpty())) {
      const config = loadConfig();
      if (config.enabled) await playConfiguredSound(config, false);
    }
  } catch (error) {
    console.error("[ComfyUI-YJNodes] queue completion check failed", error);
  }
}

function scheduleQueueCheck(delay = 250) {
  clearTimeout(queueCheckTimer);
  queueCheckTimer = setTimeout(checkQueueCompletion, delay);
}

function onExecutionSuccess(event) {
  const config = loadConfig();
  if (!config.enabled || !config.sound) return;
  const action = policy.handleSuccess(event.detail?.prompt_id, config.mode);
  if (action === "play") {
    playConfiguredSound(config, false);
  } else if (action === "wait") {
    scheduleQueueCheck(300);
    clearTimeout(delayedQueueCheckTimer);
    delayedQueueCheckTimer = setTimeout(checkQueueCompletion, 1200);
  }
}

function onStatus(event) {
  if (event.detail?.exec_info?.queue_remaining === 0 && policy.pendingQueueSound) {
    scheduleQueueCheck(100);
  }
}

function ensureExecutionSoundStyles() {
  if (document.getElementById("yj-execution-sound-settings-style")) return;
  const style = document.createElement("style");
  style.id = "yj-execution-sound-settings-style";
  style.textContent = `
    .yj-es-segmented {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: min(100%, 430px);
      padding: 3px;
      border: 1px solid var(--border-default, #4b5563);
      border-radius: 9px;
      background: color-mix(in srgb, var(--comfy-input-bg, #17191d) 88%, transparent);
      gap: 3px;
    }
    .yj-es-segmented button {
      min-height: 34px;
      padding: 6px 12px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--input-text, #cbd5e1);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease;
    }
    .yj-es-segmented button:hover:not([aria-checked="true"]) {
      background: color-mix(in srgb, currentColor 9%, transparent);
    }
    .yj-es-segmented button[aria-checked="true"] {
      background: var(--p-primary-color, #3b82f6);
      color: var(--p-primary-contrast-color, #fff);
      box-shadow: 0 1px 4px #0005;
      font-weight: 600;
    }
    .yj-es-segmented button:focus-visible,
    .yj-es-sound-select:focus-visible,
    .yj-es-action:focus-visible {
      outline: 2px solid var(--p-primary-color, #60a5fa);
      outline-offset: 2px;
    }
    .yj-es-sound-picker {
      width: min(100%, 430px);
    }
    .yj-es-sound-select {
      width: 100%;
      min-height: 36px;
      padding: 6px 34px 6px 11px;
      border: 1px solid var(--border-default, #4b5563);
      border-radius: 8px;
      background-color: var(--comfy-input-bg, #17191d);
      color: var(--input-text, #e5e7eb);
      font: inherit;
      cursor: pointer;
      transition: border-color 140ms ease, box-shadow 140ms ease;
    }
    .yj-es-sound-select:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--p-primary-color, #60a5fa) 65%, var(--border-default, #4b5563));
    }
    .yj-es-sound-select:disabled {
      cursor: wait;
      opacity: .6;
    }
    .yj-es-sound-meta {
      min-height: 17px;
      margin-top: 5px;
      color: var(--fg-color-muted, #94a3b8);
      font-size: 11px;
      line-height: 1.45;
    }
    .yj-es-sound-meta[data-state="warning"] { color: #f59e0b; }
    .yj-es-sound-meta[data-state="error"] { color: #ef6b6b; }
    .yj-es-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
    }
    .yj-es-action {
      min-height: 32px;
      padding: 5px 10px;
      border: 1px solid var(--border-default, #4b5563);
      border-radius: 7px;
      background: var(--comfy-input-bg, #24272d);
      color: var(--input-text, #e5e7eb);
      cursor: pointer;
      font: inherit;
      font-size: 12px;
      transition: border-color 140ms ease, background-color 140ms ease;
    }
    .yj-es-action:hover {
      border-color: var(--p-primary-color, #60a5fa);
      background: color-mix(in srgb, var(--p-primary-color, #3b82f6) 13%, var(--comfy-input-bg, #24272d));
    }
  `;
  document.head.appendChild(style);
}

function renderModeToggle(_name, setter, value) {
  ensureExecutionSoundStyles();
  const container = document.createElement("div");
  container.className = "yj-es-segmented";
  container.setAttribute("role", "radiogroup");
  container.setAttribute("aria-label", "提示音触发方式");

  const choices = [
    { value: "queue", label: "队列完成" },
    { value: "each", label: "每个任务" },
  ];
  let current = value === "each" ? "each" : "queue";
  const buttons = choices.map((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.label;
    button.setAttribute("role", "radio");
    button.title = choice.value === "queue"
      ? "整个队列清空后只播放一次"
      : "每完成一个工作流任务就播放一次";
    button.addEventListener("click", () => selectMode(choice.value));
    container.appendChild(button);
    return { ...choice, button };
  });

  function syncButtons() {
    for (const choice of buttons) {
      const active = choice.value === current;
      choice.button.setAttribute("aria-checked", String(active));
      choice.button.tabIndex = active ? 0 : -1;
    }
  }

  function selectMode(next) {
    if (next === current) return;
    current = next;
    syncButtons();
    setter(next);
  }

  container.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    selectMode(current === "queue" ? "each" : "queue");
    buttons.find((choice) => choice.value === current)?.button.focus();
  });
  syncButtons();
  return container;
}

function updateSoundMeta(select, sounds, selected, error = false) {
  const meta = select.closest(".yj-es-sound-picker")?.querySelector(".yj-es-sound-meta");
  if (!meta) return;
  if (error) {
    meta.textContent = "读取失败，请确认 ComfyUI 已加载插件后端";
    meta.dataset.state = "error";
  } else if (!sounds.length) {
    meta.textContent = "音效文件夹为空，放入文件后点击“刷新音效列表”";
    meta.dataset.state = "warning";
  } else if (selected && !sounds.includes(selected)) {
    meta.textContent = `${sounds.length} 个可用 · 当前文件已不存在`;
    meta.dataset.state = "warning";
  } else {
    meta.textContent = selected
      ? `${sounds.length} 个可用 · 当前：${selected}`
      : `${sounds.length} 个音效可用`;
    meta.dataset.state = "ready";
  }
}

function fillSoundSelect(select, sounds, selected) {
  select.replaceChildren(new Option("选择完成提示音…", ""));
  for (const name of sounds) select.add(new Option(name, name));
  if (selected && !sounds.includes(selected)) {
    select.add(new Option(`文件不存在：${selected}`, selected));
  }
  select.value = selected || "";
  select.yjSoundNames = sounds;
  updateSoundMeta(select, sounds, selected);
}

async function refreshSoundSelects(announce = false) {
  const selects = [...document.querySelectorAll("[data-yj-execution-sound-select]")];
  for (const select of selects) select.disabled = true;
  try {
    const sounds = await fetchSounds();
    player.clearCache();
    for (const select of selects) fillSoundSelect(select, sounds, select.value || getSetting(SETTING_IDS.sound));
    if (announce) showMessage("音效列表已刷新", `找到 ${sounds.length} 个可用音效。`);
    return sounds;
  } catch (error) {
    for (const select of selects) updateSoundMeta(select, [], select.value, true);
    showMessage("读取音效失败", error.message || String(error), "error");
    return [];
  } finally {
    for (const select of selects) select.disabled = false;
  }
}

function renderSoundSelect(_name, setter, value) {
  ensureExecutionSoundStyles();
  const wrapper = document.createElement("div");
  wrapper.className = "yj-es-sound-picker";
  const select = document.createElement("select");
  select.className = "yj-es-sound-select";
  select.dataset.yjExecutionSoundSelect = "true";
  select.setAttribute("aria-label", "使用音效");
  select.append(new Option("正在读取音效列表…", ""));
  const meta = document.createElement("div");
  meta.className = "yj-es-sound-meta";
  meta.textContent = "正在扫描 sounds 文件夹…";
  wrapper.append(select, meta);
  select.addEventListener("change", () => {
    setter(select.value);
    updateSoundMeta(select, select.yjSoundNames || [], select.value);
  });
  fetchSounds()
    .then((sounds) => fillSoundSelect(select, sounds, String(value || "")))
    .catch((error) => {
      fillSoundSelect(select, [], String(value || ""));
      updateSoundMeta(select, [], String(value || ""), true);
      showMessage("读取音效失败", error.message || String(error), "error");
    });
  return wrapper;
}

function makeActionButton(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = "yj-es-action";
  button.addEventListener("click", handler);
  return button;
}

function renderSoundActions() {
  ensureExecutionSoundStyles();
  const container = document.createElement("div");
  container.className = "yj-es-actions";

  const openButton = makeActionButton("打开音效文件夹", async () => {
    try {
      const response = await fetch(OPEN_FOLDER_URL, {
        method: "POST",
        headers: { "X-YJNodes-Request": "1" },
      });
      if (!response.ok) throw new Error(await response.text());
      showMessage("音效文件夹已打开", "放入文件后，请点击“刷新音效列表”。");
    } catch (error) {
      showMessage("无法打开音效文件夹", error.message || String(error), "error");
    }
  });
  const refreshButton = makeActionButton("刷新音效列表", () => refreshSoundSelects(true));
  const testButton = makeActionButton("测试当前音效", () => {
    player.unlock();
    playConfiguredSound(loadConfig());
  });
  container.append(openButton, refreshButton, testButton);
  return container;
}

app.registerExtension({
  name: "ComfyUI-YJNodes.ExecutionSound",
  settings: [
    {
      id: SETTING_IDS.enabled,
      name: "启用工作流完成提示音",
      tooltip: "关闭后不播放任何工作流完成提示音。",
      type: "boolean",
      defaultValue: true,
      category: settingCategory("启用提示音"),
      sortOrder: 50,
    },
    {
      id: SETTING_IDS.mode,
      name: "触发方式",
      tooltip: "选择每个任务完成时播放，或者等整个队列清空后只播放一次。",
      type: renderModeToggle,
      defaultValue: "queue",
      category: settingCategory("触发方式"),
      sortOrder: 40,
    },
    {
      id: SETTING_IDS.sound,
      name: "使用音效",
      tooltip: "音效来自插件根目录的 sounds 文件夹。",
      type: renderSoundSelect,
      defaultValue: "",
      category: settingCategory("使用音效"),
      sortOrder: 30,
    },
    {
      id: SETTING_IDS.volume,
      name: "音量",
      tooltip: "测试播放和工作流完成播放都会使用此音量。",
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.01 },
      defaultValue: 0.7,
      category: settingCategory("音量"),
      sortOrder: 20,
    },
    {
      id: SETTING_IDS.actions,
      name: "音效文件夹与试听",
      tooltip: "放入音效后刷新列表；测试按钮使用当前选择和当前音量。",
      type: renderSoundActions,
      defaultValue: null,
      category: settingCategory("文件夹与试听"),
      sortOrder: 10,
    },
  ],
  async setup() {
    await migrateLegacyConfig();
    globalThis[RUNTIME_KEY]?.cleanup?.();
    api.addEventListener("execution_success", onExecutionSuccess);
    api.addEventListener("status", onStatus);
    const unlockPlayer = () => player.unlock();
    document.addEventListener("pointerdown", unlockPlayer, { once: true, capture: true });
    document.addEventListener("keydown", unlockPlayer, { once: true, capture: true });
    globalThis[RUNTIME_KEY] = {
      cleanup() {
        api.removeEventListener("execution_success", onExecutionSuccess);
        api.removeEventListener("status", onStatus);
        document.removeEventListener("pointerdown", unlockPlayer, { capture: true });
        document.removeEventListener("keydown", unlockPlayer, { capture: true });
        clearTimeout(queueCheckTimer);
        clearTimeout(delayedQueueCheckTimer);
      },
    };
  },
});
