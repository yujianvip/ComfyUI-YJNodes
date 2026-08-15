# 缺失模型匹配功能设计

## 目标

为 `ComfyUI-YJNodes` 插件合集实现第一个功能：在导入别人工作流后，快速发现并替换当前工作流里引用的模型文件，解决模型名称不同、精度不同、参数量不同、子目录不同导致的加载器需要手动重选问题。

第一版目标是可靠的 MVP：右键空白处打开 `选择缺失模型` 弹框，默认处理整个工作流；如果当前选中了多个节点，则只处理选中节点。插件会基于本地 ComfyUI 可识别模型列表给出候选、分数和原因，自动预选可信候选，低可信候选只展示不自动替换，并支持撤销。

## 范围

第一版包含：

- ComfyUI 插件骨架，后续可继续添加更多节点和功能。
- 后端模型索引 API，使用 ComfyUI 的 `folder_paths` 体系获取当前可用模型。
- 前端右键菜单入口：`选择缺失模型`。
- 前端扫描目标节点范围内所有值像模型文件名的下拉框或组合框控件。
- 匹配弹框：可移动、表格列宽可拖拽、可一键应用更改。
- 外部搜索按钮：Hugging Face、Civitai、Google。
- 中文和英文 UI 文案，默认语言跟随 ComfyUI 设置。
- Python 单元测试覆盖核心匹配规则。
- 手动测试覆盖 ComfyUI 前端交互、应用更改和撤销。

第一版不包含：

- 导入工作流时自动弹窗。
- 在弹框内嵌入 Hugging Face 或 Civitai API 搜索结果。
- 列宽持久化。
- 对每个第三方节点逐个写硬编码适配规则。

## 架构

插件分成 4 层：

1. **ComfyUI 插件骨架**
   - Python 后端注册 API。
   - Web 前端扩展注册右键菜单。
   - 项目结构为后续插件合集预留，避免所有功能堆在一个文件里。

2. **后端模型索引**
   - 使用 ComfyUI 的 `folder_paths` 获取当前可用模型。
   - 覆盖 `ComfyUI/models` 和 `extra_model_paths.yaml` 配置的外部模型目录。
   - 返回统一模型清单：模型类型、文件名、相对路径、显示名、扩展名。

3. **前端工作流扫描**
   - 右键空白处添加 `选择缺失模型`。
   - 如果当前有选中节点，只扫描选中节点。
   - 如果没有选中节点，扫描整个工作流。
   - 扫描所有值像模型文件名的下拉框或组合框控件。
   - 提取原始模型名、节点类型、控件名、当前值。

4. **匹配弹框与应用**
   - 弹框可移动。
   - 表格列宽可拖拽。
   - 默认列：状态、原始模型名、匹配/替换、不调整、匹配度、原因、操作。
   - `HF / C / G` 打开外部搜索链接。
   - 点击 `应用更改` 时批量写回控件值，并支持撤销。

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

职责：

- `__init__.py`：ComfyUI 插件入口，注册 web 目录和后端 API。
- `yj_nodes/routes.py`：集中注册 API。
- `yj_nodes/model_matcher/model_index.py`：从 `folder_paths` 获取所有可用模型。
- `yj_nodes/model_matcher/normalize.py`：模型名清洗，识别主体名、精度、参数量、扩展名。
- `yj_nodes/model_matcher/scoring.py`：计算相似度和标签原因。
- `web/js/yj_model_matcher.js`：右键菜单、扫描工作流、弹框 UI、应用修改、撤销。
- `tests/test_model_matcher_scoring.py`：测试核心匹配规则。

## 数据流

```mermaid
flowchart LR
  A["用户右键空白处"] --> B["选择缺失模型"]
  B --> C["前端确定范围：选中节点或全工作流"]
  C --> D["扫描模型控件"]
  D --> E["请求后端匹配 API"]
  E --> F["folder_paths 返回模型清单"]
  F --> G["后端匹配评分"]
  G --> H["弹框展示候选和原因"]
  H --> I["用户确认或手动调整"]
  I --> J["写回控件值"]
  J --> K["触发 ComfyUI 图变更并支持撤销"]
```

评分逻辑放在后端 Python，原因是测试更稳定，后续扩展规则更容易。前端负责扫描当前图、展示候选、应用写回。

## 模型控件识别

第一版采用通用识别策略：

- 扫描目标节点里的控件。
- 控件值是字符串。
- 控件值看起来像模型文件名或模型相对路径。
- 支持常见扩展名：`.safetensors`、`.ckpt`、`.pt`、`.pth`、`.bin`、`.gguf`、`.onnx`。
- 不限定节点类型，尽量覆盖第三方节点。

误判保护：

- 没有模型文件扩展名、也不像模型相对路径的普通文本不纳入。
- 候选分低于 `90%` 时不自动预选。
- 每行都有 `不调整` 复选框。
- 应用前只修改用户确认的行。

## 匹配规则

匹配结果包含：

- `score`：综合分。
- `reasons`：标签原因。
- `auto_select`：是否自动预选。

规则：

- 主体名一致：`100%`，自动预选。
- 主体名一致但目录不同：`100%`，自动预选，原因包含 `目录不同`。
- 主体名一致但精度不同：`95%`，自动预选，原因包含 `精度不同`。
- 主体名一致但参数量不同：`90%`，自动预选，原因包含 `参数量不同`。
- 其他候选：按相似度排序展示，低于 `90%` 不自动预选。

主体名归一化需要去掉或单独识别：

- 目录前缀。
- 文件扩展名。
- 精度标识：`fp8`、`fp16`、`fp32`、`bf16`、`e4m3`、`e5m2`。
- 参数量标识：`1.5b`、`3b`、`7b`、`14b`、`32b`、`72b` 等。
- 常见分隔符差异：`-`、`_`、`.`、空格。

## 弹框交互

右键菜单：

- 在 ComfyUI 画布空白处右键，新增 `选择缺失模型`。
- 如果当前有选中节点，弹框显示 `范围：选中 N 个节点`。
- 如果没有选中节点，弹框显示 `范围：整个工作流`。

弹框：

- 标题：`模型查找结果`。
- 可拖动标题栏移动。
- 表格列宽可拖拽。
- 顶部统计：
  - `精确匹配`
  - `自动候选`
  - `需手动`
  - `未找到`
  - `共 N 个`
- 行状态：
  - `精确匹配`：`100%`，默认选中。
  - `自动候选`：`90%-95%`，默认选中。
  - `需手动`：低于 `90%`，展示候选但不默认替换。
  - `未找到`：无候选，提供外部搜索按钮。
- 每行有 `不调整` 复选框。
- 候选下拉框可手动选择其他候选。
- 底部按钮：`取消`、`应用更改`。

外部搜索：

- `HF`：`https://huggingface.co/search/full-text?q=<模型名>`
- `C`：`https://civitai.com/search/models?sortBy=models_v9&query=<模型名>`
- `G`：`https://www.google.com/search?q=<模型名>`

## 多语言

UI 文案支持中文和英文。

默认语言规则：

- 优先读取 ComfyUI 当前语言设置。
- 如果无法读取，默认中文。
- 如果 ComfyUI 返回的语言不是中文，则默认英文。

第一版需要准备以下文案键：

- `menu.selectMissingModels`
- `dialog.title`
- `dialog.scopeSelected`
- `dialog.scopeWorkflow`
- `stats.exact`
- `stats.auto`
- `stats.manual`
- `stats.missing`
- `stats.total`
- `columns.status`
- `columns.original`
- `columns.replacement`
- `columns.skip`
- `columns.score`
- `columns.reasons`
- `columns.actions`
- `status.exact`
- `status.auto`
- `status.manual`
- `status.missing`
- `buttons.cancel`
- `buttons.apply`
- `buttons.huggingFace`
- `buttons.civitai`
- `buttons.google`
- `reasons.sameBaseName`
- `reasons.differentDirectory`
- `reasons.differentPrecision`
- `reasons.differentParams`
- `reasons.similarName`

## 撤销策略

点击 `应用更改` 前，前端记录每个要修改控件的旧值。

应用时：

1. 跳过 `不调整` 的行。
2. 跳过没有选中候选的行。
3. 将新值写入对应 widget。
4. 触发 widget/node 的变更事件。
5. 将整批修改作为一次图变更处理。

优先使用 ComfyUI 当前前端可用的 history/change 机制，使 `Ctrl+Z` 能撤销整批修改。若当前 ComfyUI 版本的撤销 API 不稳定，第一版需要保留旧值记录，并确保应用失败时能回滚本次已写入的控件。

## 测试

Python 单元测试覆盖：

- 主体名一致返回 `100%`，并自动预选。
- 目录不同仍返回 `100%`，并自动预选。
- 精度不同返回 `95%`，并自动预选。
- 参数量不同返回 `90%`，并自动预选。
- 普通相似名低于 `90%`，不自动预选。
- 候选结果按分数降序排列。

手动测试覆盖：

- 右键空白处能看到 `选择缺失模型`。
- 没有选中节点时扫描整个工作流。
- 选中多个节点时只扫描选中节点。
- 弹框可拖动。
- 表格列宽可拖拽。
- `不调整` 能跳过指定行。
- `应用更改` 能写回控件。
- `Ctrl+Z` 能撤销或失败时能回滚。
- `HF / C / G` 能打开正确搜索链接。
- 中文 ComfyUI 显示中文 UI。
- 非中文 ComfyUI 显示英文 UI。

## 开源准备

第一版项目需要包含：

- `README.md`：中文为主，说明安装、功能、使用方法、限制。
- `pyproject.toml`：基础项目信息，便于后续发布和测试。
- 清晰目录结构，方便未来新增更多功能模块。
- 不提交 `.superpowers/`、虚拟环境、缓存文件。

