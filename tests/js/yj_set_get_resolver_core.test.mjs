import test from "node:test";
import assert from "node:assert/strict";
import {
  applyResolverOperations,
  buildResolverPlan,
  collectTargets,
  getVariableName,
  graphHasSubgraphs,
  isGetNode,
  isSetNode,
} from "../../web/js/features/set_get_resolver/core.js";

function widget(value, type = "text") {
  return { type, value };
}

test("识别 KJNodes Set/Get 节点及变量名", () => {
  assert.equal(isSetNode({ type: "SetNode" }), true);
  assert.equal(isGetNode({ type: "GetNode" }), true);
  assert.equal(isSetNode({ constructor: { comfyClass: "SetNode" } }), true);
  assert.equal(isGetNode({ constructor: { comfyClass: "GetNode" } }), true);
  assert.equal(isSetNode({ type: "SomeSetNode", title: "SET_foo" }), false);
  assert.equal(isSetNode({ type: "ResetNode" }), false);
  assert.equal(isGetNode({ type: "TargetNode" }), false);
  assert.equal(isGetNode({ type: "PreviewImage" }), false);
  assert.equal(getVariableName({ widgets: [widget(3, "number"), widget("模型")] }), "模型");
});

test("无论 Nodes 2.0 还是 Legacy，都不会把其他节点列入删除计划", () => {
  for (const modern of [true, false]) {
    const source = { id: 1 };
    const setLike = { id: 2, type: "ResetNode", widgets: [widget("same")], inputs: [{ link: 10 }] };
    const getLike = { id: 3, type: "TargetNode", widgets: [widget("same")], outputs: [{ links: [11] }] };
    const nodes = [source, setLike, getLike];
    const links = modern
      ? new Map([[10, { originId: 1, originSlot: 0 }], [11, { originId: 3, targetId: 1, targetSlot: 0 }]])
      : { 10: { origin_id: 1, origin_slot: 0 }, 11: { origin_id: 3, target_id: 1, target_slot: 0 } };
    const graph = modern ? { nodes, links } : { _nodes: nodes, links };
    const plan = buildResolverPlan(graph);
    assert.deepEqual(plan.operations, []);
    assert.deepEqual([...plan.nodesToDelete], []);
  }
});

test("Nodes 2.0 图的 nodes 与 Map 连线可建立转换计划", () => {
  const sourceNode = { id: 1, type: "Source", inputs: [], outputs: [] };
  const setNode = { id: 2, type: "SetNode", widgets: [widget("model")], inputs: [{ link: 10 }] };
  const getNode = { id: 3, type: "GetNode", widgets: [widget("model")], outputs: [{ links: [] }] };
  const graph = { nodes: [sourceNode, setNode, getNode], links: new Map([[10, { originId: 1, originSlot: 0 }]]) };
  const plan = buildResolverPlan(graph, graph.nodes);
  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].sourceNode, sourceNode);
  assert.equal(plan.operations[0].sourceSlot, 0);
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

test("Nodes 2.0 删除 Set 时同时重连 Set 自身和 Get 的下游", () => {
  const calls = [];
  const sourceNode = { id: 1, type: "Source", connect(slot, target, input) {
    calls.push([slot, target.id, input]);
    return { id: calls.length + 20 };
  } };
  const setNode = { id: 2, type: "SetNode", widgets: [widget("x")], inputs: [{ link: 10 }], outputs: [{ links: [12] }] };
  const getNode = { id: 3, type: "GetNode", widgets: [widget("x")], outputs: [{ links: [11] }] };
  const viaGet = { id: 4, inputs: [{ link: 11 }] };
  const viaSet = { id: 5, inputs: [{ link: 12 }] };
  const nodes = [sourceNode, setNode, getNode, viaGet, viaSet];
  const removed = [];
  const graph = {
    nodes,
    links: new Map([
      [10, { originId: 1, originSlot: 0 }],
      [11, { originId: 3, originSlot: 0, targetId: 4, targetSlot: 0 }],
      [12, { originId: 2, originSlot: 0, targetId: 5, targetSlot: 0 }],
    ]),
    remove(node) { removed.push(node); },
  };
  const plan = buildResolverPlan(graph, nodes);
  assert.equal(applyResolverOperations(graph, plan.operations, plan.nodesToDelete), 2);
  assert.deepEqual(calls, [[0, 4, 0], [0, 5, 0]]);
  assert.deepEqual(new Set(removed), new Set([getNode, setNode]));
});

test("Legacy 仅连线模式不改动 Set 自身的输出", () => {
  const calls = [];
  const sourceNode = { id: 1, type: "Source", connect(slot, target, input) {
    calls.push([slot, target.id, input]);
    return { id: 20 };
  } };
  const setNode = { id: 2, type: "SetNode", widgets: [widget("x")], inputs: [{ link: 10 }], outputs: [{ links: [12] }] };
  const getNode = { id: 3, type: "GetNode", widgets: [widget("x")], outputs: [{ links: [11] }] };
  const viaGet = { id: 4, inputs: [{ link: 11 }] };
  const viaSet = { id: 5, inputs: [{ link: 12 }] };
  const graph = {
    _nodes: [sourceNode, setNode, getNode, viaGet, viaSet],
    links: {
      10: { origin_id: 1, origin_slot: 0 },
      11: { origin_id: 3, origin_slot: 0, target_id: 4, target_slot: 0 },
      12: { origin_id: 2, origin_slot: 0, target_id: 5, target_slot: 0 },
    },
  };
  const plan = buildResolverPlan(graph);
  assert.equal(applyResolverOperations(graph, plan.operations), 1);
  assert.deepEqual(calls, [[0, 4, 0]]);
  assert.equal(viaSet.inputs[0].link, 12);
});

test("Legacy 删除模式保留 Set 的直连分支", () => {
  const calls = [];
  const sourceNode = { id: 1, type: "Source", connect(slot, target, input) {
    calls.push([slot, target.id, input]);
    return { id: calls.length + 20 };
  } };
  const setNode = { id: 2, type: "SetNode", widgets: [widget("x")], inputs: [{ link: 10 }], outputs: [{ links: [12] }] };
  const getNode = { id: 3, type: "GetNode", widgets: [widget("x")], outputs: [{ links: [11] }] };
  const viaGet = { id: 4, inputs: [{ link: 11 }] };
  const viaSet = { id: 5, inputs: [{ link: 12 }] };
  const removed = [];
  const graph = {
    _nodes: [sourceNode, setNode, getNode, viaGet, viaSet],
    links: {
      10: { origin_id: 1, origin_slot: 0 },
      11: { origin_id: 3, origin_slot: 0, target_id: 4, target_slot: 0 },
      12: { origin_id: 2, origin_slot: 0, target_id: 5, target_slot: 0 },
    },
    remove(node) { removed.push(node); },
  };
  const plan = buildResolverPlan(graph);
  assert.equal(applyResolverOperations(graph, plan.operations, plan.nodesToDelete), 2);
  assert.deepEqual(calls, [[0, 4, 0], [0, 5, 0]]);
  assert.deepEqual(new Set(removed), new Set([setNode, getNode]));
});

test("connect 修改目标输入后抛错，也恢复全部原连线且不删除节点", () => {
  const targetA = { id: 4, inputs: [{ link: 11 }] };
  const targetB = { id: 5, inputs: [{ link: 12 }] };
  const restored = [];
  const getNode = { id: 3, outputs: [{ links: [11, 12] }], connect(slot, target, input) {
    restored.push(target.id);
    target.inputs[input].link = target.id === 4 ? 11 : 12;
    return { id: target.inputs[input].link };
  } };
  let attempt = 0;
  const sourceNode = { id: 1, connect(slot, target, input) {
    target.inputs[input].link = 20 + attempt;
    if (attempt++ === 1) throw new Error("连接过程中抛错");
    return { id: 20 };
  } };
  const nodes = [sourceNode, getNode, targetA, targetB];
  const removed = [];
  const graph = {
    nodes,
    links: new Map([
      [11, { originId: 3, originSlot: 0, targetId: 4, targetSlot: 0 }],
      [12, { originId: 3, originSlot: 0, targetId: 5, targetSlot: 0 }],
    ]),
    remove(node) { removed.push(node); },
  };
  assert.throws(() => applyResolverOperations(graph, [{ getNode, sourceNode, sourceSlot: 0 }], new Set([getNode])), /连接过程中抛错/);
  assert.deepEqual(restored, [5, 4]);
  assert.equal(targetA.inputs[0].link, 11);
  assert.equal(targetB.inputs[0].link, 12);
  assert.deepEqual(removed, []);
});

test("删除尚未发生就抛错时恢复新连线", () => {
  const target = { id: 3, inputs: [{ link: 11 }] };
  const getNode = { id: 2, outputs: [{ links: [11] }], connect(_slot, node, input) {
    node.inputs[input].link = 11;
    return { id: 11 };
  } };
  const sourceNode = { id: 1, connect(_slot, node, input) {
    node.inputs[input].link = 20;
    return { id: 20 };
  } };
  const graph = {
    nodes: [sourceNode, getNode, target],
    links: new Map([[11, { originId: 2, originSlot: 0, targetId: 3, targetSlot: 0 }]]),
    remove() { throw new Error("删除失败"); },
  };
  assert.throws(() => applyResolverOperations(graph, [{ getNode, sourceNode, sourceSlot: 0 }], new Set([getNode])), /删除失败/);
  assert.equal(target.inputs[0].link, 11);
  assert.ok(graph.nodes.includes(getNode));
});

test("删除部分节点后抛错时重新加入节点并恢复 Set/Get 原连线", () => {
  const nodes = [];
  const links = new Map([
    [10, { originId: 1, originSlot: 0, targetId: 2, targetSlot: 0 }],
    [11, { originId: 3, originSlot: 0, targetId: 4, targetSlot: 0 }],
  ]);
  const target = { id: 4, inputs: [{ link: 11 }] };
  const setNode = { id: 2, type: "SetNode", widgets: [widget("x")], inputs: [{ link: 10 }], outputs: [{ links: [] }] };
  const getNode = { id: 3, type: "GetNode", widgets: [widget("x")], outputs: [{ links: [11] }], connect(_slot, node, input) {
    node.inputs[input].link = 31;
    links.set(31, { originId: 3, originSlot: 0, targetId: node.id, targetSlot: input });
    return { id: 31 };
  } };
  const sourceNode = { id: 1, connect(_slot, node, input) {
    if (node === setNode) {
      node.inputs[input].link = 30;
      links.set(30, { originId: 1, originSlot: 0, targetId: 2, targetSlot: 0 });
      return { id: 30 };
    }
    node.inputs[input].link = 20;
    links.set(20, { originId: 1, originSlot: 0, targetId: 4, targetSlot: 0 });
    return { id: 20 };
  } };
  nodes.push(sourceNode, setNode, getNode, target);
  const graph = {
    nodes, links,
    add(node) { nodes.push(node); },
    remove(node) {
      nodes.splice(nodes.indexOf(node), 1);
      if (node === getNode) links.delete(11);
      if (node === setNode) {
        links.delete(10);
        throw new Error("第二次删除失败");
      }
    },
  };
  const plan = buildResolverPlan(graph, nodes);
  assert.throws(() => applyResolverOperations(graph, plan.operations, plan.nodesToDelete), /第二次删除失败/);
  assert.ok(nodes.includes(setNode));
  assert.ok(nodes.includes(getNode));
  assert.equal(links.get(setNode.inputs[0].link)?.originId, sourceNode.id);
  assert.equal(links.get(target.inputs[0].link)?.originId, getNode.id);
});

test("检测序列化工作流中的子图", () => {
  assert.equal(graphHasSubgraphs({ serialize: () => ({ definitions: { subgraphs: [{}] } }) }), true);
  assert.equal(graphHasSubgraphs({ serialize: () => ({ nodes: [] }) }), false);
});
