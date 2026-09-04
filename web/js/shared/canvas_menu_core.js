const REGISTRY_KEY = Symbol.for("ComfyUI-YJNodes.canvasMenuRegistry");
const menuItems = globalThis[REGISTRY_KEY] ||= new Map();

export function registerYJCanvasMenuItem(item) {
  if (!item?.id) return;
  menuItems.set(String(item.id), {
    id: String(item.id),
    order: Number(item.order) || 0,
    content: item.content,
    callback: item.callback,
  });
}

export function getYJCanvasMenuItems() {
  const entries = [...menuItems.values()].sort((left, right) =>
    left.order - right.order || left.id.localeCompare(right.id)
  );
  if (entries.length === 0) return [];
  return [
    null,
    ...entries.map((entry) => ({
      content: typeof entry.content === "function" ? entry.content() : entry.content,
      callback: entry.callback,
    })),
  ];
}
