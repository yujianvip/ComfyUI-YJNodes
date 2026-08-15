from pathlib import Path


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
    }

    for filename, expected_prefix in entrypoints.items():
        source = (WEB_JS_DIRECTORY / filename).read_text(encoding="utf-8")
        assert f'from "{expected_prefix}' in source
