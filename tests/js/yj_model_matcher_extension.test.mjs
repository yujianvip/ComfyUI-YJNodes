import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("web/js/features/model_matcher/extension.js", "utf8");

test("选中模型名保留原始下划线并为字形下沿预留空间", () => {
  assert.match(source, /valueElement\.textContent = selectedName \|\| t\(\)\.noCandidate/);
  const rule = source.match(/\.yj-mm-combo-trigger > \.yj-mm-combo-value\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /box-sizing:content-box/);
  assert.match(rule, /height:20px/);
  assert.match(rule, /padding:4px 0/);
  assert.match(rule, /line-height:20px/);
  assert.match(rule, /text-overflow:ellipsis/);
});

test("应用模型替换后刷新 ComfyUI 的缺失模型状态", () => {
  assert.match(source, /await app\.refreshMissingModels\(\{ silent: true, reloadDefs: false \}\)/);
  assert.match(source, /finishHistoryCheckpoint\(\);\s*await refreshMissingModelState\(\);/);
});

test("100% 匹配默认勾选不调整并禁用替换下拉框", () => {
  assert.match(source, /const skipByDefault = shouldSkipCandidateByDefault\(candidates\)/);
  assert.doesNotMatch(source, /skipByDefault = !applyable/);
  assert.match(source, /\$\{skipByDefault \? "checked" : ""\}/);
  assert.match(source, /shouldDisableCandidateSelect\(entry\.applyable, skipCheckbox\.checked\)/);
});

test("模型匹配器通过共享兼容层访问图和选择状态", () => {
  assert.match(source, /getSelectedNodes\(app\)/);
  assert.match(source, /getGraphNodes\(app, getRootGraph\(app\)\)/);
  assert.match(source, /getRootGraph\(app\)\?\.serialize/);
  assert.doesNotMatch(source, /app\.graph|selected_nodes|\._nodes/);
});

test("候选下拉框只显示模型路径而不显示模型分类", () => {
  assert.doesNotMatch(source, /candidate\.display_name/);
  assert.match(source, /<option value=.*escapeHtml\(candidate\.name\).*escapeHtml\(candidate\.name\)/s);
});

test("每个替换下拉框都有独立候选搜索框", () => {
  assert.match(source, /class="yj-mm-candidate-search" type="search"/);
  assert.match(source, /filterModelCandidates\(entry\.candidates, searchInput\.value\)/);
});

test("搜索框与候选列表集成在自定义下拉面板中", () => {
  assert.match(source, /yj-mm-combo-trigger/);
  assert.match(source, /yj-mm-combo-panel[\s\S]*yj-mm-candidate-search[\s\S]*yj-mm-combo-options/);
  assert.match(source, /\.yj-mm-combo-option\{[^}]*min-height:54px/);
  assert.doesNotMatch(source, /class="yj-mm-candidate-search" data-entry=/);
});
