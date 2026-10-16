import { app } from "../../../../scripts/app.js";
import { getYJCanvasMenuItems, registerYJCanvasMenuItem } from "./canvas_menu_core.js";

// 统一通过官方画布菜单钩子注册，避免改写全局 LiteGraph 原型。
app.registerExtension({
  name: "ComfyUI-YJNodes.CanvasMenu",
  getCanvasMenuItems() {
    return getYJCanvasMenuItems();
  },
});

export { registerYJCanvasMenuItem };
