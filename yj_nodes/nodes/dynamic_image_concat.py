"""动态图片批次拼接节点。"""

MAX_IMAGE_INPUTS = 20


class YJDynamicImageBatchConcat:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image1": ("IMAGE",),
                "减去重复帧数": (
                    "INT",
                    {
                        "default": 0,
                        "min": 0,
                        "max": 9999,
                        "step": 1,
                        "display": "number",
                    },
                ),
            },
            "optional": {
                "image2": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "concat"
    CATEGORY = "YJNodes/Image"

    @classmethod
    def VALIDATE_INPUTS(cls, input_types, **kwargs):
        for input_name, input_type in input_types.items():
            if input_name.startswith("image") and input_name[5:].isdigit():
                index = int(input_name[5:])
                if 1 <= index <= MAX_IMAGE_INPUTS and input_type == "IMAGE":
                    continue
            if input_name in {"减去重复帧数", "remove_duplicate_frames"}:
                continue
            return f"Unsupported input: {input_name}"
        return True

    def concat(self, image1, **kwargs):
        remove_duplicate_frames = int(kwargs.get("减去重复帧数", kwargs.get("remove_duplicate_frames", 0)))
        images = [("image1", image1)]
        for index in range(2, MAX_IMAGE_INPUTS + 1):
            image = kwargs.get(f"image{index}")
            if image is not None:
                images.append((f"image{index}", image))

        if remove_duplicate_frames <= 0:
            return self._concat_images(images)

        trimmed_images = [images[0]]
        for input_name, image in images[1:]:
            image = image[remove_duplicate_frames:]
            if len(image) > 0:
                trimmed_images.append((input_name, image))

        return self._concat_images(trimmed_images)

    def _concat_images(self, images):
        if len(images) == 1:
            return (images[0][1],)
        self._validate_image_shapes(images)
        import torch

        return (torch.cat([image for _, image in images], dim=0),)

    def _validate_image_shapes(self, images):
        base_shape = tuple(images[0][1].shape[1:])
        for input_name, image in images[1:]:
            shape = tuple(image.shape[1:])
            if shape != base_shape:
                raise ValueError(
                    f"YJ Dynamic Image Batch Concat: {input_name} shape {shape} "
                    f"does not match image1 shape {base_shape}."
                )


NODE_CLASS_MAPPINGS = {
    "YJDynamicImageBatchConcat": YJDynamicImageBatchConcat,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "YJDynamicImageBatchConcat": "Dynamic Image Batch Concat",
}
