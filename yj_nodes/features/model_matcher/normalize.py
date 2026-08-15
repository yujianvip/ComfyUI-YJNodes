"""模型名称规范化。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath, PureWindowsPath


PRECISION_RE = re.compile(r"(?i)\b(fp8|fp16|fp32|bf16|e4m3|e5m2)\b")
PARAM_RE = re.compile(r"(?i)\b(\d+(?:\.\d+)?b)\b")
SEPARATOR_RE = re.compile(r"[-_.\s]+")


@dataclass(frozen=True)
class NormalizedModelName:
    original: str
    filename: str
    stem: str
    base: str
    precisions: set[str]
    params: set[str]
    extension: str


def _filename(value: str) -> str:
    normalized = value.replace("\\", "/")
    return PurePosixPath(normalized).name or PureWindowsPath(value).name


def normalize_model_name(value: str) -> NormalizedModelName:
    filename = _filename(value.strip())
    path = PurePosixPath(filename)
    extension = path.suffix.lower()
    stem = filename[: -len(extension)] if extension else filename

    token_text = SEPARATOR_RE.sub(" ", stem).strip().lower()
    precisions = {match.group(1).lower() for match in PRECISION_RE.finditer(token_text)}
    params = {match.group(1).lower() for match in PARAM_RE.finditer(token_text)}

    base = PRECISION_RE.sub(" ", token_text)
    base = PARAM_RE.sub(" ", base)
    base = SEPARATOR_RE.sub(" ", base).strip()

    return NormalizedModelName(
        original=value,
        filename=filename,
        stem=stem,
        base=base,
        precisions=precisions,
        params=params,
        extension=extension,
    )
