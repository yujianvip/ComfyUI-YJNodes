// 与界面无关的纯逻辑集中在这里，便于独立测试。
export const DEFAULT_EXECUTION_SOUND_CONFIG = Object.freeze({
  enabled: true,
  mode: "queue",
  sound: "",
  volume: 0.7,
});

export function normalizeExecutionSoundConfig(value) {
  const config = value && typeof value === "object" ? value : {};
  const volume = Number(config.volume);
  return {
    enabled: config.enabled !== false,
    mode: config.mode === "each" ? "each" : "queue",
    sound: typeof config.sound === "string" ? config.sound : "",
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.7,
  };
}

export class CompletionPolicy {
  constructor() {
    this.pendingQueueSound = false;
    this.seenPromptIds = new Set();
  }

  handleSuccess(promptId, mode) {
    if (promptId && this.seenPromptIds.has(promptId)) return "ignore";
    if (promptId) {
      this.seenPromptIds.add(promptId);
      if (this.seenPromptIds.size > 200) {
        this.seenPromptIds.delete(this.seenPromptIds.values().next().value);
      }
    }

    if (mode === "each") return "play";
    this.pendingQueueSound = true;
    return "wait";
  }

  finishQueueIfEmpty(isEmpty) {
    if (!isEmpty || !this.pendingQueueSound) return false;
    this.pendingQueueSound = false;
    return true;
  }
}
