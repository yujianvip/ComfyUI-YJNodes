import { app } from "../../../../../scripts/app.js";
import { api } from "../../../../../scripts/api.js";
import {
  CompletionPolicy,
  normalizeExecutionSoundConfig,
} from "./core.js";
import { getCurrentLanguage, messageFor } from "../../shared/i18n.js";

const LEGACY_STORAGE_KEY = "ComfyUI-YJNodes.ExecutionSound";
const SOUND_LIST_URL = "/yj_nodes/execution_sound/sounds";
const OPEN_FOLDER_URL = "/yj_nodes/execution_sound/open_folder";
const SOUND_FILE_URL = "/yj_nodes/execution_sound/file/";
const RUNTIME_KEY = Symbol.for("ComfyUI-YJNodes.executionSoundRuntime");
const MESSAGES = {
  zh: {
    category: "工作流完成提示音", unsupportedAudio: "当前环境不支持音频播放", readSoundFailed: "读取音效失败",
    selectSoundFirst: "请先选择音效", readListFailed: "读取音效列表失败", playbackFailed: "提示音播放失败",
    triggerMode: "提示音触发方式", queue: "队列完成", each: "每个任务",
    queueHint: "整个队列清空后只播放一次", eachHint: "每完成一个工作流任务就播放一次",
    backendUnavailable: "读取失败，请确认 ComfyUI 已加载插件后端", emptyFolder: "音效文件夹为空，放入文件后点击“刷新音效列表”",
    missingCurrent: (count) => `${count} 个可用 · 当前文件已不存在`, current: (count, name) => `${count} 个可用 · 当前：${name}`,
    available: (count) => `${count} 个音效可用`, chooseSound: "选择完成提示音…", missingFile: (name) => `文件不存在：${name}`,
    refreshed: "音效列表已刷新", found: (count) => `找到 ${count} 个可用音效。`, loadingList: "正在读取音效列表…",
    scanning: "正在扫描 sounds 文件夹…", usingSound: "使用音效", openFolder: "打开音效文件夹",
    folderOpened: "音效文件夹已打开", folderOpenedHint: "放入文件后，请点击“刷新音效列表”。",
    openFolderFailed: "无法打开音效文件夹", refreshList: "刷新音效列表", testSound: "测试当前音效",
    enable: "启用工作流完成提示音", enableHint: "关闭后不播放任何工作流完成提示音。", enableCategory: "启用提示音",
    mode: "触发方式", modeHint: "选择每个任务完成时播放，或者等整个队列清空后只播放一次。",
    sound: "使用音效", soundHint: "音效来自插件根目录的 sounds 文件夹。",
    volume: "音量", volumeHint: "测试播放和工作流完成播放都会使用此音量。",
    actions: "音效文件夹与试听", actionsHint: "放入音效后刷新列表；测试按钮使用当前选择和当前音量。", actionsCategory: "文件夹与试听",
  },
  en: {
    category: "Workflow Completion Sound", unsupportedAudio: "Audio playback is not supported in this environment", readSoundFailed: "Failed to load sound",
    selectSoundFirst: "Select a sound first", readListFailed: "Failed to load the sound list", playbackFailed: "Sound playback failed",
    triggerMode: "Sound trigger mode", queue: "Queue complete", each: "Each task",
    queueHint: "Play once when the whole queue is empty", eachHint: "Play after each workflow task completes",
    backendUnavailable: "Failed to load; confirm that ComfyUI loaded the plugin backend", emptyFolder: "The sounds folder is empty. Add files and refresh the list.",
    missingCurrent: (count) => `${count} available · selected file is missing`, current: (count, name) => `${count} available · current: ${name}`,
    available: (count) => `${count} sounds available`, chooseSound: "Choose a completion sound…", missingFile: (name) => `Missing file: ${name}`,
    refreshed: "Sound list refreshed", found: (count) => `Found ${count} available sounds.`, loadingList: "Loading sound list…",
    scanning: "Scanning the sounds folder…", usingSound: "Sound", openFolder: "Open sounds folder",
    folderOpened: "Sounds folder opened", folderOpenedHint: "Add files, then refresh the sound list.",
    openFolderFailed: "Could not open sounds folder", refreshList: "Refresh sound list", testSound: "Test selected sound",
    enable: "Enable workflow completion sound", enableHint: "Turn off to disable all workflow completion sounds.", enableCategory: "Enable sound",
    mode: "Trigger mode", modeHint: "Play after each task or once when the queue is empty.",
    sound: "Sound", soundHint: "Sounds come from this plugin's sounds folder.",
    volume: "Volume", volumeHint: "Used for both test and completion playback.",
    actions: "Sounds folder and preview", actionsHint: "Refresh after adding sounds; test uses the selected sound and volume.", actionsCategory: "Folder and preview",
  },
};

function t(key, ...args) {
  const value = messageFor(MESSAGES, getCurrentLanguage(app), key);
  return typeof value === "function" ? value(...args) : value;
}
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
  return ["YJNodes", t("category"), label];
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
    if (!this.context) throw new Error(t("unsupportedAudio"));
    if (!this.buffers.has(name)) {
      const promise = fetch(`${SOUND_FILE_URL}${encodeURIComponent(name)}`)
        .then((response) => {
          if (!response.ok) throw new Error(`${t("readSoundFailed")}: HTTP ${response.status}`);
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
    if (!name) throw new Error(t("selectSoundFirst"));
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
  if (!response.ok) throw new Error(`${t("readListFailed")}: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.sounds) ? payload.sounds : [];
}

async function playConfiguredSound(config = loadConfig(), reportError = true) {
  try {
    await player.play(config.sound, config.volume);
  } catch (error) {
    console.error("[ComfyUI-YJNodes] execution sound failed", error);
    if (reportError) showMessage(t("playbackFailed"), error.message || String(error), "error");
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
  container.setAttribute("aria-label", t("triggerMode"));

  const choices = [
    { value: "queue", label: t("queue") },
    { value: "each", label: t("each") },
  ];
  let current = value === "each" ? "each" : "queue";
  const buttons = choices.map((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = choice.label;
    button.setAttribute("role", "radio");
    button.title = choice.value === "queue"
      ? t("queueHint")
      : t("eachHint");
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
    meta.textContent = t("backendUnavailable");
    meta.dataset.state = "error";
  } else if (!sounds.length) {
    meta.textContent = t("emptyFolder");
    meta.dataset.state = "warning";
  } else if (selected && !sounds.includes(selected)) {
    meta.textContent = t("missingCurrent", sounds.length);
    meta.dataset.state = "warning";
  } else {
    meta.textContent = selected
      ? t("current", sounds.length, selected)
      : t("available", sounds.length);
    meta.dataset.state = "ready";
  }
}

function fillSoundSelect(select, sounds, selected) {
  select.replaceChildren(new Option(t("chooseSound"), ""));
  for (const name of sounds) select.add(new Option(name, name));
  if (selected && !sounds.includes(selected)) {
    select.add(new Option(t("missingFile", selected), selected));
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
    if (announce) showMessage(t("refreshed"), t("found", sounds.length));
    return sounds;
  } catch (error) {
    for (const select of selects) updateSoundMeta(select, [], select.value, true);
    showMessage(t("readSoundFailed"), error.message || String(error), "error");
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
  select.setAttribute("aria-label", t("usingSound"));
  select.append(new Option(t("loadingList"), ""));
  const meta = document.createElement("div");
  meta.className = "yj-es-sound-meta";
  meta.textContent = t("scanning");
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
      showMessage(t("readSoundFailed"), error.message || String(error), "error");
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

  const openButton = makeActionButton(t("openFolder"), async () => {
    try {
      const response = await fetch(OPEN_FOLDER_URL, {
        method: "POST",
        headers: { "X-YJNodes-Request": "1" },
      });
      if (!response.ok) throw new Error(await response.text());
      showMessage(t("folderOpened"), t("folderOpenedHint"));
    } catch (error) {
      showMessage(t("openFolderFailed"), error.message || String(error), "error");
    }
  });
  const refreshButton = makeActionButton(t("refreshList"), () => refreshSoundSelects(true));
  const testButton = makeActionButton(t("testSound"), () => {
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
      name: t("enable"),
      tooltip: t("enableHint"),
      type: "boolean",
      defaultValue: true,
      category: settingCategory(t("enableCategory")),
      sortOrder: 50,
    },
    {
      id: SETTING_IDS.mode,
      name: t("mode"),
      tooltip: t("modeHint"),
      type: renderModeToggle,
      defaultValue: "queue",
      category: settingCategory(t("mode")),
      sortOrder: 40,
    },
    {
      id: SETTING_IDS.sound,
      name: t("sound"),
      tooltip: t("soundHint"),
      type: renderSoundSelect,
      defaultValue: "",
      category: settingCategory(t("sound")),
      sortOrder: 30,
    },
    {
      id: SETTING_IDS.volume,
      name: t("volume"),
      tooltip: t("volumeHint"),
      type: "slider",
      attrs: { min: 0, max: 1, step: 0.01 },
      defaultValue: 0.7,
      category: settingCategory(t("volume")),
      sortOrder: 20,
    },
    {
      id: SETTING_IDS.actions,
      name: t("actions"),
      tooltip: t("actionsHint"),
      type: renderSoundActions,
      defaultValue: null,
      category: settingCategory(t("actionsCategory")),
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
