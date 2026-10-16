import sys
from types import SimpleNamespace

from yj_nodes.nodes.dynamic_image_concat import YJDynamicImageBatchConcat


class FakeImageBatch:
    def __init__(self, frame_count, shape=(64, 64, 3)):
        self.frame_count = frame_count
        self.shape = (frame_count, *shape)

    def __len__(self):
        return self.frame_count

    def __getitem__(self, value):
        if not isinstance(value, slice):
            raise TypeError("FakeImageBatch only supports slicing")
        start = value.start or 0
        return FakeImageBatch(max(0, self.frame_count - start), self.shape[1:])


def install_fake_torch(monkeypatch):
    def cat(images, dim=0):
        return {
            "frame_counts": [len(image) for image in images],
            "dim": dim,
        }

    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cat=cat))


def test_zero_duplicate_frames_directly_concats_without_trimming(monkeypatch):
    install_fake_torch(monkeypatch)

    result = YJDynamicImageBatchConcat().concat(
        FakeImageBatch(5),
        **{"remove_duplicate_frames": 0, "image2": FakeImageBatch(5), "image3": FakeImageBatch(3)},
    )

    assert result == ({"frame_counts": [5, 5, 3], "dim": 0},)


def test_positive_duplicate_frames_trims_from_second_batch(monkeypatch):
    install_fake_torch(monkeypatch)

    result = YJDynamicImageBatchConcat().concat(
        FakeImageBatch(5),
        **{"remove_duplicate_frames": 2, "image2": FakeImageBatch(5), "image3": FakeImageBatch(3)},
    )

    assert result == ({"frame_counts": [5, 3, 1], "dim": 0},)


def test_stable_existing_input_key_and_optional_english_alias(monkeypatch):
    install_fake_torch(monkeypatch)
    fields = YJDynamicImageBatchConcat.INPUT_TYPES()["required"]
    assert "减去重复帧数" in fields
    assert "remove_duplicate_frames" not in fields
    result = YJDynamicImageBatchConcat().concat(
        FakeImageBatch(5),
        **{"减去重复帧数": 2, "image2": FakeImageBatch(5)},
    )
    assert result == ({"frame_counts": [5, 3], "dim": 0},)
