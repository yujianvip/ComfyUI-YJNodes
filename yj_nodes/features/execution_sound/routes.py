"""提示音功能的 HTTP 路由。"""

from __future__ import annotations

from .service import (
    SOUNDS_DIRECTORY,
    list_sound_files,
    open_sounds_directory,
    resolve_sound_file,
)


def _require_local_action(request) -> None:
    from aiohttp import web

    if request.remote not in {None, "127.0.0.1", "::1"}:
        raise web.HTTPForbidden(text="只能从运行 ComfyUI 的本机执行此操作")
    if request.headers.get("X-YJNodes-Request") != "1":
        raise web.HTTPForbidden(text="缺少 YJNodes 本机操作标识")


def register_execution_sound_routes(routes) -> None:
    @routes.get("/yj_nodes/execution_sound/sounds")
    async def get_execution_sounds(request):
        from aiohttp import web

        return web.json_response({"sounds": list_sound_files()})

    @routes.get("/yj_nodes/execution_sound/file/{name}")
    async def get_execution_sound_file(request):
        from aiohttp import web

        try:
            path = resolve_sound_file(request.match_info["name"])
        except ValueError as exc:
            raise web.HTTPBadRequest(text=str(exc)) from exc
        except FileNotFoundError as exc:
            raise web.HTTPNotFound(text="音效文件不存在") from exc
        return web.FileResponse(path)

    @routes.post("/yj_nodes/execution_sound/open_folder")
    async def open_execution_sound_folder(request):
        from aiohttp import web

        _require_local_action(request)
        try:
            open_sounds_directory()
        except RuntimeError as exc:
            raise web.HTTPNotImplemented(text=str(exc)) from exc
        return web.json_response({"ok": True, "path": str(SOUNDS_DIRECTORY)})
