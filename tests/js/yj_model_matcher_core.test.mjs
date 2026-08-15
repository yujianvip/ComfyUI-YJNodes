import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const coreSource = readFileSync("web/js/features/model_matcher/core.js", "utf8");
const coreModule = await import(`data:text/javascript;base64,${Buffer.from(coreSource).toString("base64")}`);
const {
  buildModelCatalog,
  buildSerializedNodeMap,
  classifyModelWidget,
  defaultCandidateName,
  extractModelReferencesFromNode,
  getModelTypesForWidget,
  isModelDropdown,
  isModelValueAvailable,
} = coreModule;

test("只默认选择后端确认可自动替换的最高分候选", () => {
  assert.equal(
    defaultCandidateName([
      { name: "highest.safetensors", score: 95, auto_select: true },
      { name: "lower.safetensors", score: 60 },
    ]),
    "highest.safetensors",
  );
  assert.equal(
    defaultCandidateName([{ name: "ambiguous.safetensors", score: 100, auto_select: false }]),
    "",
  );
  assert.equal(defaultCandidateName([]), "");
});

const catalog = buildModelCatalog([
  { type: "checkpoints", name: "sdxl/base.safetensors" },
  { type: "vae", name: "ae.safetensors" },
]);

test("模型目录下拉框会加入替换列表", () => {
  const widget = {
    type: "combo",
    value: "missing-model.safetensors",
    options: { values: ["sdxl/base.safetensors"] },
  };

  assert.equal(isModelDropdown(widget, catalog), true);
  assert.deepEqual(getModelTypesForWidget(widget, catalog), ["checkpoints"]);
});

test("普通文件下拉框即使扩展名相同也不会加入", () => {
  const widget = {
    type: "combo",
    value: "input/example.safetensors",
    options: { values: ["input/example.safetensors"] },
  };

  assert.equal(isModelDropdown(widget, catalog), false);
});

test("非下拉文本控件不会加入", () => {
  const widget = { type: "text", value: "sdxl/base.safetensors" };

  assert.equal(isModelDropdown(widget, catalog, { type: "CLIPTextEncode" }), false);
});

test("当前模型仍在下拉选项中时不会被当成缺失模型", () => {
  const widget = {
    type: "combo",
    value: "SDXL\\BASE.safetensors",
    options: { values: ["sdxl/base.safetensors"] },
  };

  assert.equal(isModelValueAvailable(widget), true);
  assert.deepEqual(extractModelReferencesFromNode(
    { id: 1, type: "CheckpointLoaderSimple", widgets: [widget] },
    null,
    catalog,
  ), []);
});

test("同名文件跨模型分类且无法消歧时跳过", () => {
  const ambiguousCatalog = buildModelCatalog([
    { type: "checkpoints", name: "shared.safetensors" },
    { type: "vae", name: "shared.safetensors" },
  ]);
  const widget = {
    type: "combo",
    value: "shared.safetensors",
    options: { values: ["shared.safetensors"] },
  };

  assert.deepEqual(classifyModelWidget(widget, {}, ambiguousCatalog), {
    modelTypes: [],
    conflict: true,
    evidence: "catalog_conflict",
  });
  assert.equal(isModelDropdown(widget, ambiguousCatalog), false);
});

test("按整个下拉选项的重合数量确定唯一模型分类", () => {
  const overlapCatalog = buildModelCatalog([
    { type: "checkpoints", name: "shared.safetensors" },
    { type: "checkpoints", name: "checkpoint-only.safetensors" },
    { type: "vae", name: "shared.safetensors" },
  ]);
  const widget = {
    type: "combo",
    value: "missing.safetensors",
    options: { values: ["shared.safetensors", "checkpoint-only.safetensors"] },
  };

  assert.deepEqual(getModelTypesForWidget(widget, overlapCatalog), ["checkpoints"]);
});

test("模型目录为空时用明确的控件名识别分类", () => {
  const widget = { type: "combo", name: "control_net_name", value: "missing.safetensors", options: { values: [] } };

  assert.deepEqual(
    classifyModelWidget(
      widget,
      { type: "ControlNetLoader" },
      buildModelCatalog(
        [{ type: "checkpoints", name: "installed.safetensors" }],
        ["checkpoints", "controlnet"],
      ),
    ),
    {
      modelTypes: ["controlnet"],
      conflict: false,
      evidence: "widget_name",
    },
  );
});

test("UNKNOWN 节点从序列化 widgets_values 读取模型并设为只读", () => {
  const unknownCatalog = buildModelCatalog([{ type: "diffusion_models", name: "installed.safetensors" }]);
  const node = {
    id: 22,
    type: "UNKNOWN",
    widgets: [{
      name: "unet_name",
      value: "garbled-value.safetensors",
      options: { values: ["installed.safetensors"] },
    }],
  };
  const serialized = {
    id: 22,
    type: "UNETLoader",
    widgets_values: ["missing-video-model.safetensors", "普通提示词"],
  };

  const references = extractModelReferencesFromNode(node, serialized, unknownCatalog);

  assert.equal(references.length, 1);
  assert.equal(references[0].value, "missing-video-model.safetensors");
  assert.deepEqual(references[0].model_types, ["diffusion_models"]);
  assert.equal(references[0].source, "serialized_widgets_values");
  assert.equal(references[0].can_apply, false);
  assert.equal(references[0].is_unknown_node, true);
});

test("序列化节点映射按数字 id 建立", () => {
  const map = buildSerializedNodeMap({ nodes: [{ id: "5", widgets_values: [] }] });
  assert.equal(map.get(5).id, "5");
});

test("unregistered original node type is handled as UNKNOWN", () => {
  const unknownCatalog = buildModelCatalog([
    { type: "diffusion_models", name: "installed.safetensors" },
  ]);
  const node = { id: 23, type: "MissingUNETLoader", widgets: [] };
  const serialized = {
    id: 23,
    type: "MissingUNETLoader",
    widgets_values: ["missing.safetensors"],
  };

  const references = extractModelReferencesFromNode(
    node,
    serialized,
    unknownCatalog,
    { CheckpointLoaderSimple: class {} },
  );

  assert.equal(references.length, 1);
  assert.equal(references[0].value, "missing.safetensors");
  assert.equal(references[0].can_apply, false);
  assert.equal(references[0].is_unknown_node, true);
});
