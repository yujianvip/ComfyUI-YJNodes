# ComfyUI-YJNodes

一组面向 ComfyUI 的实用节点与工作流增强工具，提供缺失模型匹配、Set/Get 物理连线转换、动态图片批次合并和工作流完成提示音。

A collection of practical nodes and workflow utilities for ComfyUI, including missing-model matching, Set/Get-to-wire conversion, dynamic image batch concatenation, and workflow completion sounds.

[中文](#中文) · [English](#english)

---

## 中文

### 功能概览

| 功能 | 说明 |
| --- | --- |
| 缺失模型匹配 | 扫描选中节点或整个工作流，为缺失模型推荐本地候选并批量替换 |
| Set/Get 转物理连线 | 将 KJNodes 的 Set Node / Get Node 逻辑连接展开为真实连线 |
| 去重复帧图像批次合并 | 动态添加最多 20 个图片输入，并在合并时移除后续批次开头的重复帧 |
| 工作流完成提示音 | 支持自定义音效、音量以及“队列完成”或“每个任务完成”两种触发方式 |

### 环境要求

- ComfyUI
- Python 3.10 或更高版本
- “打开音效文件夹”和“打开模型目录”仅支持 Windows；其余核心功能不依赖这两个快捷入口

### 安装

1. 下载或克隆本仓库到 ComfyUI 的 `custom_nodes` 目录，并确保最终目录结构如下：

   ```text
   ComfyUI/
   └─ custom_nodes/
      └─ ComfyUI-YJNodes/
         ├─ __init__.py
         ├─ yj_nodes/
         └─ web/
   ```

2. 重启 ComfyUI。
3. 在画布空白处右键，确认菜单中出现“⚡ 选择缺失模型”和“⚡ 将 Set/Get 替换为连线”。节点列表的 `YJNodes/Image` 分类中应出现“去重复帧图像批次合并”。

本插件当前没有需要单独安装的 Python 依赖。

> 不要用资源管理器复制开发目录中的 `.git`、`.venv`、`.pytest_cache`、`docs` 和 `tests`。它们不是插件运行文件，其中 `.git` 和 `.venv` 可能产生很深的路径，正是 Windows 出现“目标路径太长”的常见原因。手动部署只需复制 `__init__.py`、`yj_nodes`、`web`、`sounds` 和 `README.md`。

### 缺失模型匹配

在打开其他人分享的工作流但本地模型名称或目录不一致时，可使用该工具查找替代模型。

使用方法：

1. 可选：先选中需要检查的节点；未选中节点时会扫描整个工作流。
2. 在画布空白处右键，选择“⚡ 选择缺失模型”。
3. 在结果窗口中检查状态、原始模型名、候选模型、匹配度和匹配原因。
4. 可手动更换候选、勾选“不调整”，或用 `HF`、`C`、`G` 分别打开 Hugging Face、Civitai、Google 搜索。
5. 点击“应用更改”。只有真实存在且可写的节点控件会被修改。

匹配规则：

| 情况 | 匹配度 | 自动候选 |
| --- | ---: | --- |
| 主体名、精度和参数量一致 | 100% | 是 |
| 主体名一致，精度不同 | 95% | 是 |
| 主体名一致，参数量不同 | 90% | 是 |
| 主体名不同 | 最高 89% | 否 |

说明：

- 目录不同不会单独降分，但会显示为匹配原因。
- 候选分数达到 90% 才可能自动选择；最高分并列且无法可靠消歧时不会自动选择。
- 每个模型引用最多展示 8 个候选。
- 模型索引来自 ComfyUI 的 `models` 目录、`extra_model_paths.yaml` 以及当前 `folder_paths` 注册的模型类型。
- 外部搜索只负责打开搜索页面，不会下载或安装模型。

#### UNKNOWN 节点

未安装的自定义节点可能显示为 `UNKNOWN`。插件会尝试从工作流序列化数据的 `widgets_values` 中提取能够可靠识别为模型的文件名，并标记为“UNKNOWN 节点原始值”。

由于 UNKNOWN 节点没有真实可写控件，这些结果只用于查看候选和外部搜索，不参与“应用更改”。无法可靠判断模型类型的值会被跳过，避免把普通文件误判为模型。

### Set/Get 转物理连线

该功能用于展开 KJNodes 的 Set Node / Get Node 逻辑连接，便于移除中间节点或导出更直观的工作流。

1. 在画布空白处右键，选择“⚡ 将 Set/Get 替换为连线”。
2. 插件按变量名匹配 Set/Get，并将 Set 的上游直接连接到对应 Get 的全部下游。
3. 选择“仅连线”保留原节点；选择“连线并删除”同时删除已匹配的 Set/Get；选择“取消”不修改工作流。

安全处理：

- 没有 Set/Get、变量名不匹配或 Set 没有上游连线时，不会修改工作流。
- 存在多个已连接且同名的 Set 时，插件不会猜测来源；有歧义的变量会被跳过，其他无歧义连接仍可转换。
- 检测到子图时，为避免破坏跨子图引用，只允许建立连线，不提供删除选项。

### 去重复帧图像批次合并

节点路径：`YJNodes/Image → 去重复帧图像批次合并`

- 连接 `image2` 后会自动出现下一个图片输入，最多支持 `image1` 至 `image20`。
- 所有输入按编号顺序沿 batch 维度合并。
- “减去重复帧数”为 `N` 时，保留 `image1` 完整批次，并从每个后续输入的开头移除 `N` 帧后再合并。
- 被裁剪为空的后续输入会被忽略。
- 所有参与合并的图片必须具有相同的高度、宽度和通道数，否则节点会报出尺寸不匹配。

> 此功能按指定数量裁剪批次开头，并不会逐帧计算内容是否真的重复。

### 工作流完成提示音

1. 打开 ComfyUI 设置，进入 `YJNodes → 工作流完成提示音`。
2. 启用提示音，并选择触发方式：
   - **队列完成**：整个队列清空后播放一次。
   - **每个任务**：每完成一个工作流任务播放一次。
3. 点击“打开音效文件夹”，将音效复制到插件的 `sounds` 目录。
4. 点击“刷新音效列表”，选择音效并调整音量。
5. 点击“测试当前音效”试听。

支持扩展名：`.wav`、`.mp3`、`.ogg`、`.m4a`、`.aac`、`.flac`、`.webm`。实际能否解码取决于浏览器或 ComfyUI Desktop 的音频支持。

### 界面语言

缺失模型匹配器和 Set/Get 转换器支持中文与英文，会跟随 ComfyUI 的语言设置；无法读取语言设置时默认使用中文。动态合并节点和提示音设置目前使用中文标签。

### 当前限制

- 不会在导入工作流时自动打开模型匹配器，需要从画布右键菜单手动触发。
- UNKNOWN 节点的模型值是只读参考，不能直接替换。
- 模型匹配结果窗口的列宽调整不会持久化。
- 子图中的 Set/Get 只转换连线，不自动删除节点。

### 开发目录规范

新增功能时按“节点、功能、共享代码”分域，不再把源码平铺到同一目录：

```text
yj_nodes/
├─ nodes/                         # 有 Python 计算逻辑的 ComfyUI 节点
├─ features/                      # 不直接表现为计算节点的增强功能
│  ├─ model_matcher/              # 每项功能独立放路由、服务和领域逻辑
│  └─ execution_sound/
└─ routes.py                      # 只负责聚合注册，不放业务代码

web/js/
├─ nodes/                         # 与 Python 节点配套的前端扩展
├─ features/                      # 每项增强功能一个目录
│  └─ <feature>/
│     ├─ extension.js             # ComfyUI/DOM/API 接入
│     └─ core.js                  # 可独立测试的纯逻辑
└─ shared/                        # 至少被两个功能复用的代码
```

- 新计算节点放入 `yj_nodes/nodes/<node>.py`，配套前端放入 `web/js/nodes/<node>.js`。
- 新增强功能使用同名的前后端功能目录；不要继续扩大根级 `routes.py`。
- `core.js` 不引用 ComfyUI 或 DOM，确保能用 Node.js 直接测试；测试目录按功能命名。
- ComfyUI 会递归加载 `WEB_DIRECTORY` 下的 JavaScript，因此功能子目录无需额外入口清单。

### 开发与测试

在 Windows PowerShell 中：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q
node --test tests\js\yj_canvas_menu.test.mjs tests\js\yj_execution_sound_core.test.mjs tests\js\yj_model_matcher_core.test.mjs tests\js\yj_set_get_resolver_core.test.mjs
```

Python 测试需要隔离环境；JavaScript 测试需要本机已安装 Node.js。

---

## English

### Features

| Feature | Description |
| --- | --- |
| Missing Model Matcher | Scans selected nodes or the whole workflow, recommends local candidates, and applies replacements in bulk |
| Set/Get to Wires | Expands KJNodes Set Node / Get Node links into physical graph connections |
| Duplicate-Frame Image Batch Concat | Adds up to 20 image inputs dynamically and trims leading overlap from subsequent batches |
| Workflow Completion Sound | Plays a custom sound after each task or once after the entire queue finishes |

### Requirements

- ComfyUI
- Python 3.10 or later
- The “open sound folder” and “open model folder” shortcuts are Windows-only; the core features do not depend on these shortcuts

### Installation

1. Download or clone this repository into ComfyUI's `custom_nodes` directory. The final layout should be:

   ```text
   ComfyUI/
   └─ custom_nodes/
      └─ ComfyUI-YJNodes/
         ├─ __init__.py
         ├─ yj_nodes/
         └─ web/
   ```

2. Restart ComfyUI.
3. Right-click an empty area of the canvas. You should see “⚡ Select Missing Models” and “⚡ Replace Set/Get with Wires”. The “去重复帧图像批次合并” node should be available under `YJNodes/Image`.

No additional Python package is currently required by this plugin.

> Do not copy development-only `.git`, `.venv`, `.pytest_cache`, `docs`, or `tests` folders with Windows Explorer. Deep paths in `.git` and `.venv` commonly trigger the “destination path too long” error. A runtime deployment only needs `__init__.py`, `yj_nodes`, `web`, `sounds`, and `README.md`.

### Missing Model Matcher

Use this tool when an imported workflow refers to models whose local names or folder paths differ from yours.

1. Optionally select the nodes to scan. With no selection, the entire workflow is scanned.
2. Right-click an empty area of the canvas and choose “⚡ Select Missing Models”.
3. Review each original model name, candidate, score, reason, and status.
4. Change the candidate manually, mark the row as “Skip”, or use `HF`, `C`, and `G` to search Hugging Face, Civitai, and Google.
5. Click “Apply Changes”. Only real, writable node widgets are updated.

Scoring rules:

| Case | Score | Auto candidate |
| --- | ---: | --- |
| Same base name, precision, and parameter size | 100% | Yes |
| Same base name, different precision | 95% | Yes |
| Same base name, different parameter size | 90% | Yes |
| Different base name | Up to 89% | No |

Notes:

- A different directory is reported as a reason but does not lower the score by itself.
- A candidate needs at least 90% to be auto-selected. An unresolved tie for the top score disables auto-selection.
- Up to eight candidates are shown for each model reference.
- The model index uses ComfyUI's `models` directory, `extra_model_paths.yaml`, and model types registered in `folder_paths`.
- External search buttons open search pages only; they do not download or install models.

#### UNKNOWN nodes

Missing custom nodes may appear as `UNKNOWN`. The matcher attempts to recover model filenames that can be identified reliably from serialized `widgets_values` and labels them as “UNKNOWN original value”.

Because an UNKNOWN node has no real writable widget, these rows are read-only and are provided for candidate review and external search. Ambiguous non-model values are skipped to avoid false positives.

### Set/Get to Physical Wires

1. Right-click an empty area of the canvas and choose “⚡ Replace Set/Get with Wires”.
2. The plugin pairs Set/Get nodes by variable name and connects the Set input source directly to every downstream target of the matching Get nodes.
3. Choose “Wire Only” to keep the original nodes, “Wire & Delete” to remove matched Set/Get nodes, or “Cancel” to leave the workflow unchanged.

Safety behavior:

- The workflow is not changed when no valid pair is found, names do not match, or a Set has no upstream link.
- If multiple connected Set nodes share a name, the plugin does not guess. Ambiguous variables are skipped while unambiguous pairs can still be converted.
- When subgraphs are detected, deletion is disabled to protect cross-subgraph references.

### Duplicate-Frame Image Batch Concat

Node path: `YJNodes/Image → 去重复帧图像批次合并`

- Connecting `image2` automatically creates the next image input, up to `image20`.
- Inputs are concatenated in numeric order along the batch dimension.
- With “减去重复帧数” set to `N`, `image1` is kept intact and the first `N` frames are removed from every subsequent input before concatenation.
- A subsequent input that becomes empty after trimming is ignored.
- All included images must have the same height, width, and channel count.

> This is deterministic leading-frame trimming. It does not compare frame contents to detect duplicates.

### Workflow Completion Sound

1. Open ComfyUI Settings and go to `YJNodes → 工作流完成提示音`.
2. Enable the feature and choose a policy:
   - **队列完成**: play once when the whole queue becomes empty.
   - **每个任务**: play after every completed workflow task.
3. Click “打开音效文件夹” and copy audio files into the plugin's `sounds` directory.
4. Click “刷新音效列表”, select a sound, and adjust the volume.
5. Click “测试当前音效” to preview it.

Supported extensions: `.wav`, `.mp3`, `.ogg`, `.m4a`, `.aac`, `.flac`, and `.webm`. Actual playback depends on the codecs supported by your browser or ComfyUI Desktop.

### UI Languages

The Missing Model Matcher and Set/Get resolver support Chinese and English and follow ComfyUI's locale. Chinese is used when no locale can be detected. The dynamic concat node and completion-sound settings currently use Chinese labels.

### Known Limitations

- The model matcher must be opened manually from the canvas context menu; it does not pop up automatically when a workflow is imported.
- Model values recovered from UNKNOWN nodes are read-only.
- Resized columns in the matcher dialog are not persisted.
- Set/Get nodes inside workflows containing subgraphs are rewired but cannot be deleted by this tool.

### Source Layout

Keep new code grouped by domain: Python compute nodes belong in `yj_nodes/nodes`, non-node features in `yj_nodes/features/<feature>`, matching frontend code in `web/js/nodes` or `web/js/features/<feature>`, and genuinely reusable frontend utilities in `web/js/shared`. Root `yj_nodes/routes.py` is registration-only; UI-independent JavaScript belongs in a testable `core.js` beside its `extension.js`.

### Development and Tests

Run in Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q
node --test tests\js\yj_canvas_menu.test.mjs tests\js\yj_execution_sound_core.test.mjs tests\js\yj_model_matcher_core.test.mjs tests\js\yj_set_get_resolver_core.test.mjs
```

Use the isolated Python environment for Python tests. Node.js is required for the JavaScript test suite.

### License

The project metadata declares the project under the MIT License.
