import math
import importlib.util
from pathlib import Path
import sys
import threading
import time

import pytest

from yj_nodes.features.pause.routes import validate_action_payload
from yj_nodes.features.pause.service import PauseRegistry, PauseSession
from yj_nodes.nodes import pause as pause_module
from yj_nodes.nodes.pause import ANY_TYPE, YJPause


def test_plugin_entrypoint_registers_yjpause(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    package_name = "comfyui_yjnodes_registration_test"
    spec = importlib.util.spec_from_file_location(
        package_name,
        root / "__init__.py",
        submodule_search_locations=[str(root)],
    )
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, package_name, module)

    spec.loader.exec_module(module)

    assert module.NODE_CLASS_MAPPINGS["YJpause"].__name__ == "YJPause"
    assert module.NODE_DISPLAY_NAME_MAPPINGS["YJpause"] == "YJpause"


def test_pause_node_schema_uses_stable_internal_keys():
    inputs = YJPause.INPUT_TYPES()

    assert list(inputs["required"]) == ["value", "enabled", "timeout_minutes"]
    assert inputs["required"]["timeout_minutes"][1]["default"] == 0
    assert inputs["required"]["timeout_minutes"][1]["min"] == 0
    assert inputs["hidden"] == {"unique_id": "UNIQUE_ID"}
    assert (ANY_TYPE != "IMAGE") is False


def test_disabled_pause_directly_returns_the_original_object():
    value = object()

    assert YJPause().pause(value, enabled=False, timeout_minutes=5) == (value,)
    assert YJPause.IS_CHANGED(enabled=False) is False
    assert math.isnan(YJPause.IS_CHANGED(enabled=True))


def test_pause_registry_only_accepts_the_first_terminal_action():
    registry = PauseRegistry()
    session, created = registry.get_or_create("prompt", "7", 0, "client")

    assert created is True
    assert session.apply_action("continue") is True
    assert session.apply_action("stop") is False
    assert session.state == "continued"


def test_timeout_zero_never_expires_and_positive_timeout_uses_monotonic_deadline():
    unlimited = PauseSession("prompt", "1", 0, started_at=10)
    timed = PauseSession("prompt", "2", 1, started_at=10)

    assert unlimited.remaining_seconds(now=100000) is None
    assert unlimited.expire_if_due(now=100000) is False
    assert timed.remaining_seconds(now=69.2) == 1
    assert timed.expire_if_due(now=70) is True
    assert timed.state == "timed_out"


def test_enabled_pause_waits_until_continue(monkeypatch):
    registry = PauseRegistry()
    monkeypatch.setattr(pause_module, "pause_registry", registry)
    monkeypatch.setattr(pause_module, "_runtime_context", lambda: ("prompt-1", "client-1", None))
    monkeypatch.setattr(pause_module, "_check_global_interrupt", lambda: None)
    result = []
    value = object()

    worker = threading.Thread(
        target=lambda: result.append(YJPause().pause(value, True, 0, "12")),
        daemon=True,
    )
    worker.start()
    for _ in range(100):
        active = registry.active()
        if active:
            break
        time.sleep(0.01)
    else:
        pytest.fail("YJpause did not enter paused state")

    session = active[0]
    _, changed = registry.apply_action(session["session_id"], "12", "continue")
    worker.join(timeout=2)

    assert changed is True
    assert worker.is_alive() is False
    assert result == [(value,)]


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({"session_id": "abc", "node_id": 5, "action": "continue"}, ("abc", "5", "continue")),
        ({"session_id": "abc", "node_id": "5", "action": "restart"}, ("abc", "5", "restart")),
        ({"session_id": "abc", "node_id": "5", "action": "stop"}, ("abc", "5", "stop")),
    ],
)
def test_validate_pause_action_payload(payload, expected):
    assert validate_action_payload(payload) == expected


@pytest.mark.parametrize(
    "payload",
    [None, {}, {"session_id": "abc", "node_id": "5", "action": "invalid"}],
)
def test_validate_pause_action_payload_rejects_invalid_values(payload):
    with pytest.raises(ValueError):
        validate_action_payload(payload)
