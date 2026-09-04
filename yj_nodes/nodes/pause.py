"""可插入任意数据连线的 YJpause 工作流断点节点。"""

from __future__ import annotations

import math

from ..features.pause.service import pause_registry


class AnyType(str):
    """Legacy 节点架构中的宽类型回退；前端会同步为实际连线类型。"""

    def __ne__(self, _value: object) -> bool:
        return False


ANY_TYPE = AnyType("*")


def _runtime_context() -> tuple[str, str | None, object | None]:
    try:
        from server import PromptServer

        server = PromptServer.instance
        return str(getattr(server, "last_prompt_id", "unknown")), getattr(server, "client_id", None), server
    except Exception:
        return "unknown", None, None


def _send_state(server, session) -> None:
    if server is None:
        return
    try:
        server.send_sync("yj_pause_state", session.as_dict(), session.client_id)
    except Exception as exc:
        print(f"[ComfyUI-YJNodes] Failed to send YJpause state: {exc}")


def _check_global_interrupt() -> None:
    try:
        import nodes

        nodes.before_node_execution()
    except ImportError:
        return


def _raise_interrupted() -> None:
    try:
        import comfy.model_management

        raise comfy.model_management.InterruptProcessingException()
    except ImportError as exc:
        raise RuntimeError("YJpause stopped the current job") from exc


class YJPause:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": (ANY_TYPE, {"forceInput": True}),
                "enabled": (
                    "BOOLEAN",
                    {"default": True, "label_on": "ON", "label_off": "OFF"},
                ),
                "timeout_minutes": (
                    "INT",
                    {"default": 0, "min": 0, "max": 525600, "step": 1, "display": "number"},
                ),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = (ANY_TYPE,)
    RETURN_NAMES = ("value",)
    FUNCTION = "pause"
    CATEGORY = "YJNodes/Workflow"
    DESCRIPTION = "Pause the current workflow at this point when enabled."

    @classmethod
    def IS_CHANGED(cls, value=None, enabled=True, timeout_minutes=0, **_kwargs):
        return math.nan if enabled else False

    def pause(self, value, enabled=True, timeout_minutes=0, unique_id="unknown"):
        if not enabled:
            return (value,)

        prompt_id, client_id, server = _runtime_context()
        session, created = pause_registry.get_or_create(
            prompt_id=prompt_id,
            node_id=str(unique_id),
            timeout_minutes=max(0, int(timeout_minutes)),
            client_id=client_id,
        )
        if created:
            _send_state(server, session)

        try:
            while session.state == "paused":
                if session.expire_if_due():
                    break
                _check_global_interrupt()
                wait_seconds = 0.25
                remaining = session.remaining_seconds()
                if remaining is not None:
                    wait_seconds = min(wait_seconds, max(0.01, remaining))
                session.wait_once(wait_seconds)
        except BaseException:
            session.mark_interrupted()
            _send_state(server, session)
            raise

        _send_state(server, session)
        if session.state == "continued":
            return (value,)
        _raise_interrupted()


NODE_CLASS_MAPPINGS = {"YJpause": YJPause}
NODE_DISPLAY_NAME_MAPPINGS = {"YJpause": "YJpause"}

