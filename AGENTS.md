# 项目开发规则

## 固定开发环境

- 本项目固定使用 `D:\make_custom_nodes\ComfyUI-aki-v1.7\ComfyUI` 作为本地 ComfyUI 开发环境，访问地址固定为 `http://127.0.0.1:8189`。
- 开发环境中的插件入口固定为 `D:\make_custom_nodes\ComfyUI-aki-v1.7\ComfyUI\custom_nodes\ComfyUI-YJNodes`，该目录必须保持为指向当前项目根目录的 Junction，不得改回文件副本。
- `E:\ComfyUI-aki\ComfyUI`（默认端口 8188）不用于本项目开发、调试或验收，避免误读旧插件副本。
- 前端 JavaScript 修改后在 8189 页面刷新验证；Python 节点实现修改可使用 `ComfyUI-LG_HotReload`，但新增模块、修改导入关系、节点注册或 `__init__.py` 后必须重启 8189 开发实例。
- 调试前必须先确认浏览器端口为 8189，并确认 `ComfyUI-YJNodes` 未被加入 `ComfyUI-LG_HotReload` 的排除列表。

## ComfyUI Nodes 兼容性

- 所有现有功能和后续新增功能必须同时兼容 Legacy Nodes（Nodes 1.0）与 Modern Node Design（Nodes 2.0）。
- 当 Nodes 1.0 与 Nodes 2.0 的接口、渲染方式或行为发生冲突时，以 Nodes 2.0 的官方公开接口和行为为优先，并为 Nodes 1.0 提供不影响 Nodes 2.0 的回退实现。
- 优先使用 ComfyUI 官方扩展钩子，禁止为了兼容 Nodes 1.0 而修改全局 LiteGraph 原型或覆盖 Nodes 2.0 的行为。
- 前端功能必须通过 `web/js/shared/comfy_compat.js` 访问活动图、选择状态和图变更生命周期；旧字段只能封装在该兼容层中。
- 新增或修改前端功能时，必须同时提供 Nodes 2.0 主路径测试和 Nodes 1.0 回退测试。

## 节点中英文与自动语言切换

- 所有新增或修改的节点必须同时提供中文和英文版本，覆盖节点显示名称、分类、输入输出名称、控件标签、选项说明、提示信息、警告及错误信息。
- 展示语言必须自动跟随 ComfyUI 当前语言；ComfyUI 未提供语言信息时，回退到系统或浏览器语言。中文环境显示中文，其他语言环境默认显示英文，不得要求用户为节点单独手动选择语言。
- 仅本地化面向用户的显示文本。节点类名、注册键、输入输出内部键、序列化字段等影响工作流兼容性的标识必须保持稳定，不得随语言变化。
- 语言检测和文案获取应集中封装并复用，禁止在各节点中散落重复判断。
- 新增或修改节点时，必须同时提供中文、英文和未知语言回退到英文的测试，并确保 Legacy Nodes（Nodes 1.0）与 Modern Node Design（Nodes 2.0）下行为一致。
