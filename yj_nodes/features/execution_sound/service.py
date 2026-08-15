"""提示音文件的查询、解析和本机目录操作。"""

from __future__ import annotations

import os
from pathlib import Path


SOUND_EXTENSIONS = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".webm"}
SOUNDS_DIRECTORY = Path(__file__).resolve().parents[3] / "sounds"


def list_sound_files(directory: Path = SOUNDS_DIRECTORY) -> list[str]:
    directory.mkdir(parents=True, exist_ok=True)
    return sorted(
        (
            path.name
            for path in directory.iterdir()
            if path.is_file() and path.suffix.lower() in SOUND_EXTENSIONS
        ),
        key=str.casefold,
    )


def resolve_sound_file(name: str, directory: Path = SOUNDS_DIRECTORY) -> Path:
    if not isinstance(name, str) or not name or Path(name).name != name:
        raise ValueError("无效的音效文件名")
    if Path(name).suffix.lower() not in SOUND_EXTENSIONS:
        raise ValueError("不支持的音效文件格式")

    directory = directory.resolve()
    candidate = (directory / name).resolve()
    if candidate.parent != directory or not candidate.is_file():
        raise FileNotFoundError(name)
    return candidate


def open_sounds_directory(directory: Path = SOUNDS_DIRECTORY) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        raise RuntimeError("打开音效文件夹功能目前仅支持 Windows")
    os.startfile(str(directory))  # type: ignore[attr-defined]
