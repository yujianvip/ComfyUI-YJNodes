import { app } from "../../../../../scripts/app.js";
import { api } from "../../../../../scripts/api.js";
import { registerYJCanvasMenuItem } from "../../shared/canvas_menu.js";
import {
  buildModelCatalog,
  buildSerializedNodeMap,
  defaultCandidateName,
  extractModelReferencesFromNode,
  groupMatcherResults,
  modelSearchName,
  resolveWidgetChoice,
  shouldDisableCandidateSelect,
} from "./core.js";

const I18N = {
  zh: {
    menuSelectMissingModels: "⚡ 选择缺失模型",
    loading: "正在扫描工作流和模型目录...",
    loadFailed: "模型匹配器打开失败",
    dialogTitle: "模型查找结果",
    scopeSelected: (count) => `范围：选中 ${count} 个节点`,
    scopeWorkflow: "范围：整个工作流",
    exact: "精确匹配",
    fuzzy: "模糊匹配",
    auto: "自动候选",
    manual: "需手动",
    missing: "未找到",
    total: "共",
    status: "状态",
    source: "来源",
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
    openFolder: "打开模型目录",
    openFolderFailed: "打开模型目录失败",
    writableWidget: "可写控件",
    unknownReadOnly: "UNKNOWN 节点原始值",
  },
  en: {
    menuSelectMissingModels: "⚡ Select Missing Models",
    loading: "Scanning the workflow and model folders...",
    loadFailed: "Failed to open Model Matcher",
    dialogTitle: "Model Match Results",
    scopeSelected: (count) => `Scope: ${count} selected nodes`,
    scopeWorkflow: "Scope: Whole workflow",
    exact: "Exact",
    fuzzy: "Fuzzy",
    auto: "Auto",
    manual: "Manual",
    missing: "Missing",
    total: "Total",
    status: "Status",
    source: "Source",
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
    openFolder: "Open model folder",
    openFolderFailed: "Failed to open model folder",
    writableWidget: "Writable widget",
    unknownReadOnly: "UNKNOWN original value",
  },
};

function getLang() {
  const settings = app?.ui?.settings;
  const setting =
    settings?.getSettingValue?.("Comfy.Locale") ||
    settings?.getSettingValue?.("Comfy.Locale.Language") ||
    settings?.getSettingValue?.("locale");
  if (!setting) return "zh";
  return String(setting).toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t() {
  return I18N[getLang()] || I18N.zh;
}

function selectedNodes() {
  return Object.values(app.canvas?.selected_nodes || {});
}

function getTargetNodes() {
  const selected = selectedNodes();
  return selected.length > 0 ? selected : app.graph?._nodes || [];
}

function scanModelReferences(modelCatalog) {
  const targetNodes = getTargetNodes();
  const serializedNodeMap = buildSerializedNodeMap(app.graph?.serialize?.());
  const registeredNodeTypes = globalThis.LiteGraph?.registered_node_types || null;
  const references = [];
  for (const node of targetNodes) {
    references.push(
      ...extractModelReferencesFromNode(
        node,
        serializedNodeMap.get(Number(node.id)),
        modelCatalog,
        registeredNodeTypes,
      )
    );
  }
  return { references, selectedCount: selectedNodes().length };
}

async function requestModelCatalog() {
  const response = await api.fetchApi("/yj_nodes/model_matcher/models", { cache: "no-store" });
  if (!response.ok) throw new Error(`Model catalog request failed: ${response.status}`);
  const payload = await response.json();
  return buildModelCatalog(payload.models || [], payload.model_types || []);
}

async function requestMatches(references) {
  const response = await api.fetchApi("/yj_nodes/model_matcher/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ references }),
  });
  if (!response.ok) throw new Error(`Model matcher request failed: ${response.status}`);
  return response.json();
}

async function openModelMatcher() {
  const loadingBackdrop = showLoadingDialog();
  try {
    const modelCatalog = await requestModelCatalog();
    const { references, selectedCount } = scanModelReferences(modelCatalog);
    const payload = await requestMatches(references);
    showMatcherDialog(payload.results || [], selectedCount);
  } catch (error) {
    console.error("[ComfyUI-YJNodes] model matcher failed", error);
    loadingBackdrop.remove();
    showOpenError(error);
  }
}

function showLoadingDialog() {
  ensureStyles();
  document.querySelector(".yj-mm-backdrop")?.remove();
  const backdrop = document.createElement("div");
  backdrop.className = "yj-mm-backdrop";
  const panel = document.createElement("div");
  panel.className = "yj-mm-loading";
  const spinner = document.createElement("span");
  spinner.className = "yj-mm-spinner";
  const label = document.createElement("span");
  label.textContent = t().loading;
  panel.append(spinner, label);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  return backdrop;
}

function showOpenError(error) {
  showUserError(t().loadFailed, error?.message || String(error));
}

function showUserError(title, message) {
  const dialog = app?.extensionManager?.dialog;
  if (typeof dialog?.alert === "function") {
    void dialog.alert({ title, message });
    return;
  }
  if (typeof app?.ui?.dialog?.show === "function") {
    app.ui.dialog.show(message);
    return;
  }
  window.alert(`${title}: ${message}`);
}

function showMatcherDialog(results, selectedCount) {
  ensureStyles();
  document.querySelector(".yj-mm-backdrop")?.remove();

  const lang = t();
  const backdrop = document.createElement("div");
  backdrop.className = "yj-mm-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "yj-mm-dialog";

  dialog.innerHTML = `
    <div class="yj-mm-title">
      <div>
        <strong>${lang.dialogTitle}</strong>
        <div class="yj-mm-scope">${selectedCount > 0 ? lang.scopeSelected(selectedCount) : lang.scopeWorkflow}</div>
      </div>
      <button class="yj-mm-close">×</button>
    </div>
    <div class="yj-mm-body">
      <div class="yj-mm-stats">
        <button class="yj-mm-filter" data-filter="exact"><span class="yj-mm-count">0</span> ${lang.exact}</button>
        <button class="yj-mm-filter" data-filter="fuzzy"><span class="yj-mm-count">0</span> ${lang.fuzzy}</button>
        <button class="yj-mm-filter" data-filter="missing"><span class="yj-mm-count">0</span> ${lang.missing}</button>
        <span class="yj-mm-total">${lang.total} ${results.length}</span>
      </div>
      <table class="yj-mm-table">
        <thead><tr>
          <th style="width:190px">${lang.status}<span class="yj-mm-resizer"></span></th>
          <th style="width:250px">${lang.original}<span class="yj-mm-resizer"></span></th>
          <th style="width:340px">${lang.replacement}<span class="yj-mm-resizer"></span></th>
          <th style="width:90px">${lang.skip}<span class="yj-mm-resizer"></span></th>
          <th style="width:70px">${lang.score}<span class="yj-mm-resizer"></span></th>
          <th style="width:190px">${lang.actions}</th>
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
  let entryIndex = 0;
  for (const group of groupMatcherResults(results)) {
    const row = document.createElement("tr");
    const entries = group.map((result) => {
      const id = String(entryIndex++);
      const candidates = result.candidates || [];
      const best = candidates[0];
      const status = statusForResult(result);
      const defaultName = defaultCandidateName(candidates);
      const applyable = result.can_apply !== false;
      const options = candidates.map((candidate) => {
        const selected = candidate.name === defaultName ? "selected" : "";
        return `<option value="${escapeHtml(candidate.name)}" ${selected}>${escapeHtml(candidate.name)}</option>`;
      }).join("");
      return { id, result, candidates, best, status, applyable, options };
    });
    row.innerHTML = `
      <td>
        <div class="yj-mm-cell-stack">${entries.map(({ id, result, best, status }) => `
          <div class="yj-mm-cell-line yj-mm-model-meta">
            <button class="yj-mm-folder" data-entry="${id}" title="${lang.openFolder}" aria-label="${lang.openFolder}">📁</button>
            <div class="yj-mm-meta-copy">
              <span class="yj-mm-status yj-mm-entry-status" data-entry="${id}" data-status="${status.key}" title="${escapeHtml(best ? best.reasons.map(reasonText).join(" / ") : "")}">${status.label}</span>
              <span class="yj-mm-node-type">${escapeHtml([result.node_type, result.widget_name].filter(Boolean).join(" · "))}</span>
            </div>
          </div>`).join("")}</div>
      </td>
      <td><div class="yj-mm-cell-stack">${entries.map(({ id, result }) => `
        <div class="yj-mm-cell-line yj-mm-original" data-entry="${id}" title="${escapeHtml(result.value)}">
          <span class="yj-mm-widget-name">${escapeHtml(result.widget_name || "")}</span>
          <span class="yj-mm-original-value">${escapeHtml(result.value)}</span>
        </div>`).join("")}</div></td>
      <td><div class="yj-mm-cell-stack">${entries.map(({ id, applyable, options }) => `
        <div class="yj-mm-cell-line"><select class="yj-mm-select" data-entry="${id}" ${applyable ? "" : "disabled"}>${options || '<option value=""></option>'}</select></div>`).join("")}</div></td>
      <td><div class="yj-mm-cell-stack">${entries.map(({ id, applyable }) => `
        <div class="yj-mm-cell-line"><label class="yj-mm-skip-label"><input class="yj-mm-skip" data-entry="${id}" type="checkbox" ${applyable ? "" : "checked disabled"}><span>${lang.skip}</span></label></div>`).join("")}</div></td>
      <td><div class="yj-mm-cell-stack">${entries.map(({ id, best }) => `
        <div class="yj-mm-cell-line yj-mm-score" data-entry="${id}">${best ? `${best.score}%` : ""}</div>`).join("")}</div></td>
      <td>
        <div class="yj-mm-cell-stack">${entries.map(({ id }) => `
          <div class="yj-mm-cell-line yj-mm-actions" data-entry="${id}">
            <button class="yj-mm-action yj-mm-hf">HF</button>
            <button class="yj-mm-action yj-mm-c">C</button>
            <button class="yj-mm-action yj-mm-g">G</button>
          </div>`).join("")}</div>
      </td>
    `;
    for (const entry of entries) wireResultEntry(dialog, row, entry);
    updateGroupedRowStatuses(row);
    tbody.appendChild(row);
  }

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  refreshStats(dialog);
  wireDialogBehavior(backdrop, dialog);
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

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
  return statusForCandidate((result.candidates || [])[0]);
}

function statusForCandidate(candidate) {
  if (!candidate) return { key: "missing", label: t().missing };
  if (candidate.score === 100) return { key: "exact", label: t().exact };
  return { key: "fuzzy", label: t().fuzzy };
}

function updateGroupedRowStatuses(row) {
  row.dataset.statuses = [...row.querySelectorAll(".yj-mm-entry-status")]
    .map((element) => element.dataset.status)
    .filter(Boolean)
    .join(" ");
}

function updateEntryCandidate(dialog, row, select) {
  const selectedName = select.value;
  const candidates = select.yjCandidates || [];
  const candidate = candidates.find((item) => item.name === selectedName) || candidates[0];
  const status = statusForCandidate(candidate);
  const entryId = select.dataset.entry;
  const statusElement = row.querySelector(`.yj-mm-entry-status[data-entry="${entryId}"]`);
  const scoreElement = row.querySelector(`.yj-mm-score[data-entry="${entryId}"]`);
  statusElement.dataset.status = status.key;
  statusElement.textContent = status.label;
  statusElement.title = candidate
    ? candidate.reasons.map(reasonText).join(" / ")
    : "";
  scoreElement.textContent = candidate ? `${candidate.score}%` : "";
  updateGroupedRowStatuses(row);
  refreshStats(dialog);
  applyActiveFilter(dialog);
}

function wireResultEntry(dialog, row, entry) {
  const selector = `[data-entry="${entry.id}"]`;
  const select = row.querySelector(`.yj-mm-select${selector}`);
  const skipCheckbox = row.querySelector(`.yj-mm-skip${selector}`);
  const folderButton = row.querySelector(`.yj-mm-folder${selector}`);
  const actions = row.querySelector(`.yj-mm-actions${selector}`);
  select.yjCandidates = entry.candidates;
  select.yjResult = entry.result;
  select.yjSkip = skipCheckbox;
  select.addEventListener("change", () => updateEntryCandidate(dialog, row, select));
  skipCheckbox.addEventListener("change", () => {
    select.disabled = shouldDisableCandidateSelect(entry.applyable, skipCheckbox.checked);
  });
  folderButton.addEventListener("click", () => openModelFolder(select));
  const query = entry.result.value || "";
  actions.querySelector(".yj-mm-hf").onclick = () => window.open(searchUrl("hf", query), "_blank", "noopener,noreferrer");
  actions.querySelector(".yj-mm-c").onclick = () => window.open(searchUrl("c", query), "_blank", "noopener,noreferrer");
  actions.querySelector(".yj-mm-g").onclick = () => window.open(searchUrl("g", query), "_blank", "noopener,noreferrer");
}

function refreshStats(dialog) {
  const counts = { exact: 0, fuzzy: 0, missing: 0 };
  for (const statusElement of dialog.querySelectorAll(".yj-mm-entry-status")) {
    const status = statusElement.dataset.status;
    counts[status] = (counts[status] || 0) + 1;
  }
  for (const [status, count] of Object.entries(counts)) {
    const countElement = dialog.querySelector(`.yj-mm-filter[data-filter="${status}"] .yj-mm-count`);
    if (countElement) countElement.textContent = String(count);
  }
}

function applyActiveFilter(dialog) {
  const active = dialog.querySelector(".yj-mm-filter.is-active")?.dataset.filter || "";
  for (const row of dialog.querySelectorAll("tbody tr")) {
    const statuses = (row.dataset.statuses || "").split(" ");
    row.hidden = Boolean(active && !statuses.includes(active));
  }
}

async function openModelFolder(select) {
  const selectedName = select.value || "";
  const candidate = (select.yjCandidates || []).find((item) => item.name === selectedName);
  const modelType = candidate?.type || select.yjResult?.model_types?.[0] || "";
  try {
    const response = await api.fetchApi("/yj_nodes/model_matcher/open_folder", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-YJNodes-Request": "1",
      },
      body: JSON.stringify({ model_type: modelType, model_name: selectedName }),
    });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`.trim());
  } catch (error) {
    console.error("[ComfyUI-YJNodes] open model folder failed", error);
    showUserError(t().openFolderFailed, error?.message || String(error));
  }
}

function ensureStyles() {
  if (document.getElementById("yj-model-matcher-style")) return;
  const style = document.createElement("style");
  style.id = "yj-model-matcher-style";
  style.textContent = `
    .yj-mm-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(4,4,12,.56);box-sizing:border-box}
    .yj-mm-loading{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:12px;padding:18px 22px;background:#111124;color:#f2f1fb;border:1px solid #303047;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.45);font-family:Microsoft YaHei,system-ui,sans-serif}
    .yj-mm-spinner{width:18px;height:18px;border:2px solid #55556f;border-top-color:#3f82f6;border-radius:50%;animation:yj-mm-spin .8s linear infinite}
    @keyframes yj-mm-spin{to{transform:rotate(360deg)}}
    .yj-mm-dialog{position:relative;width:min(1450px,calc(100vw - 48px));max-height:88vh;background:#101022;color:#f2f1fb;border:1px solid #2d2d46;border-radius:8px;box-shadow:0 24px 80px rgba(0,0,0,.55);overflow:hidden;font-family:"Microsoft YaHei UI","Segoe UI",sans-serif;letter-spacing:0}
    .yj-mm-title{display:flex;align-items:center;justify-content:space-between;padding:24px 30px 20px;border-bottom:1px solid #292940;cursor:move;user-select:none}
    .yj-mm-title strong{font-size:22px;line-height:1.2;letter-spacing:0}
    .yj-mm-scope{margin-top:7px;color:#85859a;font-size:12px}
    .yj-mm-close{width:34px;height:34px;border:0;background:transparent;color:#9292a5;font-size:28px;line-height:1;cursor:pointer}
    .yj-mm-close:hover{color:#fff}
    .yj-mm-body{padding:20px 30px 16px;overflow:auto;max-height:calc(88vh - 154px)}
    .yj-mm-stats{display:flex;gap:10px;align-items:center;margin-bottom:14px;color:#9292a5}
    .yj-mm-filter{border:1px solid #36364f;border-radius:999px;padding:7px 13px;background:#1c1c33;color:#a6a6b7;font:600 13px/1 "Microsoft YaHei UI","Segoe UI",sans-serif;cursor:pointer;transition:border-color .16s,background .16s,color .16s}
    .yj-mm-filter:hover{border-color:#6b5a30;color:#fff}
    .yj-mm-filter.is-active{border-color:#a96506;background:#302512;color:#ffad23}
    .yj-mm-total{margin-left:8px;font-size:13px}
    .yj-mm-table{width:100%;min-width:1050px;border-collapse:separate;border-spacing:0 7px;table-layout:fixed}
    .yj-mm-table th{color:#9696a8;font-size:13px;font-weight:700;text-align:left;padding:8px 12px;position:relative;border-bottom:1px solid #292940}
    .yj-mm-table td{height:64px;background:#241d27;padding:0 12px;vertical-align:middle;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
    .yj-mm-table tr td:first-child{border-left:4px solid #a96908;border-radius:7px 0 0 7px}
    .yj-mm-table tr td:last-child{border-radius:0 7px 7px 0}
    .yj-mm-table tr[hidden]{display:none}
    .yj-mm-resizer{position:absolute;right:-2px;top:7px;width:5px;height:25px;cursor:col-resize;background:transparent}
    .yj-mm-resizer:hover{background:#6c6c86}
    .yj-mm-cell-stack{display:flex;flex-direction:column;min-width:0}
    .yj-mm-cell-line{display:flex;align-items:center;min-height:64px;min-width:0;padding:8px 0;box-sizing:border-box}
    .yj-mm-cell-line+.yj-mm-cell-line{border-top:1px solid #3b303d}
    .yj-mm-model-meta{display:flex;align-items:center;gap:12px;min-width:0}
    .yj-mm-folder{flex:0 0 44px;width:44px;height:40px;border:1px solid #403847;border-radius:6px;background:#312a35;font-size:21px;cursor:pointer}
    .yj-mm-folder:hover{border-color:#c07b10;background:#3a3037}
    .yj-mm-meta-copy{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}
    .yj-mm-status{max-width:100%;padding:5px 10px;border:1px solid #7b4c08;border-radius:999px;color:#ff9f0a;background:#35250f;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .yj-mm-node-type{max-width:100%;color:#85818b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .yj-mm-original{align-items:flex-start;justify-content:center;flex-direction:column;gap:4px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
    .yj-mm-widget-name{color:#9690a0;font-size:11px;font-weight:600}
    .yj-mm-original-value{max-width:100%;overflow-wrap:anywhere}
    .yj-mm-select{width:100%;height:42px;background:#0e0e24;color:#f1f1f6;border:1px solid #8a5708;border-radius:6px;padding:8px 12px;font:500 13px/1 "Microsoft YaHei UI","Segoe UI",sans-serif}
    .yj-mm-select:disabled{opacity:.55;cursor:not-allowed}
    .yj-mm-skip-label{display:flex;align-items:center;gap:7px;color:#8e8a94;font-size:12px;white-space:nowrap}
    .yj-mm-skip{width:17px;height:17px;accent-color:#3f82f6}
    .yj-mm-score{color:#ff9f0a;font-size:16px;font-weight:800}
    .yj-mm-actions{flex-wrap:wrap;align-content:center}
    .yj-mm-footer{display:flex;justify-content:flex-end;gap:12px;padding:16px 30px;border-top:1px solid #292940}
    .yj-mm-button{min-width:100px;border:0;border-radius:7px;padding:11px 20px;color:#fff;font-weight:700;cursor:pointer}
    .yj-mm-cancel{background:#24243a}
    .yj-mm-apply{background:#3f82f6}
    .yj-mm-action{min-width:48px;border:0;border-radius:6px;padding:7px 9px;color:#fff;font-weight:700;cursor:pointer;margin:2px 4px 2px 0}
    .yj-mm-hf{background:#40ad50}.yj-mm-c{background:#ff9800}.yj-mm-g{background:#ff463d}
    @media(max-width:760px){.yj-mm-backdrop{padding:10px}.yj-mm-dialog{width:calc(100vw - 20px);max-height:94vh}.yj-mm-title{padding:18px}.yj-mm-body{padding:14px 18px;max-height:calc(94vh - 142px)}.yj-mm-footer{padding:14px 18px}.yj-mm-stats{flex-wrap:wrap}}
  `;
  document.head.appendChild(style);
}

function wireDialogBehavior(backdrop, dialog) {
  dialog.querySelector(".yj-mm-close").onclick = () => backdrop.remove();
  dialog.querySelector(".yj-mm-cancel").onclick = () => backdrop.remove();

  const title = dialog.querySelector(".yj-mm-title");
  title.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = dialog.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    dialog.style.position = "fixed";
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.width = `${rect.width}px`;
    function move(moveEvent) {
      const maxLeft = Math.max(0, window.innerWidth - dialog.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - 48);
      dialog.style.left = `${Math.min(maxLeft, Math.max(0, moveEvent.clientX - offsetX))}px`;
      dialog.style.top = `${Math.min(maxTop, Math.max(0, moveEvent.clientY - offsetY))}px`;
    }
    function stop() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });

  for (const filter of dialog.querySelectorAll(".yj-mm-filter")) {
    filter.addEventListener("click", () => {
      const wasActive = filter.classList.contains("is-active");
      dialog.querySelectorAll(".yj-mm-filter").forEach((item) => item.classList.remove("is-active"));
      if (!wasActive) filter.classList.add("is-active");
      applyActiveFilter(dialog);
    });
  }

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
}

function findNodeById(id) {
  return app.graph?.getNodeById
    ? app.graph.getNodeById(Number(id))
    : (app.graph?._nodes || []).find((node) => Number(node.id) === Number(id));
}

function applyWidgetValue(node, widgetIndex, value) {
  const widget = node?.widgets?.[Number(widgetIndex)];
  if (!widget) return false;
  widget.value = value;
  widget.callback?.(value, app.canvas, node, app.canvas?.graph_mouse);
  node.setDirtyCanvas?.(true, true);
  return true;
}

function saveHistoryCheckpoint() {
  app.graph?.beforeChange?.();
  app.canvas?.setDirty?.(true, true);
}

function finishHistoryCheckpoint() {
  app.graph?.afterChange?.();
  app.graph?.setDirtyCanvas?.(true, true);
  app.canvas?.setDirty?.(true, true);
}

async function refreshMissingModelState() {
  if (typeof app.refreshMissingModels !== "function") return;
  try {
    await app.refreshMissingModels({ silent: true, reloadDefs: false });
  } catch (error) {
    console.warn("[ComfyUI-YJNodes] failed to refresh missing-model state", error);
  }
}

async function applyModelChanges(dialog, backdrop) {
  const changes = [];
  for (const select of dialog.querySelectorAll(".yj-mm-select")) {
    const result = select.yjResult;
    if (!result || result.can_apply === false) continue;
    if (select.yjSkip?.checked) continue;
    const nextValue = select.value;
    if (!nextValue) continue;
    const node = findNodeById(result.node_id);
    const widget = node?.widgets?.[Number(result.widget_index)];
    if (!widget) continue;
    const widgetValue = resolveWidgetChoice(widget, nextValue);
    if (widget.value === widgetValue) continue;
    changes.push({ node, widgetIndex: Number(result.widget_index), oldValue: widget.value, newValue: widgetValue });
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
    await refreshMissingModelState();
    app.canvas?.setDirty?.(true, true);
    backdrop.remove();
  } catch (error) {
    console.error("[ComfyUI-YJNodes] apply failed, rolling back", error);
    for (const change of applied.reverse()) {
      applyWidgetValue(change.node, change.widgetIndex, change.oldValue);
    }
    finishHistoryCheckpoint();
  }
}

function searchUrl(kind, query) {
  const encoded = encodeURIComponent(modelSearchName(query));
  if (kind === "hf") return `https://huggingface.co/search/full-text?q=${encoded}`;
  if (kind === "c") return `https://civitai.com/search/models?sortBy=models_v9&query=${encoded}`;
  return `https://www.google.com/search?q=${encoded}`;
}

app.registerExtension({
  name: "ComfyUI-YJNodes.ModelMatcher",
  setup() {
    registerYJCanvasMenuItem(LGraphCanvas, {
      id: "model-matcher",
      order: 20,
      content: () => t().menuSelectMissingModels,
      callback: () => void openModelMatcher(),
    });
  },
});
