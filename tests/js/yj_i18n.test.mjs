import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getCurrentLanguage,
  messageFor,
  resolveLanguage,
} from "../../web/js/shared/i18n.js";

const messages = { zh: { title: "暂停" }, en: { title: "Pause", fallback: "Fallback" } };

test("中文区域语言解析为中文", () => {
  assert.equal(resolveLanguage("zh-CN"), "zh");
  assert.equal(messageFor(messages, "zh", "title"), "暂停");
});

test("英文区域语言解析为英文", () => {
  assert.equal(resolveLanguage("en-US"), "en");
  assert.equal(messageFor(messages, "en", "title"), "Pause");
});

test("未知语言及缺失文案回退到英文", () => {
  assert.equal(resolveLanguage("fr-FR"), "en");
  assert.equal(messageFor(messages, "zh", "fallback"), "Fallback");
});

test("ComfyUI 当前语言优先于浏览器语言", () => {
  const app = { extensionManager: { setting: { get: () => "en" } } };
  const environment = { navigator: { language: "zh-CN" } };

  assert.equal(getCurrentLanguage(app, environment), "en");
});

test("ComfyUI 未提供语言时使用浏览器语言", () => {
  assert.equal(getCurrentLanguage({}, { navigator: { languages: ["zh-CN"] } }), "zh");
});

test("Legacy ComfyUI 语言设置在现代接口缺失时仍生效", () => {
  const app = { ui: { settings: { getSettingValue: () => "zh-CN" } } };
  const environment = { navigator: { language: "en-US" } };

  assert.equal(getCurrentLanguage(app, environment), "zh");
});

test("未知 ComfyUI 和浏览器语言回退到英文", () => {
  const app = { extensionManager: { setting: { get: () => "fr-FR" } } };

  assert.equal(getCurrentLanguage(app, { navigator: { language: "de-DE" } }), "en");
});

test("动态合并节点在中英及未知语言下显示正确输入名称", () => {
  const definitions = Object.fromEntries(["zh", "en"].map((language) => [
    language,
    JSON.parse(readFileSync(`locales/${language}/nodeDefs.json`, "utf8")),
  ]));
  const name = (locale) => definitions[resolveLanguage(locale)].YJDynamicImageBatchConcat.inputs["减去重复帧数"].name;
  assert.equal(name("zh-CN"), "减去重复帧数");
  assert.equal(name("en-US"), "Frames to trim");
  assert.equal(name("fr-FR"), "Frames to trim");
});
