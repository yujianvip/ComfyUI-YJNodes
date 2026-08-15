import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("web/js/features/set_get_resolver/core.js", "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
  applyResolverOperations,
  buildResolverPlan,
  collectTargets,
  getVariableName,
  graphHasSubgraphs,
  isGetNode,
  isSetNode,
} = await import(moduleUrl);

function widget(value, type = "text") {
  return { type, value };
}

test("识别 KJNodes Set/Get 节点及变量名", () => {
  assert.equal(isSetNode({ type: "SetNode" }), true);
  assert.equal(isGetNode({ type: "GetNode" }), true);
  assert.equal(isSetNode({ type: "SomeSetNode", title: "SET_foo" }), true);
  assert.equal(isGetNode({ type: "PreviewImage" }), false);
  assert.equal(getVariableName({ widgets: [widget(3, "number"), widget("模型")] }), "模型");
});

test("按变量名建立 Set 上游到 Get 的转换计划", () => {
  const source = { id: 1, type: "CheckpointLoaderSimple" };
  const setNode = {
    id: 2,
    type: "SetNode",
    widgets: [widget("model")],
    inputs: [{ link: 10 }],
  };
  const getNode = {
    id: 3,
    type: "GetNode",
    widgets: [widget("model")],
    outputs: [{ links: [11, 12] }],
  };
  const targetA = { id: 4, type: "Sampler" };
  const targetB = { id: 5, type: "Preview" };
  const nodes = [source, setNode, getNode, targetA, targetB];
  const graph = {
    _nodes: nodes,
    links: {
      10: { origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0 },
      11: { origin_id: 3, origin_slot: 0, target_id: 4, target_slot: 1 },
      12: { origin_id: 3, origin_slot: 0, target_id: 5, target_slot: 0 },
    },
    getNodeById(id) {
      return nodes.find((node) => node.id === id);
    },
  };

  const plan = buildResolverPlan(graph);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].sourceNode, source);
  assert.equal(plan.operations[0].sourceSlot, 0);
  assert.deepEqual(new Set(plan.nodesToDelete), new Set([setNode, getNode]));
  assert.deepEqual(collectTargets(graph, getNode), [
    { targetNode: targetA, targetSlot: 1 },
    { targetNode: targetB, targetSlot: 0 },
  ]);

  const connections = [];
  source.connect = (...args) => {
    connections.push(args);
    return { id: connections.length };
  };
  const removed = [];
  graph.remove = (node) => removed.push(node);
  const connectedCount = applyResolverOperations(
    graph,
    plan.operations,
    plan.nodesToDelete,
  );
  assert.equal(connectedCount, 2);
  assert.deepEqual(connections, [
    [0, targetA, 1],
    [0, targetB, 0],
  ]);
  assert.deepEqual(new Set(removed), new Set([setNode, getNode]));
});

test("忽略无上游 Set、变量名不匹配的 Get 和失效连线", () => {
  const setNode = {
    id: 1,
    type: "SetNode",
    widgets: [widget("a")],
    inputs: [{ link: null }],
  };
  const getNode = {
    id: 2,
    type: "GetNode",
    widgets: [widget("b")],
    outputs: [{ links: [99] }],
  };
  const graph = { _nodes: [setNode, getNode], links: {} };

  const plan = buildResolverPlan(graph);
  assert.equal(plan.setNodes.length, 1);
  assert.equal(plan.getNodes.length, 1);
  assert.equal(plan.operations.length, 0);
  assert.deepEqual(collectTargets(graph, getNode), []);
});

test("一个 Set 可以安全转换多个 Get", () => {
  const source = { id: 1, connect() {} };
  const setNode = {
    id: 2,
    type: "SetNode",
    widgets: [widget("shared")],
    inputs: [{ link: 10 }],
  };
  const getA = { id: 3, type: "GetNode", widgets: [widget("shared")] };
  const getB = { id: 4, type: "GetNode", widgets: [widget("shared")] };
  const nodes = [source, setNode, getA, getB];
  const graph = {
    _nodes: nodes,
    links: { 10: { origin_id: 1, origin_slot: 2 } },
    getNodeById(id) {
      return nodes.find((node) => node.id === id);
    },
  };

  const plan = buildResolverPlan(graph);
  assert.equal(plan.operations.length, 2);
  assert.deepEqual(plan.operations.map((operation) => operation.getNode), [getA, getB]);
  assert.deepEqual(new Set(plan.nodesToDelete), new Set([setNode, getA, getB]));
  assert.deepEqual(plan.conflicts, []);
});

test("多个同名 Set 不会被静默覆盖，并跳过受影响的 Get", () => {
  const sourceA = { id: 1 };
  const sourceB = { id: 2 };
  const setA = {
    id: 3,
    type: "SetNode",
    widgets: [widget("duplicate")],
    inputs: [{ link: 10 }],
  };
  const setB = {
    id: 4,
    type: "SetNode",
    widgets: [widget("duplicate")],
    inputs: [{ link: null }],
  };
  const getNode = { id: 5, type: "GetNode", widgets: [widget("duplicate")] };
  const nodes = [sourceA, setA, sourceB, setB, getNode];
  const graph = {
    _nodes: nodes,
    links: {
      10: { origin_id: 1, origin_slot: 0 },
    },
    getNodeById(id) {
      return nodes.find((node) => node.id === id);
    },
  };

  const plan = buildResolverPlan(graph);
  assert.equal(plan.operations.length, 0);
  assert.equal(plan.nodesToDelete.size, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].variableName, "duplicate");
  assert.deepEqual(plan.conflicts[0].setNodes, [setA, setB]);
  assert.deepEqual(plan.conflicts[0].getNodes, [getNode]);
});

test("新连线失败时恢复已替换的 Get 连线且不删除节点", () => {
  const restored = [];
  const getNode = {
    id: 2,
    outputs: [{ links: [10, 11] }],
    connect: (...args) => {
      restored.push(args);
      return { id: 99 };
    },
  };
  const targetA = { id: 3 };
  const targetB = { id: 4 };
  let attempt = 0;
  const sourceNode = {
    id: 1,
    connect() {
      attempt += 1;
      return attempt === 1 ? { id: 20 } : null;
    },
  };
  const nodes = [sourceNode, getNode, targetA, targetB];
  const removed = [];
  const graph = {
    _nodes: nodes,
    links: {
      10: { target_id: 3, target_slot: 0 },
      11: { target_id: 4, target_slot: 1 },
    },
    getNodeById(id) {
      return nodes.find((node) => node.id === id);
    },
    remove(node) {
      removed.push(node);
    },
  };

  assert.throws(
    () => applyResolverOperations(
      graph,
      [{ getNode, sourceNode, sourceSlot: 0 }],
      new Set([getNode]),
    ),
    /无法连接节点/,
  );
  assert.deepEqual(restored, [[0, targetA, 0]]);
  assert.deepEqual(removed, []);
});

test("检测序列化工作流中的子图", () => {
  assert.equal(graphHasSubgraphs({ serialize: () => ({ definitions: { subgraphs: [{}] } }) }), true);
  assert.equal(graphHasSubgraphs({ serialize: () => ({ nodes: [] }) }), false);
});
