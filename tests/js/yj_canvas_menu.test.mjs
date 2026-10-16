import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function dataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const app = { extensions: [], registerExtension(extension) { this.extensions.push(extension); } };
globalThis.__yjMenuTestApp = app;
const coreUrl = dataUrl(readFileSync("web/js/shared/canvas_menu_core.js", "utf8"));
const appUrl = dataUrl("export const app = globalThis.__yjMenuTestApp;");
const source = readFileSync("web/js/shared/canvas_menu.js", "utf8")
  .replace('"../../../../scripts/app.js"', `"${appUrl}"`)
  .replace('"./canvas_menu_core.js"', `"${coreUrl}"`);
const { registerYJCanvasMenuItem } = await import(dataUrl(source));

test("通过 ComfyUI 官方钩子为 Nodes 2.0 和 Legacy 画布提供菜单", () => {
  registerYJCanvasMenuItem({ id: "model-matcher", order: 20, content: () => "模型", callback() {} });
  registerYJCanvasMenuItem({ id: "set-get-resolver", order: 10, content: () => "连线", callback() {} });
  const hook = app.extensions.find((item) => item.name === "ComfyUI-YJNodes.CanvasMenu");
  assert.ok(hook);
  assert.deepEqual(hook.getCanvasMenuItems({ selectedItems: new Set() }).map((item) => item?.content ?? null), [null, "连线", "模型"]);
  assert.deepEqual(hook.getCanvasMenuItems({ selected_nodes: {} }).map((item) => item?.content ?? null), [null, "连线", "模型"]);
  assert.doesNotMatch(source, /getCanvasMenuOptions|\.prototype/);
});

test("重复注册同一菜单项会更新回调而不会增加条目", () => {
  registerYJCanvasMenuItem({ id: "model-matcher", order: 20, content: "新模型", callback() {} });
  const hook = app.extensions[0];
  assert.deepEqual(hook.getCanvasMenuItems().map((item) => item?.content ?? null), [null, "连线", "新模型"]);
});
