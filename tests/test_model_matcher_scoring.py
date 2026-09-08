from yj_nodes.features.model_matcher.normalize import normalize_model_name
from yj_nodes.features.model_matcher.model_index import (
    build_model_entries,
    discover_model_types,
    filter_models_by_types,
    resolve_model_directory,
)
from yj_nodes.features.model_matcher.scoring import score_candidates


def test_normalize_removes_directory_extension_precision_and_params():
    result = normalize_model_name("diffusion_models/Qwen-Image-Edit-2509_fp8_e4m3_7B.safetensors")

    assert result.base == "qwen image edit 2509"
    assert result.precisions == {"fp8", "e4m3"}
    assert result.params == {"7b"}
    assert result.extension == ".safetensors"


def test_normalize_keeps_plain_model_subject():
    result = normalize_model_name("anything-v5.safetensors")

    assert result.base == "anything v5"
    assert result.precisions == set()
    assert result.params == set()


def test_same_base_name_in_different_directory_scores_99():
    models = [{"type": "vae", "name": "vae/qwen_image_vae.safetensors", "display_name": "vae/qwen_image_vae.safetensors"}]

    [candidate] = score_candidates("other_dir/qwen_image_vae.safetensors", models)

    assert candidate.score == 99
    assert candidate.auto_select is True
    assert "same_base_name" in candidate.reasons
    assert "different_directory" in candidate.reasons


def test_exact_path_wins_over_same_filename_in_another_directory():
    models = [
        {"type": "checkpoints", "name": "A/foo.safetensors"},
        {"type": "checkpoints", "name": "Z/foo.safetensors"},
    ]

    candidates = score_candidates("A/foo.safetensors", models)

    assert candidates[0].name == "A/foo.safetensors"
    assert candidates[0].score == 100
    assert candidates[0].auto_select is True


def test_equal_best_candidates_are_not_auto_selected():
    models = [
        {"type": "checkpoints", "name": "A/foo.safetensors"},
        {"type": "checkpoints", "name": "Z/foo.safetensors"},
    ]

    candidates = score_candidates("missing/foo.safetensors", models)

    assert candidates[0].score == candidates[1].score == 99
    assert candidates[0].auto_select is False
    assert candidates[1].auto_select is False


def test_precision_difference_scores_95_and_auto_selects():
    models = [{"type": "unet", "name": "Qwen-Image-Edit-fp16.safetensors", "display_name": "Qwen-Image-Edit-fp16.safetensors"}]

    [candidate] = score_candidates("Qwen-Image-Edit-fp8.safetensors", models)

    assert candidate.score == 95
    assert candidate.auto_select is True
    assert "different_precision" in candidate.reasons


def test_parameter_difference_scores_95_and_auto_selects():
    models = [{"type": "clip", "name": "qwen_2.5_vl_14b.safetensors", "display_name": "qwen_2.5_vl_14b.safetensors"}]

    [candidate] = score_candidates("qwen_2.5_vl_7b.safetensors", models)

    assert candidate.score == 95
    assert candidate.auto_select is True
    assert "different_params" in candidate.reasons


def test_similar_name_below_90_is_not_auto_selected():
    models = [{"type": "checkpoint", "name": "anything-v5.safetensors", "display_name": "anything-v5.safetensors"}]

    [candidate] = score_candidates("qwen_image_vae.safetensors", models)

    assert candidate.score < 90
    assert candidate.auto_select is False
    assert "similar_name" in candidate.reasons


def test_candidates_are_sorted_by_score_descending():
    models = [
        {"type": "checkpoint", "name": "anything-v5.safetensors", "display_name": "anything-v5.safetensors"},
        {"type": "vae", "name": "qwen_image_vae.safetensors", "display_name": "qwen_image_vae.safetensors"},
    ]

    candidates = score_candidates("qwen_image_vae.safetensors", models)

    assert candidates[0].name == "qwen_image_vae.safetensors"
    assert candidates[0].score == 100


def test_build_model_entries_keeps_type_name_and_display_name():
    entries = build_model_entries("checkpoints", ["realistic/anything-v5.safetensors"])

    assert entries == [
        {
            "type": "checkpoints",
            "name": "realistic/anything-v5.safetensors",
            "display_name": "checkpoints/realistic/anything-v5.safetensors",
            "extension": ".safetensors",
        }
    ]


def test_build_model_entries_preserves_windows_subfolder_separator():
    entries = build_model_entries("text_encoders", [r"Qwen\clip-fp8.safetensors"])

    assert entries[0]["name"] == r"Qwen\clip-fp8.safetensors"
    assert entries[0]["display_name"] == r"text_encoders/Qwen\clip-fp8.safetensors"
    assert entries[0]["extension"] == ".safetensors"


def test_filter_models_by_types_limits_candidates_to_dropdown_folder():
    models = [
        {"type": "checkpoints", "name": "shared.safetensors"},
        {"type": "vae", "name": "shared.safetensors"},
    ]

    filtered = filter_models_by_types(models, ["vae"])

    assert filtered == [{"type": "vae", "name": "shared.safetensors"}]


def test_discover_model_types_uses_dynamic_registry_and_skips_non_model_folders():
    registry = {
        "checkpoints": (["models/checkpoints"], {".safetensors"}),
        "audio_encoders": (["models/audio_encoders"], {".safetensors"}),
        "third_party_video": (["models/third_party_video"], {".gguf"}),
        "third_party_any": (["models/third_party_any"], set()),
        "diffusers": (["models/diffusers"], {"folder"}),
        "configs": (["models/configs"], {".yaml"}),
        "custom_nodes": (["custom_nodes"], set()),
    }

    assert discover_model_types(registry) == [
        "audio_encoders",
        "checkpoints",
        "diffusers",
        "third_party_any",
        "third_party_video",
    ]


def test_resolve_model_directory_uses_selected_model_parent(monkeypatch, tmp_path):
    model_root = tmp_path / "models" / "checkpoints"
    model_file = model_root / "nested" / "model.safetensors"
    model_file.parent.mkdir(parents=True)
    model_file.write_bytes(b"model")

    class FakeFolderPaths:
        folder_names_and_paths = {"checkpoints": ([str(model_root)], {".safetensors"})}

        @staticmethod
        def get_full_path(model_type, model_name):
            assert model_type == "checkpoints"
            return str(model_root / model_name)

        @staticmethod
        def get_folder_paths(model_type):
            return [str(model_root)]

    monkeypatch.setitem(__import__("sys").modules, "folder_paths", FakeFolderPaths)

    assert resolve_model_directory("checkpoints", "nested/model.safetensors") == model_file.parent
