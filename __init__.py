WEB_DIRECTORY = "./web"
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

if __package__:
    try:
        from .yj_nodes.nodes.dynamic_image_concat import (
            NODE_CLASS_MAPPINGS as IMAGE_CONCAT_NODE_CLASS_MAPPINGS,
            NODE_DISPLAY_NAME_MAPPINGS as IMAGE_CONCAT_NODE_DISPLAY_NAME_MAPPINGS,
        )

        NODE_CLASS_MAPPINGS.update(IMAGE_CONCAT_NODE_CLASS_MAPPINGS)
        NODE_DISPLAY_NAME_MAPPINGS.update(IMAGE_CONCAT_NODE_DISPLAY_NAME_MAPPINGS)
    except Exception as exc:
        import traceback

        print(f"[ComfyUI-YJNodes] Failed to register image concat node: {exc}")
        traceback.print_exc()

    try:
        from .yj_nodes.nodes.pause import (
            NODE_CLASS_MAPPINGS as PAUSE_NODE_CLASS_MAPPINGS,
            NODE_DISPLAY_NAME_MAPPINGS as PAUSE_NODE_DISPLAY_NAME_MAPPINGS,
        )

        NODE_CLASS_MAPPINGS.update(PAUSE_NODE_CLASS_MAPPINGS)
        NODE_DISPLAY_NAME_MAPPINGS.update(PAUSE_NODE_DISPLAY_NAME_MAPPINGS)
    except Exception as exc:
        import traceback

        print(f"[ComfyUI-YJNodes] Failed to register YJpause node: {exc}")
        traceback.print_exc()

    try:
        from .yj_nodes.routes import register_routes

        register_routes()
    except Exception as exc:
        import traceback

        print(f"[ComfyUI-YJNodes] Failed to register routes: {exc}")
        traceback.print_exc()

__all__ = [
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "WEB_DIRECTORY",
]
