# Unknown Node Model Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复工作流包含未安装节点时，UNKNOWN 节点导致“原始模型名”显示乱码或不可靠的问题，并让模型扫描能从 workflow 原始序列化数据中读取模型文件名。

**Architecture:** 将前端模型引用提取逻辑从 `web/js/yj_model_matcher.js` 拆到可测试的纯 JS 模块，正常节点继续优先读取 live widget，UNKNOWN 或无 widget 节点从 `app.graph.serialize().nodes[].widgets_values` 读取原始值。弹框展示时明确标注 UNKNOWN 来源，应用更改时只对可写 widget 自动写回，对 serialized-only 值只提供搜索和提示，避免误写损坏 workflow。

**Tech Stack:** ComfyUI 前端扩展 API、原生 JavaScript ES modules、Node.js `node:test`、Codex bundled Node、现有 Python pytest。

---

## 根因结论

当前实现的问题点在 `web/js/yj_model_matcher.js`：

- `scanModelReferences()` 只遍历 `node.widgets`。
- 未安装节点在 ComfyUI/LiteGraph 中通常显示为 `UNKNOWN`，它可能没有完整 widget 对象，或者 widget 只是占位。
- 原始工作流里的 widget 值仍可能保存在 `app.graph.serialize().nodes[].widgets_values`。
- 因此 UNKNOWN 节点不能只依赖 `widget.value`；要从序列化节点按 `node.id` 找回 `widgets_values`。
- 对 UNKNOWN 节点的 `widgets_values`，我们不知道真实控件名和写回语义，所以第一版只自动展示/搜索，不默认写回真实 widget。

## 文件结构

```text
ComfyUI-YJNodes/
├─ web/
│  └─ js/
│     ├─ yj_model_matcher.js
│     └─ yj_model_matcher_core.js
└─ tests/
   ├─ test_model_matcher_scoring.py
   └─ js/
      └─ yj_model_matcher_core.test.mjs
```

职责：

- `web/js/yj_model_matcher_core.js`：纯函数，负责模型值识别、节点引用提取、序列化节点 fallback、状态分类。
- `web/js/yj_model_matcher.js`：只负责 ComfyUI 依赖、DOM 弹框、请求 API、应用修改。
- `tests/js/yj_model_matcher_core.test.mjs`：用 Node 测 UNKNOWN 节点、正常 widget、中文字符串不乱码、serialized-only 行不自动写回。

---

### Task 1: 抽出可测试的前端核心扫描逻辑

**Files:**
- Create: `web/js/yj_model_matcher_core.js`
- Create: `tests/js/yj_model_matcher_core.test.mjs`
- Modify: `web/js/yj_model_matcher.js`

- [ ] **Step 1: 写失败测试**

Create `tests/js/yj_model_matcher_core.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";

import {
  extractModelReferencesFromNode,
  looksLikeModelValue,
} from "../../web/js/yj_model_matcher_core.js";

test("looksLikeModelValue accepts common model filenames", () => {
  assert.equal(looksLikeModelValue("models/checkpoints/anything-v5.safetensors"), true);
  assert.equal(looksLikeModelValue("clip\\qwen_2.5_vl_7b_fp8.gguf"), true);
  assert.equal(looksLikeModelValue("not a model prompt"), false);
});

test("normal nodes prefer live widget values", () => {
  const node = {
    id: 10,
    type: "CheckpointLoaderSimple",
    widgets: [{ name: "ckpt_name", value: "anything-v5.safetensors" }],
  };
  const serializedNode = {
    id: 10,
    type: "CheckpointLoaderSimple",
    widgets_values: ["old-value.safetensors"],
  };

  const references = extractModelReferencesFromNode(node, serializedNode);

  assert.deepEqual(references, [
    {
      node_id: 10,
      node_type: "CheckpointLoaderSimple",
      widget_index: 0,
      widget_name: "ckpt_name",
      value: "anything-v5.safetensors",
      source: "widget",
      can_apply: true,
      is_unknown_node: false,
    },
  ]);
});

test("UNKNOWN nodes read original model names from serialized widgets_values", () => {
  const node = {
    id: 22,
    type: "UNKNOWN",
    widgets: [],
  };
  const serializedNode = {
    id: 22,
    type: "MissingVideoLoader",
    widgets_values: ["wan2.1_i2v_480p_14B_fp16.safetensors", "普通提示词"],
  };

  const references = extractModelReferencesFromNode(node, serializedNode);

  assert.deepEqual(references, [
    {
      node_id: 22,
      node_type: "UNKNOWN",
      widget_index: 0,
      widget_name: "widgets_values[0]",
      value: "wan2.1_i2v_480p_14B_fp16.safetensors",
      source: "serialized_widgets_values",
      can_apply: false,
      is_unknown_node: true,
    },
  ]);
});

test("Chinese text in serialized UNKNOWN nodes is ignored and preserved by UTF-8 source", () => {
  const node = {
    id: 23,
    type: "UNKNOWN",
    widgets: [],
  };
  const serializedNode = {
    id: 23,
    type: "MissingNode",
    widgets_values: ["中文模型说明", "Qwen-Image-Edit-2509_fp8_e4m3.safetensors"],
  };

  const references = extractModelReferencesFromNode(node, serializedNode);

  assert.equal(references.length, 1);
  assert.equal(references[0].value, "Qwen-Image-Edit-2509_fp8_e4m3.safetensors");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\js\yj_model_matcher_core.test.mjs
```

Expected: FAIL with module not found for `web/js/yj_model_matcher_core.js`.

- [ ] **Step 3: 实现核心模块**

Create `web/js/yj_model_matcher_core.js`:

```javascript
export const MODEL_EXTENSIONS = [".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".onnx"];

export function looksLikeModelValue(value) {
  if (typeof value !== "string") return false;
  const lowered = value.trim().toLowerCase().replaceAll("\\", "/");
  return MODEL_EXTENSIONS.some((extension) => lowered.endsWith(extension));
}

export function buildSerializedNodeMap(serializedGraph) {
  const nodes = serializedGraph?.nodes || [];
  return new Map(nodes.map((node) => [Number(node.id), node]));
}

function isUnknownNode(node) {
  return String(node?.type || "").toUpperCase() === "UNKNOWN";
}

function widgetReference(node, widget, index) {
  return {
    node_id: node.id,
    node_type: node.type,
    widget_index: index,
    widget_name: widget.name || `widget[${index}]`,
    value: widget.value,
    source: "widget",
    can_apply: true,
    is_unknown_node: isUnknownNode(node),
  };
}

function serializedReference(node, value, index) {
  return {
    node_id: node.id,
    node_type: node.type,
    widget_index: index,
    widget_name: `widgets_values[${index}]`,
    value,
    source: "serialized_widgets_values",
    can_apply: false,
    is_unknown_node: isUnknownNode(node),
  };
}

export function extractModelReferencesFromNode(node, serializedNode) {
  const references = [];
  const liveWidgets = node?.widgets || [];

  for (let index = 0; index < liveWidgets.length; index += 1) {
    const widget = liveWidgets[index];
    if (widget && looksLikeModelValue(widget.value)) {
      references.push(widgetReference(node, widget, index));
    }
  }

  if (references.length > 0 && !isUnknownNode(node)) {
    return references;
  }

  const serializedValues = Array.isArray(serializedNode?.widgets_values) ? serializedNode.widgets_values : [];
  const seen = new Set(references.map((reference) => `${reference.widget_index}:${reference.value}`));

  for (let index = 0; index < serializedValues.length; index += 1) {
    const value = serializedValues[index];
    const key = `${index}:${value}`;
    if (!seen.has(key) && looksLikeModelValue(value)) {
      references.push(serializedReference(node, value, index));
    }
  }

  return references;
}
```

- [ ] **Step 4: 修改主前端文件使用核心模块**

Modify top of `web/js/yj_model_matcher.js`:

```javascript
import { app } from "../../scripts/app.js";
import {
  buildSerializedNodeMap,
  extractModelReferencesFromNode,
} from "./yj_model_matcher_core.js";
```

Remove local `MODEL_EXTENSIONS` and local `looksLikeModelValue`.

Replace `scanModelReferences()` with:

```javascript
function scanModelReferences() {
  const targetNodes = getTargetNodes();
  const serializedNodeMap = buildSerializedNodeMap(app.graph?.serialize?.());
  const references = [];
  for (const node of targetNodes) {
    references.push(...extractModelReferencesFromNode(node, serializedNodeMap.get(Number(node.id))));
  }
  return { references, selectedCount: selectedNodes().length };
}
```

- [ ] **Step 5: 运行 JS 测试确认通过**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\js\yj_model_matcher_core.test.mjs
```

Expected: PASS.

- [ ] **Step 6: 运行 JS 语法检查**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check web\js\yj_model_matcher.js
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check web\js\yj_model_matcher_core.js
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add web/js/yj_model_matcher.js web/js/yj_model_matcher_core.js tests/js/yj_model_matcher_core.test.mjs
git commit -m "fix: read model values from unknown nodes"
```

---

### Task 2: 弹框展示 UNKNOWN 来源并禁止误应用

**Files:**
- Modify: `web/js/yj_model_matcher.js`
- Modify: `web/js/yj_model_matcher_core.js`
- Modify: `tests/js/yj_model_matcher_core.test.mjs`

- [ ] **Step 1: 扩展核心状态测试**

Append to `tests/js/yj_model_matcher_core.test.mjs`:

```javascript
import {
  canApplyReference,
  sourceLabel,
} from "../../web/js/yj_model_matcher_core.js";

test("serialized-only UNKNOWN references are not directly applyable", () => {
  const reference = {
    source: "serialized_widgets_values",
    can_apply: false,
    is_unknown_node: true,
  };

  assert.equal(canApplyReference(reference), false);
  assert.equal(sourceLabel(reference, "zh"), "UNKNOWN 节点原始值");
  assert.equal(sourceLabel(reference, "en"), "UNKNOWN original value");
});

test("normal widget references are applyable", () => {
  const reference = {
    source: "widget",
    can_apply: true,
    is_unknown_node: false,
  };

  assert.equal(canApplyReference(reference), true);
  assert.equal(sourceLabel(reference, "zh"), "可写控件");
  assert.equal(sourceLabel(reference, "en"), "Writable widget");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\js\yj_model_matcher_core.test.mjs
```

Expected: FAIL because `canApplyReference` and `sourceLabel` are missing.

- [ ] **Step 3: 实现状态函数**

Append to `web/js/yj_model_matcher_core.js`:

```javascript
export function canApplyReference(reference) {
  return reference?.source === "widget" && reference?.can_apply === true;
}

export function sourceLabel(reference, lang) {
  const zh = String(lang || "").toLowerCase().startsWith("zh");
  if (reference?.source === "serialized_widgets_values" || reference?.is_unknown_node) {
    return zh ? "UNKNOWN 节点原始值" : "UNKNOWN original value";
  }
  return zh ? "可写控件" : "Writable widget";
}
```

- [ ] **Step 4: 主前端导入状态函数**

Modify import in `web/js/yj_model_matcher.js`:

```javascript
import {
  buildSerializedNodeMap,
  canApplyReference,
  extractModelReferencesFromNode,
  sourceLabel,
} from "./yj_model_matcher_core.js";
```

Add I18N fields:

```javascript
source: "来源",
unknownReadOnly: "UNKNOWN 节点原始值",
```

and English:

```javascript
source: "Source",
unknownReadOnly: "UNKNOWN original value",
```

Add a source column after status:

```javascript
<th style="width:150px">${lang.source}<span class="yj-mm-resizer"></span></th>
```

Add row cell after status:

```javascript
<td>${sourceLabel(result, getLang())}</td>
```

For serialized-only rows, disable select and force skip checked:

```javascript
const applyable = canApplyReference(result);
```

Use in row HTML:

```javascript
<td><select class="yj-mm-select" ${applyable ? "" : "disabled"}><option value=""></option>${options}</select></td>
<td><input class="yj-mm-skip" type="checkbox" ${applyable ? "" : "checked disabled"}></td>
```

- [ ] **Step 5: 修改应用逻辑跳过不可写来源**

In `applyModelChanges`, before reading `nextValue`, add:

```javascript
if (row.dataset.canApply !== "true") continue;
```

When creating row, add:

```javascript
row.dataset.canApply = String(applyable);
```

- [ ] **Step 6: 运行 JS 测试和语法检查**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\js\yj_model_matcher_core.test.mjs
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check web\js\yj_model_matcher.js
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check web\js\yj_model_matcher_core.js
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add web/js/yj_model_matcher.js web/js/yj_model_matcher_core.js tests/js/yj_model_matcher_core.test.mjs
git commit -m "fix: mark unknown node values read only"
```

---

### Task 3: 防止中文 UI 文案和原始值乱码回归

**Files:**
- Create: `tests/js/utf8_guard.test.mjs`
- Modify: `README.md`

- [ ] **Step 1: 写 UTF-8 防回归测试**

Create `tests/js/utf8_guard.test.mjs`:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("frontend source keeps Chinese text as UTF-8", () => {
  const source = readFileSync("web/js/yj_model_matcher.js", "utf8");

  assert.equal(source.includes("选择缺失模型"), true);
  assert.equal(source.includes("原始模型名"), true);
  assert.equal(source.includes("UNKNOWN 节点原始值"), true);
  assert.equal(source.includes("閫夋嫨"), false);
  assert.equal(source.includes("妯″瀷"), false);
});
```

- [ ] **Step 2: 运行测试确认当前状态**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\js\utf8_guard.test.mjs
```

Expected: PASS when file is valid UTF-8; FAIL if source was saved as mojibake.

- [ ] **Step 3: 如失败，重新保存前端文件为 UTF-8**

Use `apply_patch` to replace corrupted Chinese literals in `web/js/yj_model_matcher.js` with these exact strings:

```javascript
menuSelectMissingModels: "选择缺失模型",
dialogTitle: "模型查找结果",
scopeSelected: (count) => `范围：选中 ${count} 个节点`,
scopeWorkflow: "范围：整个工作流",
exact: "精确匹配",
auto: "自动候选",
manual: "需手动",
missing: "未找到",
total: "共",
status: "状态",
source: "来源",
original: "原始模型名",
replacement: "匹配 / 替换",
skip: "不调整",
score: "匹配度",
reasons: "原因",
actions: "操作",
cancel: "取消",
apply: "应用更改",
sameBaseName: "主体名一致",
differentDirectory: "目录不同",
differentPrecision: "精度不同",
differentParams: "参数量不同",
similarName: "名称相似",
unknownReadOnly: "UNKNOWN 节点原始值",
```

- [ ] **Step 4: 更新 README 说明 UNKNOWN 行为**

Add to `README.md` under `缺失模型匹配`:

```markdown
### UNKNOWN 节点

如果工作流包含未安装的节点，ComfyUI 会把它显示为 `UNKNOWN`。插件会从工作流原始 `widgets_values` 中读取可能的模型文件名，避免原始模型名显示为乱码或占位值。

UNKNOWN 节点没有真实控件信息，第一版不会直接自动写回这些行；弹框会标记为“UNKNOWN 节点原始值”，并保留外部搜索按钮，方便先安装缺失节点或手动确认模型。
```

- [ ] **Step 5: 运行完整验证**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test tests\js\yj_model_matcher_core.test.mjs tests\js\utf8_guard.test.mjs
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check web\js\yj_model_matcher.js
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check web\js\yj_model_matcher_core.js
```

Expected:

- Python pytest PASS.
- JS tests PASS.
- JS syntax checks PASS.

- [ ] **Step 6: 手动验证 ComfyUI**

Manual checklist:

```text
[ ] 导入包含未安装节点的工作流
[ ] 未安装节点显示 UNKNOWN
[ ] 右键打开“选择缺失模型”
[ ] UNKNOWN 节点里的模型文件名显示正常，不出现 mojibake
[ ] UNKNOWN 行来源显示为“UNKNOWN 节点原始值”
[ ] UNKNOWN 行替换下拉框禁用，或默认不参与应用
[ ] HF / C / G 搜索按钮能按原始模型名搜索
[ ] 正常节点仍然可以自动预选并应用替换
```

- [ ] **Step 7: Commit**

```powershell
git add README.md tests/js/utf8_guard.test.mjs web/js/yj_model_matcher.js web/js/yj_model_matcher_core.js
git commit -m "test: guard unknown node UTF-8 model display"
```

---

## 完成标准

- UNKNOWN 节点不再依赖 `node.widgets` 的占位值显示原始模型名。
- 能从 `app.graph.serialize().nodes[].widgets_values` 提取模型文件名。
- 中文 UI 文案和原始模型名按 UTF-8 显示，不出现 `閫夋嫨`、`妯″瀷` 这类 mojibake。
- UNKNOWN 来源行不会被当作普通可写 widget 自动应用，避免损坏工作流。
- 正常节点现有匹配和应用功能不回退。
- Python 测试、JS 测试、JS 语法检查通过。

