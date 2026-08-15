"""模型匹配功能的 HTTP 路由。"""

from __future__ import annotations


MAX_MATCH_REFERENCES = 500


def validate_match_payload(payload) -> list[dict]:
    if not isinstance(payload, dict):
        raise ValueError("请求体必须是 JSON 对象")
    references = payload.get("references", [])
    if not isinstance(references, list):
        raise ValueError("references 必须是数组")
    if len(references) > MAX_MATCH_REFERENCES:
        raise ValueError(f"references 不能超过 {MAX_MATCH_REFERENCES} 项")

    for index, reference in enumerate(references):
        if not isinstance(reference, dict):
            raise ValueError(f"references[{index}] 必须是对象")
        if not isinstance(reference.get("value", ""), str):
            raise ValueError(f"references[{index}].value 必须是字符串")
        model_types = reference.get("model_types", [])
        if not isinstance(model_types, list) or not all(
            isinstance(value, str) for value in model_types
        ):
            raise ValueError(f"references[{index}].model_types 必须是字符串数组")
    return references


def _list_available_models():
    try:
        from .model_index import list_available_models
    except ModuleNotFoundError as exc:
        if exc.name and exc.name.endswith("model_index"):
            return []
        raise
    return list_available_models()


def _list_available_model_types():
    from .model_index import list_available_model_types

    return list_available_model_types()


def _score_candidates(original: str, models):
    try:
        from .scoring import score_candidates
    except ModuleNotFoundError as exc:
        if exc.name and exc.name.endswith("scoring"):
            return []
        raise
    return score_candidates(original, models)


def _filter_models_by_types(models, model_types):
    from .model_index import filter_models_by_types

    return filter_models_by_types(models, model_types)


def _open_model_directory(model_type: str, model_name: str = ""):
    from .model_index import open_model_directory

    return open_model_directory(model_type, model_name)


def _require_local_action(request) -> None:
    from aiohttp import web

    if request.remote not in {None, "127.0.0.1", "::1"}:
        raise web.HTTPForbidden(text="只能从运行 ComfyUI 的本机执行此操作")
    if request.headers.get("X-YJNodes-Request") != "1":
        raise web.HTTPForbidden(text="缺少 YJNodes 本机操作标识")


def register_model_matcher_routes(routes) -> None:
    @routes.get("/yj_nodes/model_matcher/models")
    async def get_models(request):
        from aiohttp import web

        return web.json_response(
            {
                "models": _list_available_models(),
                "model_types": _list_available_model_types(),
            }
        )

    @routes.post("/yj_nodes/model_matcher/match")
    async def match_models(request):
        from aiohttp import web

        try:
            payload = await request.json()
            references = validate_match_payload(payload)
        except (ValueError, TypeError) as exc:
            raise web.HTTPBadRequest(text=str(exc)) from exc
        models = _list_available_models()
        results = []
        for reference in references:
            original = str(reference.get("value", ""))
            eligible_models = _filter_models_by_types(models, reference.get("model_types", []))
            candidates = _score_candidates(original, eligible_models)
            results.append({**reference, "candidates": [item.to_dict() for item in candidates]})
        return web.json_response({"results": results})

    @routes.post("/yj_nodes/model_matcher/open_folder")
    async def open_model_folder(request):
        from aiohttp import web

        _require_local_action(request)
        try:
            payload = await request.json()
            model_type = payload.get("model_type", "")
            model_name = payload.get("model_name", "")
            if not isinstance(model_type, str) or not model_type:
                raise ValueError("model_type 必须是非空字符串")
            if not isinstance(model_name, str):
                raise ValueError("model_name 必须是字符串")
            directory = _open_model_directory(model_type, model_name)
        except (ValueError, TypeError) as exc:
            raise web.HTTPBadRequest(text=str(exc)) from exc
        except FileNotFoundError as exc:
            raise web.HTTPNotFound(text="模型目录不存在") from exc
        except RuntimeError as exc:
            raise web.HTTPNotImplemented(text=str(exc)) from exc
        return web.json_response({"ok": True, "path": str(directory)})
