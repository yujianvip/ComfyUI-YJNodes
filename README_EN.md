# ComfyUI-YJNodes

A collection of practical nodes and workflow utilities for ComfyUI, including missing-model matching, workflow completion sounds, Set/Get-to-wire conversion, dynamic image batch concatenation, and YJpause workflow breakpoints.

[中文](README.md)

## Features

| Feature | Description |
| --- | --- |
| Missing Model Matcher | Scans selected nodes or the whole workflow, recommends local candidates, and applies replacements in bulk |
| Workflow Completion Sound | Plays a custom sound after each task or once after the entire queue finishes |
| Set/Get to Wires | Expands KJNodes Set Node / Get Node links into physical graph connections |
| Duplicate-Frame Image Batch Concat | Adds up to 20 image inputs dynamically and trims leading overlap from subsequent batches |
| YJpause Workflow Breakpoint | Pauses execution on any data connection, with continue, restart, stop, and timed auto-stop actions |

## Requirements

- ComfyUI
- Python 3.10 or later
- The “open sound folder” and “open model folder” shortcuts are Windows-only; the core features do not depend on these shortcuts

## Installation

1. Download or clone this repository into ComfyUI's `custom_nodes` directory.
2. Restart ComfyUI.

No additional Python package is currently required by this plugin.

## Missing Model Matcher

Use this tool when an imported workflow refers to models whose local names or folder paths differ from yours.

1. Optionally select the nodes to scan. With no selection, the entire workflow is scanned.
2. Right-click an empty area of the canvas and choose “⚡ Select Missing Models”.
3. Review each original model name, candidate, score, reason, and status. Nodes with multiple model widgets are grouped together.
4. Search local model paths inside each candidate picker, change a candidate manually, mark it as “Skip”, or use `HF`, `C`, and `G` to search Hugging Face, Civitai, and Google.
5. Click “Apply Changes”. Only real, writable node widgets that are not marked “Skip” are updated.

Scoring rules:

| Case | Score | Result status |
| --- | ---: | --- |
| Same base name, precision, and parameter size | 100% | Exact |
| Same base name, different precision | 95% | Fuzzy |
| Same base name, different parameter size | 90% | Fuzzy |
| Different base name | Up to 89% | Fuzzy |

Notes:

- A different directory is reported as a reason but does not lower the score by itself.
- Candidates are sorted by score and path relevance, and the first candidate is selected by default.
- When the top candidate scores 100%, “Skip” is enabled by default; clear it if you want to apply the replacement.
- A default selection is not written automatically. The workflow changes only after you click “Apply Changes”.
- Up to eight candidates are shown for each model reference.
- The model index uses ComfyUI's `models` directory, `extra_model_paths.yaml`, and model types registered in `folder_paths`.
- External search buttons use the original model filename and only open search pages; they do not download or install models.

**UNKNOWN Nodes**

Missing custom nodes may appear as `UNKNOWN`. The matcher attempts to recover model filenames that can be identified reliably from serialized `widgets_values` and labels them as “UNKNOWN original value”.

Because an UNKNOWN node has no real writable widget, these rows are read-only and are provided for candidate review and external search. Ambiguous non-model values are skipped to avoid false positives.

## Workflow Completion Sound

1. Open ComfyUI Settings and go to `YJNodes → 工作流完成提示音`.
2. Enable the feature and choose a policy:
   - **队列完成**: play once when the whole queue becomes empty.
   - **每个任务**: play after every completed workflow task.
3. Click “打开音效文件夹” and copy audio files into the plugin's `sounds` directory.
4. Click “刷新音效列表”, select a sound, and adjust the volume.
5. Click “测试当前音效” to preview it.

Supported extensions: `.wav`, `.mp3`, `.ogg`, `.m4a`, `.aac`, `.flac`, and `.webm`. Actual playback depends on the codecs supported by your browser or ComfyUI Desktop.

## Set/Get to Physical Wires

1. Right-click an empty area of the canvas and choose “⚡ Replace Set/Get with Wires”.
2. The plugin pairs Set/Get nodes by variable name and connects the Set input source directly to every downstream target of the matching Get nodes.
3. Choose “Wire Only” to keep the original nodes, “Wire & Delete” to remove matched Set/Get nodes, or “Cancel” to leave the workflow unchanged.

Safety behavior:

- The workflow is not changed when no valid pair is found, names do not match, or a Set has no upstream link.
- If multiple connected Set nodes share a name, the plugin does not guess. Ambiguous variables are skipped while unambiguous pairs can still be converted.
- When subgraphs are detected, deletion is disabled to protect cross-subgraph references.

## Duplicate-Frame Image Batch Concat

Node path: `YJNodes/Image → 去重复帧图像批次合并`

- Connecting `image2` automatically creates the next image input, up to `image20`.
- Inputs are concatenated in numeric order along the batch dimension.
- With “减去重复帧数” set to `N`, `image1` is kept intact and the first `N` frames are removed from every subsequent input before concatenation.
- A subsequent input that becomes empty after trimming is ignored.
- All included images must have the same height, width, and channel count.

> This is deterministic leading-frame trimming. It does not compare frame contents to detect duplicates.

## YJpause Workflow Breakpoint

Node path: `YJNodes/Workflow → YJpause`

YJpause can be inserted into any data connection to pause the current workflow when execution reaches that point. It passes the incoming value through unchanged and automatically adapts its connection type.

Usage:

1. Connect the data line to YJpause's “Value” input, then connect its output to the downstream node.
2. Enable “Pause enabled”. When disabled, the value passes through without pausing.
3. Set “Auto-stop timeout (minutes)” to `0` to wait indefinitely, or use a positive integer to stop the current job when the countdown expires.
4. When execution reaches YJpause, the node is highlighted and displays its pause status, remaining time, and three action buttons.

Actions:

- **Continue**: resume from the breakpoint while preserving the current execution state.
- **Restart**: end the current job and queue the workflow again from the beginning.
- **Stop**: end only the current job without re-queuing it.

If the page is refreshed during a pause, the plugin attempts to restore the active pause state and controls. A workflow may contain multiple YJpause nodes; execution pauses separately at each enabled breakpoint.

## UI Languages

YJpause and the Missing Model Matcher support Chinese and English. They prefer ComfyUI's locale, then fall back to the browser language; non-Chinese environments default to English. The Set/Get resolver is also bilingual but defaults to Chinese when ComfyUI's locale is unavailable. The dynamic concat node and completion-sound settings currently use Chinese labels.

## Known Limitations

- The model matcher must be opened manually from the canvas context menu; it does not pop up automatically when a workflow is imported.
- Model values recovered from UNKNOWN nodes are read-only.
- Resized columns in the matcher dialog are not persisted.
- Set/Get nodes inside workflows containing subgraphs are rewired but cannot be deleted by this tool.

## Development and Tests

Run in Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m pytest -q
node --test tests\js\yj_canvas_menu.test.mjs tests\js\yj_comfy_compat.test.mjs tests\js\yj_dynamic_image_concat_core.test.mjs tests\js\yj_execution_sound_core.test.mjs tests\js\yj_i18n.test.mjs tests\js\yj_model_matcher_core.test.mjs tests\js\yj_model_matcher_extension.test.mjs tests\js\yj_pause_core.test.mjs tests\js\yj_set_get_resolver_core.test.mjs
```

Use the isolated Python environment for Python tests. Node.js is required for the JavaScript test suite.

## License

This project is licensed under the [MIT License](LICENSE).
