import assert from "node:assert/strict";
import test from "node:test";

import {
  CompletionPolicy,
  normalizeExecutionSoundConfig,
} from "../../web/js/features/execution_sound/core.js";

test("normalizes invalid config values", () => {
  assert.deepEqual(normalizeExecutionSoundConfig({ mode: "bad", volume: 3, sound: 1 }), {
    enabled: true,
    mode: "queue",
    sound: "",
    volume: 1,
  });
});

test("each mode triggers once for each prompt", () => {
  const policy = new CompletionPolicy();
  assert.equal(policy.handleSuccess("p1", "each"), "play");
  assert.equal(policy.handleSuccess("p1", "each"), "ignore");
  assert.equal(policy.handleSuccess("p2", "each"), "play");
});

test("queue mode waits and only triggers when the queue is empty", () => {
  const policy = new CompletionPolicy();
  assert.equal(policy.handleSuccess("p1", "queue"), "wait");
  assert.equal(policy.finishQueueIfEmpty(false), false);
  assert.equal(policy.finishQueueIfEmpty(true), true);
  assert.equal(policy.finishQueueIfEmpty(true), false);
});
