# Model Matcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `ComfyUI-YJNodes` 实现第一个功能：右键打开缺失模型匹配弹框，按本地模型相似度推荐替换，支持选中节点范围、双语 UI、外部搜索和撤销。

**Architecture:** Python 后端负责模型索引、归一化和评分，前端负责 ComfyUI 右键菜单、工作流扫描、弹框展示和写回控件。评分逻辑放后端并用单元测试保护，前端只消费 API 返回的候选、分数、原因和自动预选标记。

**Tech Stack:** ComfyUI custom node 插件结构、Python 3、pytest、ComfyUI `folder_paths`、ComfyUI 前端扩展 API、原生 JavaScript/CSS。

---

## 文件结构

```text
ComfyUI-YJNodes/
├─ __init__.py
├─ pyproject.toml
├─ README.md
├─ web/
│  └─ js/
│     └─ yj_model_matcher.js
├─ yj_nodes/
│  ├─ __init__.py
│  ├─ routes.py
│  └─ model_matcher/
│     ├─ __init__.py
│     ├─ model_index.py
│     ├─ normalize.py
│     └─ scoring.py
└─ tests/
   └─ test_model_matcher_scoring.py
```

## 环境命令

所有 Python 命令使用隔离环境：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install pytest
```

运行测试：

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

---

### Task 1: 项目骨架和 ComfyUI 入口

**Files:**
- Create: `pyproject.toml`
- Create: `README.md`
- Create: `__init__.py`
- Create: `yj_nodes/__init__.py`
- Create: `yj_nodes/routes.py`
- Create: `yj_nodes/model_matcher/__init__.py`

- [ ] **Step 1: 写基础项目文件**

Create `pyproject.toml`:

```toml
[project]
name = "comfyui-yjnodes"
version = "0.1.0"
description = "ComfyUI 插件合集：模型匹配、工作流辅助和自定义节点。"
readme = "README.md"
requires-python = ">=3.10"
license = { text = "MIT" }
authors = [{ name = "YJ" }]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

Create `README.md`:

```markdown
# ComfyUI-YJNodes

ComfyUI 插件合集。第一版功能是“缺失模型匹配”：导入别人工作流后，快速为模型加载器选择本地相似模型。

## 功能

- 右键画布空白处，选择“选择缺失模型”。
- 未选中节点时扫描整个工作流。
- 选中多个节点时只扫描选中节点。
- 使用 ComfyUI 当前可识别模型列表，包括 `models` 和 `extra_model_paths.yaml`。
- 按主体名、精度、参数量、目录差异计算匹配度。
- 支持中文和英文 UI，默认跟随 ComfyUI 语言设置。

## 安装

把本仓库放到 ComfyUI 的 `custom_nodes` 目录，然后重启 ComfyUI。

## 第一版限制

- 不会在导入工作流时自动弹窗，需要手动右键触发。
- 外部搜索只打开 Hugging Face、Civitai、Google 链接，不内嵌搜索结果。
- 列宽拖拽不持久化。
```

- [ ] **Step 2: 写 ComfyUI 插件入口**

Create root `__init__.py`:

```python
from pathlib import Path

WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

try:
    from .yj_nodes.routes import register_routes

    register_routes()
except Exception as exc:
    print(f"[ComfyUI-YJNodes] Failed to register routes: {exc}")

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
```

Create `yj_nodes/__init__.py`:

```python
__all__ = []
```

Create `yj_nodes/model_matcher/__init__.py`:

```python
from .scoring import MatchCandidate, score_candidates

__all__ = ["MatchCandidate", "score_candidates"]
```

Create `yj_nodes/routes.py`:

```python
from __future__ import annotations

from aiohttp import web

from .model_matcher.model_index import list_available_models
from .model_matcher.scoring import score_candidates


def register_routes() -> None:
    try:
        from server import PromptServer
    except Exception as exc:
        print(f"[ComfyUI-YJNodes] PromptServer unavailable: {exc}")
        return

    routes = PromptServer.instance.routes

    @routes.get("/yj_nodes/model_matcher/models")
    async def get_models(request):
        return web.json_response({"models": list_available_models()})

    @routes.post("/yj_nodes/model_matcher/match")
    async def match_models(request):
        payload = await request.json()
        references = payload.get("references", [])
        models = list_available_models()
        results = []
        for reference in references:
            original = str(reference.get("value", ""))
            candidates = score_candidates(original, models)
            results.append({**reference, "candidates": [item.to_dict() for item in candidates]})
        return web.json_response({"results": results})
```

- [ ] **Step 3: 创建并安装测试环境**

Run:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install pytest
```

Expected: pip installs complete without using system site packages.

- [ ] **Step 4: 运行测试确认当前没有测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: `no tests ran`.

- [ ] **Step 5: Commit**

```powershell
git add pyproject.toml README.md __init__.py yj_nodes
git commit -m "chore: scaffold ComfyUI YJNodes plugin"
```

---

### Task 2: 模型名归一化

**Files:**
- Create: `yj_nodes/model_matcher/normalize.py`
- Create: `tests/test_model_matcher_scoring.py`

- [ ] **Step 1: 写失败测试**

Create `tests/test_model_matcher_scoring.py`:

```python
from yj_nodes.model_matcher.normalize import normalize_model_name


def test_normalize_removes_directory_extension_precision_and_params():
    result = normalize_model_name("diffusion_models/Qwen-Image-Edit-2509_fp8_e4m3_7B.safetensors")

    assert result.base == "qwen image edit 2509"
    assert result.precisions == {"fp8", "e4m3"}
    assert result.params == {"7b"}
    assert result.extension == ".safetensors"


def test_normalize_keeps_plain_model_subject():
    result = normalize_model_name("anything-v5.safetensors")

    assert result.base == "anything v5"
    assert result.precisions == set()
    assert result.params == set()
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_model_matcher_scoring.py -q
```

Expected: FAIL with `ModuleNotFoundError` or missing `normalize_model_name`.

- [ ] **Step 3: 实现归一化**

Create `yj_nodes/model_matcher/normalize.py`:

```python
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath, PureWindowsPath


PRECISION_RE = re.compile(r"(?i)\b(fp8|fp16|fp32|bf16|e4m3|e5m2)\b")
PARAM_RE = re.compile(r"(?i)\b(\d+(?:\.\d+)?b)\b")
SEPARATOR_RE = re.compile(r"[-_.\s]+")


@dataclass(frozen=True)
class NormalizedModelName:
    original: str
    filename: str
    stem: str
    base: str
    precisions: set[str]
    params: set[str]
    extension: str


def _filename(value: str) -> str:
    normalized = value.replace("\\", "/")
    return PurePosixPath(normalized).name or PureWindowsPath(value).name


def normalize_model_name(value: str) -> NormalizedModelName:
    filename = _filename(value.strip())
    path = PurePosixPath(filename)
    extension = path.suffix.lower()
    stem = filename[: -len(extension)] if extension else filename

    token_text = SEPARATOR_RE.sub(" ", stem).strip().lower()
    precisions = {match.group(1).lower() for match in PRECISION_RE.finditer(token_text)}
    params = {match.group(1).lower() for match in PARAM_RE.finditer(token_text)}

    base = PRECISION_RE.sub(" ", token_text)
    base = PARAM_RE.sub(" ", base)
    base = SEPARATOR_RE.sub(" ", base).strip()

    return NormalizedModelName(
        original=value,
        filename=filename,
        stem=stem,
        base=base,
        precisions=precisions,
        params=params,
        extension=extension,
    )
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_model_matcher_scoring.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add yj_nodes/model_matcher/normalize.py tests/test_model_matcher_scoring.py
git commit -m "test: cover model name normalization"
```

---

### Task 3: 匹配评分规则

**Files:**
- Create: `yj_nodes/model_matcher/scoring.py`
- Modify: `tests/test_model_matcher_scoring.py`

- [ ] **Step 1: 追加失败测试**

Append to `tests/test_model_matcher_scoring.py`:

```python
from yj_nodes.model_matcher.scoring import score_candidates


def test_same_base_name_is_exact_match_even_when_directory_differs():
    models = [{"type": "vae", "name": "vae/qwen_image_vae.safetensors", "display_name": "vae/qwen_image_vae.safetensors"}]

    [candidate] = score_candidates("other_dir/qwen_image_vae.safetensors", models)

    assert candidate.score == 100
    assert candidate.auto_select is True
    assert "same_base_name" in candidate.reasons
    assert "different_directory" in candidate.reasons


def test_precision_difference_scores_95_and_auto_selects():
    models = [{"type": "unet", "name": "Qwen-Image-Edit-fp16.safetensors", "display_name": "Qwen-Image-Edit-fp16.safetensors"}]

    [candidate] = score_candidates("Qwen-Image-Edit-fp8.safetensors", models)

    assert candidate.score == 95
    assert candidate.auto_select is True
    assert "different_precision" in candidate.reasons


def test_parameter_difference_scores_90_and_auto_selects():
    models = [{"type": "clip", "name": "qwen_2.5_vl_14b.safetensors", "display_name": "qwen_2.5_vl_14b.safetensors"}]

    [candidate] = score_candidates("qwen_2.5_vl_7b.safetensors", models)

    assert candidate.score == 90
    assert candidate.auto_select is True
    assert "different_params" in candidate.reasons


def test_similar_name_below_90_is_not_auto_selected():
    models = [{"type": "checkpoint", "name": "anything-v5.safetensors", "display_name": "anything-v5.safetensors"}]

    [candidate] = score_candidates("qwen_image_vae.safetensors", models)

    assert candidate.score < 90
    assert candidate.auto_select is False
    assert "similar_name" in candidate.reasons


def test_candidates_are_sorted_by_score_descending():
    models = [
        {"type": "checkpoint", "name": "anything-v5.safetensors", "display_name": "anything-v5.safetensors"},
        {"type": "vae", "name": "qwen_image_vae.safetensors", "display_name": "qwen_image_vae.safetensors"},
    ]

    candidates = score_candidates("qwen_image_vae.safetensors", models)

    assert candidates[0].name == "qwen_image_vae.safetensors"
    assert candidates[0].score == 100
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_model_matcher_scoring.py -q
```

Expected: FAIL because `scoring.py` is missing.

- [ ] **Step 3: 实现评分**

Create `yj_nodes/model_matcher/scoring.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import PurePosixPath
from typing import Any

from .normalize import normalize_model_name


@dataclass(frozen=True)
class MatchCandidate:
    type: str
    name: str
    display_name: str
    score: int
    reasons: list[str]
    auto_select: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "display_name": self.display_name,
            "score": self.score,
            "reasons": self.reasons,
            "auto_select": self.auto_select,
        }


def _directory(value: str) -> str:
    normalized = value.replace("\\", "/")
    parent = str(PurePosixPath(normalized).parent)
    return "" if parent == "." else parent


def _similarity(left: str, right: str) -> int:
    if not left or not right:
        return 0
    return int(round(SequenceMatcher(None, left, right).ratio() * 89))


def _score_one(original: str, model: dict[str, Any]) -> MatchCandidate:
    model_name = str(model.get("name", ""))
    original_norm = normalize_model_name(original)
    model_norm = normalize_model_name(model_name)
    reasons: list[str] = []

    if original_norm.base == model_norm.base and original_norm.base:
        reasons.append("same_base_name")
        score = 100

        if _directory(original) != _directory(model_name):
            reasons.append("different_directory")

        if original_norm.precisions != model_norm.precisions:
            reasons.append("different_precision")
            score = min(score, 95)

        if original_norm.params != model_norm.params:
            reasons.append("different_params")
            score = min(score, 90)
    else:
        score = _similarity(original_norm.base, model_norm.base)
        reasons.append("similar_name")

    return MatchCandidate(
        type=str(model.get("type", "")),
        name=model_name,
        display_name=str(model.get("display_name", model_name)),
        score=score,
        reasons=reasons,
        auto_select=score >= 90,
    )


def score_candidates(original: str, models: list[dict[str, Any]], limit: int = 8) -> list[MatchCandidate]:
    candidates = [_score_one(original, model) for model in models]
    candidates.sort(key=lambda item: (item.score, item.name), reverse=True)
    return candidates[:limit]
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_model_matcher_scoring.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add yj_nodes/model_matcher/scoring.py tests/test_model_matcher_scoring.py
git commit -m "feat: score model match candidates"
```

---

### Task 4: 后端模型索引

**Files:**
- Create: `yj_nodes/model_matcher/model_index.py`
- Modify: `tests/test_model_matcher_scoring.py`

- [ ] **Step 1: 写模型索引测试**

Append to `tests/test_model_matcher_scoring.py`:

```python
from yj_nodes.model_matcher.model_index import build_model_entries


def test_build_model_entries_keeps_type_name_and_display_name():
    entries = build_model_entries("checkpoints", ["realistic/anything-v5.safetensors"])

    assert entries == [
        {
            "type": "checkpoints",
            "name": "realistic/anything-v5.safetensors",
            "display_name": "checkpoints/realistic/anything-v5.safetensors",
            "extension": ".safetensors",
        }
    ]
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_model_matcher_scoring.py::test_build_model_entries_keeps_type_name_and_display_name -q
```

Expected: FAIL because `model_index.py` is missing.

- [ ] **Step 3: 实现模型索引**

Create `yj_nodes/model_matcher/model_index.py`:

```python
from __future__ import annotations

from pathlib import PurePosixPath


MODEL_TYPES = [
    "checkpoints",
    "unet",
    "diffusion_models",
    "clip",
    "clip_vision",
    "vae",
    "loras",
    "controlnet",
    "upscale_models",
    "gligen",
    "style_models",
    "embeddings",
    "hypernetworks",
    "photomaker",
    "vae_approx",
]


def build_model_entries(model_type: str, names: list[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for name in names:
        normalized = str(name).replace("\\", "/")
        extension = PurePosixPath(normalized).suffix.lower()
        entries.append(
            {
                "type": model_type,
                "name": normalized,
                "display_name": f"{model_type}/{normalized}",
                "extension": extension,
            }
        )
    return entries


def list_available_models() -> list[dict[str, str]]:
    try:
        import folder_paths
    except Exception as exc:
        print(f"[ComfyUI-YJNodes] folder_paths unavailable: {exc}")
        return []

    models: list[dict[str, str]] = []
    for model_type in MODEL_TYPES:
        try:
            names = folder_paths.get_filename_list(model_type)
        except Exception:
            names = []
        models.extend(build_model_entries(model_type, names))
    return models
```

- [ ] **Step 4: 运行全部 Python 测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add yj_nodes/model_matcher/model_index.py tests/test_model_matcher_scoring.py
git commit -m "feat: index ComfyUI model folders"
```

---

### Task 5: 前端右键入口、扫描和双语

**Files:**
- Create: `web/js/yj_model_matcher.js`

- [ ] **Step 1: 创建前端扩展文件**

Create `web/js/yj_model_matcher.js`:

```javascript
import { app } from "../../scripts/app.js";

const MODEL_EXTENSIONS = [".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".onnx"];

const I18N = {
  zh: {
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
  },
  en: {
    menuSelectMissingModels: "Select Missing Models",
    dialogTitle: "Model Match Results",
    scopeSelected: (count) => `Scope: ${count} selected nodes`,
    scopeWorkflow: "Scope: Whole workflow",
    exact: "Exact",
    auto: "Auto",
    manual: "Manual",
    missing: "Missing",
    total: "Total",
    status: "Status",
    original: "Original Model",
    replacement: "Match / Replace",
    skip: "Skip",
    score: "Score",
    reasons: "Reasons",
    actions: "Actions",
    cancel: "Cancel",
    apply: "Apply Changes",
    sameBaseName: "Same base name",
    differentDirectory: "Different directory",
    differentPrecision: "Different precision",
    differentParams: "Different parameter size",
    similarName: "Similar name",
  },
};

function getLang() {
  const setting = app?.ui?.settings?.getSettingValue?.("Comfy.Locale") || app?.ui?.settings?.getSettingValue?.("locale");
  return String(setting || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t() {
  return I18N[getLang()] || I18N.zh;
}

function looksLikeModelValue(value) {
  if (typeof value !== "string") return false;
  const lowered = value.toLowerCase();
  return MODEL_EXTENSIONS.some((extension) => lowered.endsWith(extension) || lowered.includes(`${extension}/`));
}

function getTargetNodes() {
  const selected = Object.values(app.canvas.selected_nodes || {});
  return selected.length > 0 ? selected : app.graph._nodes || [];
}

function scanModelReferences() {
  const targetNodes = getTargetNodes();
  const references = [];
  for (const node of targetNodes) {
    for (let index = 0; index < (node.widgets || []).length; index += 1) {
      const widget = node.widgets[index];
      if (!widget || !looksLikeModelValue(widget.value)) continue;
      references.push({
        node_id: node.id,
        node_type: node.type,
        widget_index: index,
        widget_name: widget.name || "",
        value: widget.value,
      });
    }
  }
  return { references, selectedCount: Object.values(app.canvas.selected_nodes || {}).length };
}

async function requestMatches(references) {
  const response = await fetch("/yj_nodes/model_matcher/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ references }),
  });
  if (!response.ok) throw new Error(`Model matcher request failed: ${response.status}`);
  return response.json();
}

function openModelMatcher() {
  const { references, selectedCount } = scanModelReferences();
  requestMatches(references).then((payload) => {
    showMatcherDialog(payload.results || [], selectedCount);
  }).catch((error) => {
    console.error("[ComfyUI-YJNodes] model matcher failed", error);
  });
}

function showMatcherDialog(results, selectedCount) {
  window.yjModelMatcherLastResults = { results, selectedCount };
  // Dialog UI is implemented in Task 6.
}

app.registerExtension({
  name: "ComfyUI-YJNodes.ModelMatcher",
  setup() {
    const original = LGraphCanvas.prototype.getCanvasMenuOptions;
    LGraphCanvas.prototype.getCanvasMenuOptions = function (...args) {
      const options = original ? original.apply(this, args) : [];
      options.push(null, {
        content: t().menuSelectMissingModels,
        callback: () => openModelMatcher(),
      });
      return options;
    };
  },
});
```

- [ ] **Step 2: 手动检查前端文件语法**

Run:

```powershell
Get-Content .\web\js\yj_model_matcher.js
```

Expected: file exists and imports `app`.

- [ ] **Step 3: 在 ComfyUI 手动验证菜单**

Run ComfyUI normally, open browser, right-click canvas blank area.

Expected: menu includes Chinese `选择缺失模型` when ComfyUI locale is Chinese, or English `Select Missing Models` for non-Chinese locale.

- [ ] **Step 4: Commit**

```powershell
git add web/js/yj_model_matcher.js
git commit -m "feat: add model matcher frontend entry"
```

---

### Task 6: 匹配弹框、拖动和列宽

**Files:**
- Modify: `web/js/yj_model_matcher.js`

- [ ] **Step 1: 添加弹框 CSS 和 DOM**

Replace `showMatcherDialog` in `web/js/yj_model_matcher.js` with:

```javascript
function reasonText(reason) {
  const labels = {
    same_base_name: t().sameBaseName,
    different_directory: t().differentDirectory,
    different_precision: t().differentPrecision,
    different_params: t().differentParams,
    similar_name: t().similarName,
  };
  return labels[reason] || reason;
}

function statusForResult(result) {
  const best = (result.candidates || [])[0];
  if (!best) return { key: "missing", label: t().missing };
  if (best.score === 100 && best.auto_select) return { key: "exact", label: t().exact };
  if (best.score >= 90 && best.auto_select) return { key: "auto", label: t().auto };
  return { key: "manual", label: t().manual };
}

function ensureStyles() {
  if (document.getElementById("yj-model-matcher-style")) return;
  const style = document.createElement("style");
  style.id = "yj-model-matcher-style";
  style.textContent = `
    .yj-mm-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.25)}
    .yj-mm-dialog{position:fixed;left:5vw;top:5vh;width:90vw;max-height:86vh;background:#111124;color:#f2f1fb;border:1px solid #303047;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.45);overflow:hidden;font-family:Microsoft YaHei,system-ui,sans-serif}
    .yj-mm-title{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #303047;cursor:move}
    .yj-mm-title strong{font-size:22px}
    .yj-mm-close{border:0;background:transparent;color:#aaa;font-size:26px;cursor:pointer}
    .yj-mm-body{padding:18px 22px;overflow:auto;max-height:calc(86vh - 132px)}
    .yj-mm-stats{display:flex;gap:10px;align-items:center;margin-bottom:14px;color:#aaa}
    .yj-mm-pill{border:1px solid #34344e;border-radius:999px;padding:7px 12px;background:#1d1d33}
    .yj-mm-table{width:100%;border-collapse:separate;border-spacing:0 8px;table-layout:fixed}
    .yj-mm-table th{color:#aaa;font-weight:700;text-align:left;padding:8px;position:relative}
    .yj-mm-table td{background:#231b27;padding:10px 8px;vertical-align:middle}
    .yj-mm-table tr td:first-child{border-left:3px solid #ff9800;border-radius:6px 0 0 6px}
    .yj-mm-table tr td:last-child{border-radius:0 6px 6px 0}
    .yj-mm-resizer{position:absolute;right:0;top:8px;width:5px;height:24px;cursor:col-resize;background:#393951}
    .yj-mm-select{width:100%;background:#0e0e24;color:#fff;border:1px solid #a76500;border-radius:6px;padding:8px}
    .yj-mm-score{color:#ff9800;font-weight:800}
    .yj-mm-footer{display:flex;justify-content:flex-end;gap:12px;padding:14px 22px;border-top:1px solid #303047}
    .yj-mm-button{border:0;border-radius:8px;padding:10px 18px;color:#fff;font-weight:700;cursor:pointer}
    .yj-mm-cancel{background:#24243a}
    .yj-mm-apply{background:#3f82f6}
    .yj-mm-action{border:0;border-radius:6px;padding:7px 9px;color:#fff;font-weight:700;cursor:pointer;margin-right:5px}
    .yj-mm-hf{background:#40ad50}.yj-mm-c{background:#ff9800}.yj-mm-g{background:#ff463d}
  `;
  document.head.appendChild(style);
}

function showMatcherDialog(results, selectedCount) {
  ensureStyles();
  document.querySelector(".yj-mm-backdrop")?.remove();

  const lang = t();
  const backdrop = document.createElement("div");
  backdrop.className = "yj-mm-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "yj-mm-dialog";

  const stats = results.reduce((acc, result) => {
    const status = statusForResult(result).key;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  dialog.innerHTML = `
    <div class="yj-mm-title">
      <div><strong>${lang.dialogTitle}</strong><div>${selectedCount > 0 ? lang.scopeSelected(selectedCount) : lang.scopeWorkflow}</div></div>
      <button class="yj-mm-close">×</button>
    </div>
    <div class="yj-mm-body">
      <div class="yj-mm-stats">
        <span class="yj-mm-pill">${stats.exact || 0} ${lang.exact}</span>
        <span class="yj-mm-pill">${stats.auto || 0} ${lang.auto}</span>
        <span class="yj-mm-pill">${stats.manual || 0} ${lang.manual}</span>
        <span class="yj-mm-pill">${stats.missing || 0} ${lang.missing}</span>
        <span>${lang.total} ${results.length}</span>
      </div>
      <table class="yj-mm-table">
        <thead><tr>
          <th style="width:120px">${lang.status}<span class="yj-mm-resizer"></span></th>
          <th style="width:260px">${lang.original}<span class="yj-mm-resizer"></span></th>
          <th style="width:360px">${lang.replacement}<span class="yj-mm-resizer"></span></th>
          <th style="width:90px">${lang.skip}<span class="yj-mm-resizer"></span></th>
          <th style="width:90px">${lang.score}<span class="yj-mm-resizer"></span></th>
          <th style="width:220px">${lang.reasons}<span class="yj-mm-resizer"></span></th>
          <th style="width:170px">${lang.actions}</th>
        </tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="yj-mm-footer">
      <button class="yj-mm-button yj-mm-cancel">${lang.cancel}</button>
      <button class="yj-mm-button yj-mm-apply">${lang.apply}</button>
    </div>
  `;

  const tbody = dialog.querySelector("tbody");
  for (const result of results) {
    const status = statusForResult(result);
    const candidates = result.candidates || [];
    const best = candidates[0];
    const options = candidates.map((candidate) => `<option value="${candidate.name}" ${candidate.auto_select && candidate === best ? "selected" : ""}>${candidate.display_name}</option>`).join("");
    const row = document.createElement("tr");
    row.dataset.nodeId = result.node_id;
    row.dataset.widgetIndex = result.widget_index;
    row.innerHTML = `
      <td>${status.label}</td>
      <td title="${result.value}">${result.value}</td>
      <td><select class="yj-mm-select"><option value=""></option>${options}</select></td>
      <td><input class="yj-mm-skip" type="checkbox"></td>
      <td class="yj-mm-score">${best ? `${best.score}%` : ""}</td>
      <td>${best ? best.reasons.map(reasonText).join(" / ") : ""}</td>
      <td>
        <button class="yj-mm-action yj-mm-hf">HF</button>
        <button class="yj-mm-action yj-mm-c">C</button>
        <button class="yj-mm-action yj-mm-g">G</button>
      </td>
    `;
    tbody.appendChild(row);
  }

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  wireDialogBehavior(backdrop, dialog, results);
}
```

- [ ] **Step 2: 添加拖动和列宽函数**

Append below `showMatcherDialog`:

```javascript
function wireDialogBehavior(backdrop, dialog, results) {
  dialog.querySelector(".yj-mm-close").onclick = () => backdrop.remove();
  dialog.querySelector(".yj-mm-cancel").onclick = () => backdrop.remove();

  const title = dialog.querySelector(".yj-mm-title");
  title.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = dialog.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    function move(moveEvent) {
      dialog.style.left = `${moveEvent.clientX - offsetX}px`;
      dialog.style.top = `${moveEvent.clientY - offsetY}px`;
    }
    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });

  for (const resizer of dialog.querySelectorAll(".yj-mm-resizer")) {
    resizer.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const th = event.target.closest("th");
      const startX = event.clientX;
      const startWidth = th.offsetWidth;
      function move(moveEvent) {
        th.style.width = `${Math.max(70, startWidth + moveEvent.clientX - startX)}px`;
      }
      function stop() {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    });
  }

  dialog.querySelector(".yj-mm-apply").onclick = () => applyModelChanges(dialog, backdrop);
  wireSearchButtons(dialog, results);
}
```

- [ ] **Step 3: 手动验证弹框**

In ComfyUI:

1. Open workflow with at least one model widget.
2. Right-click canvas blank area.
3. Click `选择缺失模型`.

Expected:

- Dialog opens.
- Dialog can be dragged.
- Header column widths can be dragged.
- Stats count rows correctly.

- [ ] **Step 4: Commit**

```powershell
git add web/js/yj_model_matcher.js
git commit -m "feat: render model matcher dialog"
```

---

### Task 7: 应用更改、撤销和外部搜索

**Files:**
- Modify: `web/js/yj_model_matcher.js`

- [ ] **Step 1: 添加应用修改和撤销函数**

Append to `web/js/yj_model_matcher.js`:

```javascript
function findNodeById(id) {
  return app.graph.getNodeById ? app.graph.getNodeById(Number(id)) : (app.graph._nodes || []).find((node) => Number(node.id) === Number(id));
}

function applyWidgetValue(node, widgetIndex, value) {
  const widget = node?.widgets?.[Number(widgetIndex)];
  if (!widget) return false;
  widget.value = value;
  widget.callback?.(value, app.canvas, node, app.canvas.graph_mouse);
  node.setDirtyCanvas?.(true, true);
  return true;
}

function saveHistoryCheckpoint() {
  if (app.graph?.beforeChange) app.graph.beforeChange();
  if (app.canvas?.dirty_canvas !== undefined) app.canvas.setDirty?.(true, true);
}

function finishHistoryCheckpoint() {
  if (app.graph?.afterChange) app.graph.afterChange();
  app.graph?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

function applyModelChanges(dialog, backdrop) {
  const changes = [];
  for (const row of dialog.querySelectorAll("tbody tr")) {
    if (row.querySelector(".yj-mm-skip")?.checked) continue;
    const nextValue = row.querySelector(".yj-mm-select")?.value;
    if (!nextValue) continue;
    const node = findNodeById(row.dataset.nodeId);
    const widget = node?.widgets?.[Number(row.dataset.widgetIndex)];
    if (!widget || widget.value === nextValue) continue;
    changes.push({ node, widgetIndex: Number(row.dataset.widgetIndex), oldValue: widget.value, newValue: nextValue });
  }

  saveHistoryCheckpoint();
  const applied = [];
  try {
    for (const change of changes) {
      if (applyWidgetValue(change.node, change.widgetIndex, change.newValue)) {
        applied.push(change);
      }
    }
    finishHistoryCheckpoint();
    backdrop.remove();
  } catch (error) {
    console.error("[ComfyUI-YJNodes] apply failed, rolling back", error);
    for (const change of applied.reverse()) {
      applyWidgetValue(change.node, change.widgetIndex, change.oldValue);
    }
    finishHistoryCheckpoint();
  }
}
```

- [ ] **Step 2: 添加外部搜索函数**

Append to `web/js/yj_model_matcher.js`:

```javascript
function searchUrl(kind, query) {
  const encoded = encodeURIComponent(query);
  if (kind === "hf") return `https://huggingface.co/search/full-text?q=${encoded}`;
  if (kind === "c") return `https://civitai.com/search/models?sortBy=models_v9&query=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

function wireSearchButtons(dialog, results) {
  const rows = [...dialog.querySelectorAll("tbody tr")];
  rows.forEach((row, index) => {
    const query = results[index]?.value || "";
    row.querySelector(".yj-mm-hf").onclick = () => window.open(searchUrl("hf", query), "_blank", "noopener,noreferrer");
    row.querySelector(".yj-mm-c").onclick = () => window.open(searchUrl("c", query), "_blank", "noopener,noreferrer");
    row.querySelector(".yj-mm-g").onclick = () => window.open(searchUrl("g", query), "_blank", "noopener,noreferrer");
  });
}
```

- [ ] **Step 3: 手动验证应用和撤销**

In ComfyUI:

1. Open a workflow with multiple model widgets.
2. Run `选择缺失模型`.
3. Change one candidate manually.
4. Check `不调整` on another row.
5. Click `应用更改`.
6. Press `Ctrl+Z`.

Expected:

- Unchecked rows with selected candidates change.
- Checked rows do not change.
- `Ctrl+Z` reverts the batch if ComfyUI current history API supports it.
- If an exception occurs, already applied widget values roll back.

- [ ] **Step 4: 手动验证搜索按钮**

Click `HF`、`C`、`G`.

Expected:

- `HF` opens Hugging Face full-text search.
- `C` opens Civitai model search.
- `G` opens Google search.

- [ ] **Step 5: Commit**

```powershell
git add web/js/yj_model_matcher.js
git commit -m "feat: apply model matcher changes"
```

---

### Task 8: 最终验证和开源整理

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 完善 `.gitignore`**

Ensure `.gitignore` contains:

```gitignore
.superpowers/
.venv/
__pycache__/
*.pyc
.pytest_cache/
node_modules/
```

- [ ] **Step 2: 更新 README 使用说明**

Replace `README.md` with:

```markdown
# ComfyUI-YJNodes

ComfyUI 插件合集。当前第一版功能是“缺失模型匹配”，用于导入别人工作流后快速替换本地模型。

## 安装

把本仓库放到 ComfyUI 的 `custom_nodes` 目录：

```text
ComfyUI/custom_nodes/ComfyUI-YJNodes
```

重启 ComfyUI。

## 缺失模型匹配

使用方法：

1. 在 ComfyUI 画布空白处右键。
2. 点击“选择缺失模型”。
3. 如果当前选中了节点，只扫描选中节点。
4. 如果没有选中节点，扫描整个工作流。
5. 在弹框里确认候选模型。
6. 点击“应用更改”。

匹配规则：

- 主体名一致：100%。
- 主体名一致但目录不同：100%。
- 主体名一致但精度不同：95%。
- 主体名一致但参数量不同：90%。
- 低于 90% 的候选只展示，不自动替换。

支持模型来源：

- ComfyUI `models` 目录。
- `extra_model_paths.yaml` 配置的外部模型目录。
- ComfyUI 当前 `folder_paths` 能识别的模型类型。

外部搜索：

- `HF`：Hugging Face。
- `C`：Civitai。
- `G`：Google。

## 语言

插件 UI 支持中文和英文，默认跟随 ComfyUI 当前语言设置；读取不到语言时默认中文。

## 开发测试

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q
```
```

- [ ] **Step 3: 运行 Python 测试**

Run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected: all tests PASS.

- [ ] **Step 4: 手动验证 ComfyUI**

Manual checklist:

```text
[ ] 右键空白处能看到“选择缺失模型”
[ ] 中文 ComfyUI 显示中文 UI
[ ] 非中文 ComfyUI 显示英文 UI
[ ] 未选中节点时扫描整个工作流
[ ] 选中多个节点时只扫描选中节点
[ ] 100% / 95% / 90% 候选会自动预选
[ ] 低于 90% 候选不自动预选
[ ] 不调整能跳过修改
[ ] 应用更改能写回控件
[ ] Ctrl+Z 能撤销，或失败时能回滚
[ ] HF / C / G 搜索链接正确
```

- [ ] **Step 5: 查看 Git 状态**

Run:

```powershell
git status --short
```

Expected: only intended files are modified.

- [ ] **Step 6: Commit**

```powershell
git add README.md .gitignore
git commit -m "docs: document model matcher workflow"
```

---

## 风险和处理

- ComfyUI 前端 history API 可能随版本变化。实现时先检查当前版本可用方法，再保留失败回滚。
- 第三方节点 widget 结构可能不标准。第一版只处理有 `widgets` 且 `widget.value` 是字符串的控件。
- `folder_paths` 模型类型不一定覆盖所有插件自定义目录。第一版先覆盖 ComfyUI 常见类型，后续可增加 API 返回未知目录或插件注册类型。
- 低于 `90%` 的候选不自动预选，避免误替换。

## 完成标准

- `pytest -q` 通过。
- ComfyUI 前端能加载插件 JS。
- 右键菜单可打开弹框。
- 选中节点和全工作流范围正确。
- 匹配分数符合设计文档。
- 应用更改可写回控件。
- 失败时能回滚已修改控件。
- README 说明安装、使用、匹配规则和限制。

