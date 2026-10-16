"""模型候选评分。"""

from __future__ import annotations

from dataclasses import dataclass, replace
from difflib import SequenceMatcher
from pathlib import PurePosixPath
from typing import Any

from .normalize import normalize_model_name


@dataclass(frozen=True)
class MatchCandidate:
    type: str
    name: str
    display_name: str
    score: int
    reasons: list[str]
    auto_select: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "name": self.name,
            "display_name": self.display_name,
            "score": self.score,
            "reasons": self.reasons,
            "auto_select": self.auto_select,
        }


def _directory(value: str) -> str:
    normalized = value.replace("\\", "/")
    parent = str(PurePosixPath(normalized).parent)
    return "" if parent == "." else parent


def _normalized_path(value: str) -> str:
    return value.strip().replace("\\", "/").casefold()


def _similarity(left: str, right: str) -> int:
    if not left or not right:
        return 0
    return int(round(SequenceMatcher(None, left, right).ratio() * 89))


def _score_one(original: str, model: dict[str, Any]) -> MatchCandidate:
    model_name = str(model.get("name", ""))
    original_norm = normalize_model_name(original)
    model_norm = normalize_model_name(model_name)
    reasons: list[str] = []

    if original_norm.base == model_norm.base and original_norm.base:
        reasons.append("same_base_name")
        score = 100

        if _directory(original) != _directory(model_name):
            reasons.append("different_directory")
            score = min(score, 99)

        if original_norm.precisions != model_norm.precisions:
            reasons.append("different_precision")
            score = min(score, 95)

        if original_norm.params != model_norm.params:
            reasons.append("different_params")
            score = min(score, 95)
    else:
        score = _similarity(original_norm.base, model_norm.base)
        reasons.append("similar_name")

    return MatchCandidate(
        type=str(model.get("type", "")),
        name=model_name,
        display_name=str(model.get("display_name", model_name)),
        score=score,
        reasons=reasons,
        auto_select=score >= 90,
    )


def score_candidates(original: str, models: list[dict[str, Any]], limit: int = 8) -> list[MatchCandidate]:
    candidates = [_score_one(original, model) for model in models]
    original_path = _normalized_path(original)
    original_directory = _directory(original).casefold()
    original_norm = normalize_model_name(original)

    def priority(item: MatchCandidate) -> tuple:
        normalized = normalize_model_name(item.name)
        name_similarity = (
            SequenceMatcher(None, original_norm.base, normalized.base).ratio()
            if original_norm.base and normalized.base else 0
        )
        return (
            name_similarity,
            normalized.params == original_norm.params,
            normalized.precisions == original_norm.precisions,
            item.score,
            _normalized_path(item.name) == original_path,
            _directory(item.name).casefold() == original_directory,
        )

    candidates.sort(
        key=lambda item: (*priority(item), item.name.casefold()),
        reverse=True,
    )
    candidates = candidates[:limit]

    # 并列第一无法可靠消歧，禁止自动替换，交给用户明确选择。
    top_has_exact_path = bool(candidates) and _normalized_path(candidates[0].name) == original_path
    second_has_exact_path = (
        len(candidates) > 1 and _normalized_path(candidates[1].name) == original_path
    )
    unresolved_best_tie = (
        len(candidates) > 1
        and priority(candidates[0]) == priority(candidates[1])
        and not (top_has_exact_path and not second_has_exact_path)
    )
    if unresolved_best_tie:
        best_priority = priority(candidates[0])
        candidates = [
            replace(item, auto_select=False) if priority(item) == best_priority else item
            for item in candidates
        ]
    return candidates
