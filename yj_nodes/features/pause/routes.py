"""YJpause 的状态查询与控制路由。"""

from __future__ import annotations

from .service import PAUSE_ACTIONS, pause_registry


def is_local_request(request) -> bool:
    """暂停控制仅供 ComfyUI 所在机器使用，不能信任可伪造的请求头。"""
    return request.remote in {None, "127.0.0.1", "::1"}


def validate_action_payload(payload) -> tuple[str, str, str]:
    if not isinstance(payload, dict):
        raise ValueError("Request body must be an object")
    session_id = payload.get("session_id")
    node_id = payload.get("node_id")
    action = payload.get("action")
    if not isinstance(session_id, str) or not session_id:
        raise ValueError("session_id is required")
    if not isinstance(node_id, (str, int)) or str(node_id) == "":
        raise ValueError("node_id is required")
    if action not in PAUSE_ACTIONS:
        raise ValueError("action must be continue, restart, or stop")
    return session_id, str(node_id), action


def register_pause_routes(routes) -> None:
    @routes.get("/yj_nodes/pause/active")
    async def get_active_pauses(request):
        from aiohttp import web

        if not is_local_request(request):
            raise web.HTTPForbidden(text="Pause sessions are only available locally")
        client_id = request.query.get("client_id") or None
        return web.json_response({"sessions": pause_registry.active(client_id)})

    @routes.post("/yj_nodes/pause/action")
    async def post_pause_action(request):
        from aiohttp import web

        if not is_local_request(request):
            raise web.HTTPForbidden(text="Pause actions are only available locally")
        if request.headers.get("X-YJNodes-Request") != "1":
            raise web.HTTPForbidden(text="Missing YJNodes request marker")
        try:
            session_id, node_id, action = validate_action_payload(await request.json())
            session, changed = pause_registry.apply_action(session_id, node_id, action)
        except ValueError as exc:
            raise web.HTTPBadRequest(text=str(exc)) from exc
        if session is None:
            raise web.HTTPNotFound(text="Pause session not found")
        return web.json_response({"ok": True, "changed": changed, "session": session.as_dict()})

