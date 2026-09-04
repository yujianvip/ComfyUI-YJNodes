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
  filterModelCandidates,
  getModelTypesForWidget,
  groupMatcherResults,
  isModelDropdown,
  isModelValueAvailable,
  modelSearchName,
  resolveWidgetChoice,
  shouldSkipCandidateByDefault,
  shouldDisableCandidateSelect,
} = coreModule;

test("外部搜索只使用模型文件名", () => {
  assert.equal(modelSearchName("checkpoints/SDXL/model.safetensors"), "model.safetensors");
  assert.equal(modelSearchName("text_encoders\\Qwen\\clip-fp8.safetensors"), "clip-fp8.safetensors");
  assert.equal(modelSearchName("standalone.gguf"), "standalone.gguf");
});

test("写回模型时使用下拉框原有的 Windows 路径", () => {
  const widget = { options: { values: ["Qwen\\clip-fp8.safetensors"] } };
  assert.equal(
    resolveWidgetChoice(widget, "Qwen/clip-fp8.safetensors"),
    "Qwen\\clip-fp8.safetensors",
  );
});

test("同一双 CLIP 节点的两个结果合并到一个外框", () => {
  const groups = groupMatcherResults([
    { node_id: 1, widget_name: "clip_name1" },
    { node_id: 1, widget_name: "clip_name2" },
    { node_id: 2, widget_name: "clip_name1" },
    { node_id: 3, widget_name: "vae_name" },
  ]);

  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].map((item) => item.widget_name), ["clip_name1", "clip_name2"]);
  assert.equal(groups[1].length, 1);
  assert.equal(groups[2].length, 1);
});

test("候选搜索按模型路径过滤且忽略大小写", () => {
  const candidates = [
    { name: "Qwen\\CLIP-L.safetensors" },
    { name: "T5\\t5xxl-fp8.safetensors" },
    { name: "T5\\t5xxl-fp16.safetensors" },
  ];

  assert.deepEqual(
    filterModelCandidates(candidates, "FP8").map((item) => item.name),
    ["T5\\t5xxl-fp8.safetensors"],
  );
  assert.equal(filterModelCandidates(candidates, "").length, 3);
  assert.equal(filterModelCandidates(candidates, "not-found").length, 0);
});

test("勾选不调整后禁用候选下拉框", () => {
  assert.equal(shouldDisableCandidateSelect(true, false), false);
  assert.equal(shouldDisableCandidateSelect(true, true), true);
  assert.equal(shouldDisableCandidateSelect(false, false), true);
});

test("始终默认选择排序第一的最高分候选", () => {
  assert.equal(
    defaultCandidateName([
      { name: "highest.safetensors", score: 95, auto_select: true },
      { name: "lower.safetensors", score: 60 },
    ]),
    "highest.safetensors",
  );
  assert.equal(
    defaultCandidateName([{ name: "ambiguous.safetensors", score: 100, auto_select: false }]),
    "ambiguous.safetensors",
  );
  assert.equal(defaultCandidateName([]), "");
});

test("仅最高候选为 100% 时默认不调整", () => {
  assert.equal(shouldSkipCandidateByDefault([{ name: "exact.safetensors", score: 100 }]), true);
  assert.equal(shouldSkipCandidateByDefault([{ name: "precision.safetensors", score: 95 }]), false);
  assert.equal(shouldSkipCandidateByDefault([{ name: "params.safetensors", score: 90 }]), false);
  assert.equal(shouldSkipCandidateByDefault([]), false);
});

test("双 CLIP 加载器的两个模型控件都会被识别", () => {
  const dualCatalog = buildModelCatalog(
    [{ type: "text_encoders", name: "installed.safetensors" }],
    ["text_encoders"],
  );
  const node = {
    id: 31,
    type: "DualCLIPLoader",
    widgets: [
      {
        name: "clip_name1",
        type: "converted-widget",
        value: "missing-clip-l.safetensors",
        options: { values: () => ["installed.safetensors"] },
      },
      {
        name: "clip_name2",
        type: "converted-widget",
        value: "missing-t5.safetensors",
        options: { values: () => ["installed.safetensors"] },
      },
      { name: "type", type: "combo", value: "flux", options: { values: ["flux"] } },
    ],
  };

  const references = extractModelReferencesFromNode(node, null, dualCatalog);

  assert.equal(references.length, 2);
  assert.deepEqual(references.map((item) => item.widget_name), ["clip_name1", "clip_name2"]);
  assert.deepEqual(references.map((item) => item.model_types), [
    ["text_encoders"],
    ["text_encoders"],
  ]);
});

test("双 CLIP 加载器兼容新旧 CLIP 模型目录键", () => {
  const dualCatalog = buildModelCatalog(
    [
      { type: "text_encoders", name: "new/installed.safetensors" },
      { type: "clip", name: "legacy/installed.gguf" },
    ],
    ["text_encoders", "clip"],
  );
  const node = {
    id: 32,
    type: "DualCLIPLoaderGGUF",
    widgets: [
      {
        name: "clip_name1",
        type: "combo",
        value: "missing-clip.safetensors",
        options: { values: ["new/installed.safetensors"] },
      },
      {
        name: "clip_name2",
        type: "combo",
        value: "missing-t5.gguf",
        options: { values: ["legacy/installed.gguf"] },
      },
    ],
  };

  const references = extractModelReferencesFromNode(node, null, dualCatalog);

  assert.equal(references.length, 2);
  assert.deepEqual(references[0].model_types, ["text_encoders", "clip"]);
  assert.deepEqual(references[1].model_types, ["text_encoders", "clip"]);
});

test("双 CLIP 只缺一个模型时仍显示两个替换下拉框", () => {
  const dualCatalog = buildModelCatalog(
    [
      { type: "text_encoders", name: "Qwen\\clip-l.safetensors" },
      { type: "text_encoders", name: "Qwen\\t5-fp8.safetensors" },
    ],
    ["text_encoders"],
  );
  const node = {
    id: 33,
    type: "DualCLIPLoader",
    widgets: [
      {
        name: "clip_name1",
        type: "combo",
        value: "Qwen\\clip-l.safetensors",
        options: { values: ["Qwen\\clip-l.safetensors", "Qwen\\t5-fp8.safetensors"] },
      },
      {
        name: "clip_name2",
        type: "combo",
        value: "missing-t5.safetensors",
        options: { values: ["Qwen\\clip-l.safetensors", "Qwen\\t5-fp8.safetensors"] },
      },
    ],
  };

  const references = extractModelReferencesFromNode(node, null, dualCatalog);

  assert.deepEqual(references.map((item) => item.widget_name), ["clip_name1", "clip_name2"]);
  assert.deepEqual(references.map((item) => item.value), [
    "Qwen\\clip-l.safetensors",
    "missing-t5.safetensors",
  ]);
});

test("CLIP Vision 的 clip_name 不会误归类为文本编码器", () => {
  const visionCatalog = buildModelCatalog([], ["text_encoders", "clip_vision"]);
  const widget = {
    name: "clip_name",
    type: "combo",
    value: "missing-vision.safetensors",
    options: { values: [] },
  };

  assert.deepEqual(
    getModelTypesForWidget(widget, visionCatalog, { type: "CLIPVisionLoader" }),
    ["clip_vision"],
  );
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
