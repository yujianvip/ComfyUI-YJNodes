from pathlib import Path

import pytest

from yj_nodes.features.execution_sound.service import list_sound_files, resolve_sound_file
from yj_nodes.features.model_matcher.routes import (
    MAX_MATCH_REFERENCES,
    validate_match_payload,
)


def test_validate_match_payload_accepts_well_formed_references():
    references = [{"value": "missing.safetensors", "model_types": ["checkpoints"]}]

    assert validate_match_payload({"references": references}) is references


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {"references": "not-a-list"},
        {"references": [None]},
        {"references": [{"value": 123, "model_types": []}]},
        {"references": [{"value": "model", "model_types": "checkpoints"}]},
        {"references": [{}] * (MAX_MATCH_REFERENCES + 1)},
    ],
)
def test_validate_match_payload_rejects_invalid_requests(payload):
    with pytest.raises(ValueError):
        validate_match_payload(payload)


def test_list_sound_files_filters_and_sorts_supported_audio(tmp_path: Path):
    for name in ["z.WAV", "a.mp3", "note.txt", "folder.ogg"]:
        (tmp_path / name).write_bytes(b"test")
    (tmp_path / "nested.mp3").mkdir()

    assert list_sound_files(tmp_path) == ["a.mp3", "folder.ogg", "z.WAV"]


def test_resolve_sound_file_accepts_existing_audio(tmp_path: Path):
    sound = tmp_path / "完成提示.wav"
    sound.write_bytes(b"test")

    assert resolve_sound_file(sound.name, tmp_path) == sound.resolve()


@pytest.mark.parametrize("name", ["", "../secret.mp3", "folder/sound.mp3", "note.txt"])
def test_resolve_sound_file_rejects_unsafe_or_unsupported_names(tmp_path: Path, name: str):
    with pytest.raises(ValueError):
        resolve_sound_file(name, tmp_path)


def test_resolve_sound_file_rejects_missing_audio(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        resolve_sound_file("missing.mp3", tmp_path)
