import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("web/js/features/model_matcher/extension.js", "utf8");

test("应用模型替换后刷新 ComfyUI 的缺失模型状态", () => {
  assert.match(source, /await app\.refreshMissingModels\(\{ silent: true, reloadDefs: false \}\)/);
  assert.match(source, /finishHistoryCheckpoint\(\);\s*await refreshMissingModelState\(\);/);
});

test("候选下拉框只显示模型路径而不显示模型分类", () => {
  assert.doesNotMatch(source, /candidate\.display_name/);
  assert.match(source, /<option value=.*escapeHtml\(candidate\.name\).*escapeHtml\(candidate\.name\)/s);
});

test("每个替换下拉框都有独立候选搜索框", () => {
  assert.match(source, /class="yj-mm-candidate-search" data-entry=/);
  assert.match(source, /filterModelCandidates\(entry\.candidates, searchInput\.value\)/);
});

test("候选搜索框显示在原始模型名后面", () => {
  assert.match(source, /yj-mm-original[\s\S]*yj-mm-original-value[\s\S]*yj-mm-candidate-search[\s\S]*yj-mm-select/);
  assert.doesNotMatch(source, /yj-mm-replacement-tools/);
});
