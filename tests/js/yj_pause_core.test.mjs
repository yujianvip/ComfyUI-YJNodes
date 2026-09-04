import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRemaining,
  isPauseNode,
  normalizePauseState,
  syncPauseConnectionType,
} from "../../web/js/nodes/pause_core.js";

function pauseNode() {
  return {
    id: 2,
    type: "YJpause",
    inputs: [{ type: "*", link: 10 }],
    outputs: [{ type: "*", links: [11] }],
  };
}

test("Nodes 2.0 的 constructor.comfyClass 可识别 YJpause", () => {
  assert.equal(isPauseNode({ constructor: { comfyClass: "YJpause" } }), true);
});

test("Legacy 图从上游输出同步真实连线类型", () => {
  const node = pauseNode();
  const origin = { id: 1, outputs: [{ type: "LATENT" }] };
  const graph = {
    _nodes: [origin, node],
    links: { 10: { origin_id: 1, origin_slot: 0, type: "LATENT" } },
    getNodeById(id) { return this._nodes.find((item) => item.id === Number(id)); },
  };

  assert.equal(syncPauseConnectionType(node, graph), "LATENT");
  assert.equal(node.inputs[0].type, "LATENT");
  assert.equal(node.outputs[0].type, "LATENT");
});

test("Nodes 2.0 图支持 Map links 与 camelCase 连接字段", () => {
  const node = pauseNode();
  node.inputs[0].link = null;
  const target = { id: 3, inputs: [{ type: "IMAGE" }] };
  const nodes = new Map([[2, node], [3, target]]);
  const graph = {
    links: new Map([[11, { targetId: 3, targetSlot: 0, type: "IMAGE" }]]),
    getNodeById(id) { return nodes.get(Number(id)); },
  };

  assert.equal(syncPauseConnectionType(node, graph), "IMAGE");
  assert.equal(node.outputs[0].type, "IMAGE");
});

test("断开连接后恢复为宽类型", () => {
  const node = pauseNode();
  node.inputs[0].link = null;
  node.outputs[0].links = [];

  assert.equal(syncPauseConnectionType(node, {}), "*");
});

test("暂停状态规范化并格式化剩余时间", () => {
  const state = normalizePauseState({
    session_id: "s",
    node_id: 4,
    prompt_id: "p",
    state: "paused",
    timeout_minutes: 2,
    remaining_seconds: 65,
  });

  assert.equal(state.node_id, "4");
  assert.equal(formatRemaining(state.remaining_seconds), "01:05");
  assert.equal(formatRemaining(null), null);
  assert.equal(normalizePauseState({ state: "paused" }), null);
});
