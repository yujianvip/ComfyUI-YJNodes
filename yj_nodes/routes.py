"""各功能路由的统一注册入口。"""

from __future__ import annotations

from .features.execution_sound.routes import register_execution_sound_routes
from .features.model_matcher.routes import register_model_matcher_routes

_ROUTES_REGISTERED_ATTRIBUTE = "_comfyui_yjnodes_routes_registered"


def register_routes() -> None:
    try:
        from server import PromptServer
    except Exception as exc:
        import traceback

        print(f"[ComfyUI-YJNodes] PromptServer unavailable: {exc}")
        traceback.print_exc()
        return

    routes = PromptServer.instance.routes
    if getattr(routes, _ROUTES_REGISTERED_ATTRIBUTE, False):
        return
    register_model_matcher_routes(routes)
    register_execution_sound_routes(routes)
    setattr(routes, _ROUTES_REGISTERED_ATTRIBUTE, True)
