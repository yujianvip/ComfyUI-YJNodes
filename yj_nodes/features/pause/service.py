"""YJpause 的线程安全暂停会话状态机。"""

from __future__ import annotations

from dataclasses import dataclass, field
import threading
import time
import uuid


PAUSE_ACTIONS = frozenset({"continue", "restart", "stop"})
TERMINAL_STATES = frozenset({"continued", "restarting", "stopped", "timed_out", "interrupted"})
_ACTION_STATES = {
    "continue": "continued",
    "restart": "restarting",
    "stop": "stopped",
}


@dataclass
class PauseSession:
    prompt_id: str
    node_id: str
    timeout_minutes: int
    client_id: str | None = None
    session_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    started_at: float = field(default_factory=time.monotonic)
    started_at_unix_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    state: str = "paused"
    _condition: threading.Condition = field(default_factory=threading.Condition, repr=False)

    @property
    def deadline(self) -> float | None:
        if self.timeout_minutes <= 0:
            return None
        return self.started_at + self.timeout_minutes * 60

    def remaining_seconds(self, now: float | None = None) -> int | None:
        deadline = self.deadline
        if deadline is None:
            return None
        current = time.monotonic() if now is None else now
        return max(0, int(deadline - current + 0.999))

    def apply_action(self, action: str) -> bool:
        if action not in PAUSE_ACTIONS:
            raise ValueError(f"Unsupported pause action: {action}")
        with self._condition:
            if self.state != "paused":
                return False
            self.state = _ACTION_STATES[action]
            self._condition.notify_all()
            return True

    def expire_if_due(self, now: float | None = None) -> bool:
        deadline = self.deadline
        if deadline is None:
            return False
        current = time.monotonic() if now is None else now
        with self._condition:
            if self.state != "paused" or current < deadline:
                return False
            self.state = "timed_out"
            self._condition.notify_all()
            return True

    def mark_interrupted(self) -> bool:
        with self._condition:
            if self.state != "paused":
                return False
            self.state = "interrupted"
            self._condition.notify_all()
            return True

    def wait_once(self, seconds: float) -> str:
        with self._condition:
            if self.state == "paused":
                self._condition.wait(seconds)
            return self.state

    def as_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "prompt_id": self.prompt_id,
            "node_id": self.node_id,
            "client_id": self.client_id,
            "state": self.state,
            "timeout_minutes": self.timeout_minutes,
            "remaining_seconds": self.remaining_seconds(),
            "started_at_unix_ms": self.started_at_unix_ms,
        }


class PauseRegistry:
    """保存当前与近期暂停会话，同一 prompt/node 的列表映射只暂停一次。"""

    def __init__(self, terminal_ttl_seconds: int = 600):
        self._sessions: dict[tuple[str, str], PauseSession] = {}
        self._lock = threading.Lock()
        self._terminal_ttl_seconds = terminal_ttl_seconds

    def get_or_create(
        self,
        prompt_id: str,
        node_id: str,
        timeout_minutes: int,
        client_id: str | None = None,
    ) -> tuple[PauseSession, bool]:
        key = (str(prompt_id), str(node_id))
        with self._lock:
            self._prune_locked()
            existing = self._sessions.get(key)
            if existing is not None:
                return existing, False
            session = PauseSession(
                prompt_id=key[0],
                node_id=key[1],
                timeout_minutes=max(0, int(timeout_minutes)),
                client_id=None if client_id is None else str(client_id),
            )
            self._sessions[key] = session
            return session, True

    def active(self, client_id: str | None = None) -> list[dict]:
        with self._lock:
            self._prune_locked()
            sessions = list(self._sessions.values())
        return [
            session.as_dict()
            for session in sessions
            if session.state == "paused"
            and (client_id is None or session.client_id in {None, client_id})
        ]

    def apply_action(self, session_id: str, node_id: str, action: str) -> tuple[PauseSession | None, bool]:
        if action not in PAUSE_ACTIONS:
            raise ValueError(f"Unsupported pause action: {action}")
        with self._lock:
            session = next(
                (
                    item
                    for item in self._sessions.values()
                    if item.session_id == session_id and item.node_id == str(node_id)
                ),
                None,
            )
        if session is None:
            return None, False
        return session, session.apply_action(action)

    def clear(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            session.mark_interrupted()

    def _prune_locked(self) -> None:
        cutoff = time.monotonic() - self._terminal_ttl_seconds
        stale = [
            key
            for key, session in self._sessions.items()
            if session.state in TERMINAL_STATES and session.started_at < cutoff
        ]
        for key in stale:
            del self._sessions[key]


pause_registry = PauseRegistry()

