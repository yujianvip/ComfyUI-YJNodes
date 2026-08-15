"""ComfyUI 模型目录索引。"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from pathlib import PurePosixPath


NON_MODEL_FOLDER_TYPES = {"configs", "custom_nodes", "datasets", "download_model_base"}
MODEL_INDEX_CACHE_SECONDS = 2.0
_model_index_cache: tuple[float, list[dict[str, str]]] | None = None


def discover_model_types(registry) -> list[str]:
    model_types = []
    for model_type, entry in registry.items():
        if model_type in NON_MODEL_FOLDER_TYPES:
            continue
        try:
            extensions = entry[1]
        except (IndexError, TypeError):
            continue
        model_types.append(str(model_type))
    return sorted(model_types)


def build_model_entries(model_type: str, names: list[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for name in names:
        normalized = str(name).replace("\\", "/")
        extension = PurePosixPath(normalized).suffix.lower()
        entries.append(
            {
                "type": model_type,
                "name": normalized,
                "display_name": f"{model_type}/{normalized}",
                "extension": extension,
            }
        )
    return entries


def filter_models_by_types(
    models: list[dict[str, str]], model_types: list[str] | set[str]
) -> list[dict[str, str]]:
    allowed_types = {str(value) for value in model_types if value}
    if not allowed_types:
        return models
    return [model for model in models if model.get("type") in allowed_types]


def list_available_model_types() -> list[str]:
    try:
        import folder_paths
    except Exception as exc:
        print(f"[ComfyUI-YJNodes] folder_paths unavailable: {exc}")
        return []
    return discover_model_types(folder_paths.folder_names_and_paths)


def list_available_models() -> list[dict[str, str]]:
    global _model_index_cache

    now = time.monotonic()
    if _model_index_cache and now - _model_index_cache[0] < MODEL_INDEX_CACHE_SECONDS:
        return _model_index_cache[1]

    try:
        import folder_paths
    except Exception as exc:
        print(f"[ComfyUI-YJNodes] folder_paths unavailable: {exc}")
        return []

    models: list[dict[str, str]] = []
    for model_type in list_available_model_types():
        try:
            names = folder_paths.get_filename_list(model_type)
        except Exception as exc:
            logging.warning("[ComfyUI-YJNodes] Failed to index model type %s: %s", model_type, exc)
            names = []
        models.extend(build_model_entries(model_type, names))
    _model_index_cache = (now, models)
    return models


def resolve_model_directory(model_type: str, model_name: str = "") -> Path:
    import folder_paths

    if model_type not in discover_model_types(folder_paths.folder_names_and_paths):
        raise ValueError("未知的模型分类")

    if model_name:
        resolved = folder_paths.get_full_path(model_type, model_name.replace("\\", "/"))
        if resolved:
            path = Path(resolved).resolve()
            return path if path.is_dir() else path.parent

    roots = [Path(value).resolve() for value in folder_paths.get_folder_paths(model_type)]
    if not roots:
        raise FileNotFoundError(model_type)
    return next((path for path in roots if path.exists()), roots[0])


def open_model_directory(model_type: str, model_name: str = "") -> Path:
    if os.name != "nt":
        raise RuntimeError("打开模型目录功能目前仅支持 Windows")
    directory = resolve_model_directory(model_type, model_name)
    directory.mkdir(parents=True, exist_ok=True)
    os.startfile(str(directory))  # type: ignore[attr-defined]
    return directory
