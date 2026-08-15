import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("web/js/shared/canvas_menu.js", "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const module = await import(moduleUrl);
const { registerYJCanvasMenuItem } = module;

test("YJ 画布菜单项按顺序相邻插入", () => {
  class Canvas {}
  Canvas.prototype.getCanvasMenuOptions = () => [{ content: "原菜单" }];

  registerYJCanvasMenuItem(Canvas, {
    id: "model-matcher",
    order: 20,
    content: () => "选择缺失模型",
    callback: () => {},
  });
  registerYJCanvasMenuItem(Canvas, {
    id: "set-get-resolver",
    order: 10,
    content: () => "Set/Get 替换",
    callback: () => {},
  });

  const options = new Canvas().getCanvasMenuOptions();
  assert.deepEqual(options.map((item) => item?.content ?? null), [
    "原菜单",
    null,
    "Set/Get 替换",
    "选择缺失模型",
  ]);
});

test("模块热更新后不会重复包裹画布菜单", async () => {
  class ReloadedCanvas {}
  ReloadedCanvas.prototype.getCanvasMenuOptions = () => [{ content: "原菜单" }];

  const firstModule = await import(`${moduleUrl}#reload-1`);
  const secondModule = await import(`${moduleUrl}#reload-2`);
  firstModule.registerYJCanvasMenuItem(ReloadedCanvas, {
    id: "hot-reload-item",
    order: 30,
    content: "旧回调",
    callback: () => {},
  });
  secondModule.registerYJCanvasMenuItem(ReloadedCanvas, {
    id: "hot-reload-item",
    order: 30,
    content: "新回调",
    callback: () => {},
  });

  const contents = new ReloadedCanvas().getCanvasMenuOptions().map((item) => item?.content ?? null);
  assert.deepEqual(contents, ["原菜单", null, "新回调"]);
});
