from pathlib import Path
import re
import json


WEB_JS_DIRECTORY = Path(__file__).resolve().parents[1] / "web" / "js"
PYTHON_PACKAGE_DIRECTORY = Path(__file__).resolve().parents[1] / "yj_nodes"


def test_source_files_are_grouped_by_domain():
    assert list(WEB_JS_DIRECTORY.glob("*.js")) == []
    assert {
        path.name for path in PYTHON_PACKAGE_DIRECTORY.glob("*.py")
    } == {"__init__.py", "routes.py"}


def test_comfyui_script_imports_account_for_js_subdirectory():
    entrypoints = {
        "nodes/dynamic_image_concat.js": '../../../../scripts/',
        "features/execution_sound/extension.js": '../../../../../scripts/',
        "features/model_matcher/extension.js": '../../../../../scripts/',
        "features/set_get_resolver/extension.js": '../../../../../scripts/',
        "features/workflow_layout/extension.js": '../../../../../scripts/',
        "shared/canvas_menu.js": '../../../../scripts/',
    }

    for filename, expected_prefix in entrypoints.items():
        source = (WEB_JS_DIRECTORY / filename).read_text(encoding="utf-8")
        assert f'from "{expected_prefix}' in source


def test_all_local_frontend_imports_resolve():
    pattern = re.compile(r'\bfrom\s+["\'](\.[^"\']+)["\']')
    for path in WEB_JS_DIRECTORY.rglob("*.js"):
        source = path.read_text(encoding="utf-8")
        for relative in pattern.findall(source):
            target = (path.parent / relative).resolve()
            if not target.is_relative_to(WEB_JS_DIRECTORY):
                continue  # ComfyUI 自带的 /scripts 模块由宿主提供。
            assert target.is_file(), f"{path}: {relative} does not exist"


def test_nodes_2_entrypoints_do_not_patch_global_litegraph_prototypes():
    for relative in ("shared/canvas_menu.js", "nodes/dynamic_image_concat.js"):
        source = (WEB_JS_DIRECTORY / relative).read_text(encoding="utf-8")
        assert ".prototype" not in source
    for relative in ("features/model_matcher/extension.js", "features/set_get_resolver/extension.js", "features/workflow_layout/extension.js"):
        source = (WEB_JS_DIRECTORY / relative).read_text(encoding="utf-8")
        assert "LGraphCanvas" not in source


def test_node_locales_cover_dynamic_concat():
    root = WEB_JS_DIRECTORY.parents[1]
    for language in ("zh", "en"):
        definitions = json.loads((root / "locales" / language / "nodeDefs.json").read_text(encoding="utf-8"))
        assert definitions["YJDynamicImageBatchConcat"]["inputs"]["减去重复帧数"]["name"]
