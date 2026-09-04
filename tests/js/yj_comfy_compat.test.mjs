import test from "node:test";
import assert from "node:assert/strict";
import {
  beginGraphChange,
  endGraphChange,
  findNodeById,
  focusNode,
  getActiveGraph,
  getGraphNodes,
  getRootGraph,
  getSelectedNodes,
} from "../../web/js/shared/comfy_compat.js";

function node(id) {
  return { id, inputs: [], outputs: [] };
}

test("Nodes 2.0 对象优先于 Legacy 回退对象", () => {
  const modernNode = node(1);
  const modernGraph = { name: "modern", nodes: [modernNode] };
  const rootGraph = { name: "root" };
  const legacyGraph = { name: "legacy" };
  const legacyNode = node(2);
  const app = {
    canvas: {
      graph: modernGraph,
      selectedItems: new Set([modernNode, { id: "group" }]),
      selected_nodes: { 2: legacyNode },
    },
    rootGraph,
    graph: legacyGraph,
  };

  assert.equal(getActiveGraph(app), modernGraph);
  assert.equal(getRootGraph(app), rootGraph);
  assert.deepEqual(getSelectedNodes(app), [modernNode]);
  assert.deepEqual(getGraphNodes(app), [modernNode]);
});

test("Nodes 2.0 聚焦优先使用 selectItems", () => {
  const target = node(9);
  const calls = [];
  const app = {
    canvas: {
      graph: { getNodeById: () => target },
      selectItems: (items) => calls.push(["selectItems", items]),
      selectNode: () => calls.push(["selectNode"]),
      centerOnNode: (item) => calls.push(["center", item]),
    },
  };

  assert.equal(findNodeById(app, 9), target);
  assert.equal(focusNode(app, target), true);
  assert.deepEqual(calls.slice(0, 2), [["selectItems", [target]], ["center", target]]);
});

test("Nodes 2.0 空选择不会回退到 Legacy 的过期选择", () => {
  const legacyNode = node(2);
  const app = {
    canvas: {
      selectedItems: new Set(),
      selected_nodes: { 2: legacyNode },
    },
  };

  assert.deepEqual(getSelectedNodes(app), []);
});

test("Legacy Nodes 聚焦回退到 selectNode", () => {
  const target = node(8);
  const calls = [];
  const app = {
    graph: { _nodes: [target] },
    canvas: {
      selectNode: (item, add) => calls.push(["selectNode", item, add]),
      centerOnNode: (item) => calls.push(["center", item]),
    },
  };

  assert.equal(findNodeById(app, "8"), target);
  focusNode(app, target);
  assert.deepEqual(calls.slice(0, 2), [["selectNode", target, false], ["center", target]]);
});

test("Legacy Nodes 字段在现代对象不存在时仍可使用", () => {
  const legacyGraph = { name: "legacy" };
  const legacyNode = node(2);
  const app = { graph: legacyGraph, canvas: { selected_nodes: { 2: legacyNode } } };

  assert.equal(getActiveGraph(app), legacyGraph);
  assert.equal(getRootGraph(app), legacyGraph);
  assert.deepEqual(getSelectedNodes(app), [legacyNode]);
  legacyGraph._nodes = [legacyNode];
  assert.deepEqual(getGraphNodes(app), [legacyNode]);
});

test("图变更同时通知 Nodes 2.0 画布和 LiteGraph 历史", () => {
  const events = [];
  const graph = {
    beforeChange: () => events.push("graph-before"),
    afterChange: () => events.push("graph-after"),
    setDirtyCanvas: () => events.push("graph-dirty"),
  };
  const app = {
    canvas: {
      emitBeforeChange: () => events.push("canvas-before"),
      emitAfterChange: () => events.push("canvas-after"),
      setDirty: () => events.push("canvas-dirty"),
    },
  };

  beginGraphChange(app, graph);
  endGraphChange(app, graph);
  assert.deepEqual(events, [
    "canvas-before",
    "graph-before",
    "graph-after",
    "canvas-after",
    "graph-dirty",
    "canvas-dirty",
  ]);
});
