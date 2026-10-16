import assert from "node:assert/strict";
import test from "node:test";
import { applyLayoutPlan, buildLayoutPlan, classifyNode } from "../../web/js/features/workflow_layout/core.js";

test("classifies common ComfyUI workflow roles", () => {
  assert.equal(classifyNode({ type: "UNETLoader" }), "model");
  assert.equal(classifyNode({ type: "CLIPLoader" }), "model");
  assert.equal(classifyNode({ type: "LoadImage" }), "input");
  assert.equal(classifyNode({ type: "KSampler" }), "sampling");
  assert.equal(classifyNode({ type: "SaveImage" }), "output");
});

test("creates compact module groups and keeps model loaders vertically ordered", () => {
  const nodes = [
    { id: 1, type: "UNETLoader", size: [200, 80] },
    { id: 2, type: "CLIPLoader", size: [200, 80] },
    { id: 3, type: "VAELoader", size: [200, 80] },
    { id: 4, type: "KSampler", size: [200, 80] },
    { id: 5, type: "SaveImage", size: [200, 80] },
  ];
  const result = buildLayoutPlan(nodes, { links: [{ origin_id: 1, target_id: 4 }, { origin_id: 4, target_id: 5 }] }, "zh");
  const byId = new Map(result.plan.map((item) => [item.id, item]));
  assert.ok(byId.get("1").pos[1] < byId.get("2").pos[1]);
  assert.ok(byId.get("2").pos[1] < byId.get("3").pos[1]);
  assert.equal(byId.get("1").pos[0], byId.get("2").pos[0]);
  assert.equal(byId.get("2").pos[0], byId.get("3").pos[0]);
  assert.ok(result.groups.some((group) => group.title === "模型加载"));
  assert.ok(result.groups.some((group) => group.title === "采样"));
});

test("模型加载顺序不依赖原工作流的节点顺序", () => {
  const nodes = [
    { id: 3, type: "VAELoader", size: [200, 80] },
    { id: 2, type: "CLIPLoader", size: [200, 80] },
    { id: 1, type: "UNETLoader", size: [200, 80] },
  ];
  const positions = new Map(buildLayoutPlan(nodes, {}).plan.map((item) => [item.id, item.pos]));
  assert.ok(positions.get("1")[1] < positions.get("2")[1]);
  assert.ok(positions.get("2")[1] < positions.get("3")[1]);
});

test("Nodes 2.0 的 Map 连线和 camelCase 节点 ID 决定布局顺序", () => {
  const upstream = { id: 1, type: "KSampler", size: [200, 80] };
  const downstream = { id: 2, type: "KSampler", size: [200, 80] };
  const graph = { links: new Map([[10, { originId: 1, targetId: 2 }]]) };
  const result = buildLayoutPlan([downstream, upstream], graph);
  assert.deepEqual(result.plan.map((item) => item.id), ["1", "2"]);
  assert.deepEqual(result.plan.map((item) => item.depth), [0, 1]);
});

test("Legacy Nodes 的对象连线仍按依赖排序", () => {
  const upstream = { id: 1, type: "KSampler", size: [200, 80] };
  const downstream = { id: 2, type: "KSampler", size: [200, 80] };
  const graph = { links: { 10: { origin_id: 1, target_id: 2 } } };
  assert.deepEqual(buildLayoutPlan([downstream, upstream], graph).plan.map((item) => item.id), ["1", "2"]);
});

test("整理时保留用户分组，只替换插件创建的分组", () => {
  const previousGroupClass = globalThis.LGraphGroup;
  globalThis.LGraphGroup = class {
    #position = [10, 10];
    #size = [140, 80];
    constructor(title) {
      this.title = title;
      this.flags = {};
      this.color = "";
      this.font_size = 12;
      Object.seal(this);
    }
    get pos() { return this.#position; }
    set pos(value) { this.#position = value; }
    get size() { return this.#size; }
    set size(value) { this.#size = value; }
  };
  try {
    const userGroup = { title: "我的分组" };
    const graph = {
      _groups: [userGroup],
      add(group) { this._groups.push(group); },
      remove(group) { this._groups.splice(this._groups.indexOf(group), 1); },
    };
    const nodes = [{ id: 1, type: "KSampler", size: [200, 80], pos: [0, 0] }];
    const plan = buildLayoutPlan(nodes, graph, "zh");
    applyLayoutPlan(graph, plan);
    graph._groups[1] = { title: graph._groups[1].title, flags: { ...graph._groups[1].flags } };
    applyLayoutPlan(graph, plan);
    assert.equal(graph._groups[0], userGroup);
    assert.equal(graph._groups.length, 2);
    assert.equal(graph._groups[1].flags.yjNodesWorkflowLayout, true);
    const [x, y, width, height] = plan.groups[0].bounding;
    assert.deepEqual(graph._groups[1].pos, [x, y]);
    assert.deepEqual(graph._groups[1].size, [width, height]);
  } finally {
    globalThis.LGraphGroup = previousGroupClass;
  }
});

test("Legacy 分组的 pos 和 size 字段也正确设置", () => {
  const previousGroupClass = globalThis.LGraphGroup;
  globalThis.LGraphGroup = class {
    constructor(title) { this.title = title; this.pos = [10, 10]; this.size = [140, 80]; }
  };
  try {
    const node = { id: 1, type: "SaveImage", pos: [100, 100], size: [200, 80] };
    const graph = { _groups: [], add(group) { this._groups.push(group); } };
    const plan = buildLayoutPlan([node], graph);
    applyLayoutPlan(graph, plan);
    const [x, y, width, height] = plan.groups[0].bounding;
    assert.deepEqual(graph._groups[0].pos, [x, y]);
    assert.deepEqual(graph._groups[0].size, [width, height]);
  } finally {
    globalThis.LGraphGroup = previousGroupClass;
  }
});

test("Nodes 2.0 手工分组内的节点保持原位，其余节点移到分组右侧", () => {
  const manualGroup = { title: "手工分组", getBounding: () => [100, 100, 400, 220] };
  const grouped = { id: 1, type: "KSampler", pos: [150, 140], size: [200, 80] };
  const free = { id: 2, type: "SaveImage", pos: [650, 140], size: [200, 80] };
  const graph = { groups: [manualGroup], links: new Map() };
  const plan = buildLayoutPlan([grouped, free], graph);
  assert.deepEqual(plan.plan.map((item) => item.id), ["2"]);
  assert.ok(plan.plan[0].pos[0] >= 572);
  const original = [...grouped.pos];
  applyLayoutPlan(graph, plan);
  assert.deepEqual(grouped.pos, original);
  assert.equal(graph.groups[0], manualGroup);
});

test("Legacy 手工分组也固定内部节点，分组外节点正常整理", () => {
  const manualGroup = { title: "手工分组", pos: [100, 100], size: [400, 220] };
  const grouped = { id: 1, type: "KSampler", pos: [150, 140], size: [200, 80] };
  const free = { id: 2, type: "SaveImage", pos: [650, 140], size: [200, 80] };
  const graph = { _groups: [manualGroup], links: {} };
  const plan = buildLayoutPlan([grouped, free], graph);
  assert.deepEqual(plan.plan.map((item) => item.id), ["2"]);
  assert.ok(plan.plan[0].pos[0] >= 572);
  applyLayoutPlan(graph, plan);
  assert.deepEqual(grouped.pos, [150, 140]);
  assert.equal(graph._groups[0], manualGroup);
});
