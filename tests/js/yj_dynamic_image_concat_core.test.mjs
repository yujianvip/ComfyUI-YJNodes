import test from "node:test";
import assert from "node:assert/strict";
import {
  isDynamicImageConcatNode,
  syncDynamicInputs,
} from "../../web/js/nodes/dynamic_image_concat_core.js";

function makeNode(inputs) {
  return {
    constructor: { comfyClass: "YJDynamicImageBatchConcat" },
    inputs,
    size: [200, 100],
    addInput(name, type) {
      this.inputs.push({ name, type, link: null });
    },
    removeInput(index) {
      this.inputs.splice(index, 1);
    },
    computeSize() {
      return [200, 40 + this.inputs.length * 20];
    },
    setSize(value) {
      this.size = value;
    },
  };
}

test("Nodes 2.0 的 constructor.comfyClass 可识别目标节点", () => {
  assert.equal(
    isDynamicImageConcatNode({ constructor: { comfyClass: "YJDynamicImageBatchConcat" } }),
    true,
  );
});

test("连接最后一个输入后自动添加下一项并通过 setSize 刷新布局", () => {
  const node = makeNode([{ name: "image1", type: "IMAGE", link: 9 }]);
  assert.equal(syncDynamicInputs(node), true);
  assert.deepEqual(node.inputs.map((input) => input.name), ["image1", "image2"]);
  assert.deepEqual(node.size, [200, 80]);
});

test("断开连接后清理多余的动态输入", () => {
  const node = makeNode([
    { name: "image1", type: "IMAGE", link: null },
    { name: "image2", type: "IMAGE", link: null },
    { name: "image3", type: "IMAGE", link: null },
  ]);
  assert.equal(syncDynamicInputs(node), true);
  assert.deepEqual(node.inputs.map((input) => input.name), ["image1", "image2"]);
});
