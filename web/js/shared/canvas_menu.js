// 菜单注册状态存放在具体画布原型上，确保热重载不会重复包装或串到其他画布。
const REGISTRY_KEY = Symbol.for("ComfyUI-YJNodes.canvasMenuRegistry");
const PATCH_KEY = Symbol.for("ComfyUI-YJNodes.canvasMenuPatch");

function sortedMenuItems(menuItems) {
  return [...menuItems.values()].sort((left, right) =>
    left.order - right.order || left.id.localeCompare(right.id)
  );
}

export function registerYJCanvasMenuItem(canvasClass, item) {
  if (!canvasClass?.prototype || !item?.id) return;
  const prototype = canvasClass.prototype;
  const menuItems = prototype[REGISTRY_KEY] ||= new Map();
  menuItems.set(item.id, {
    id: String(item.id),
    order: Number(item.order) || 0,
    content: item.content,
    callback: item.callback,
  });

  if (prototype[PATCH_KEY]) return;
  const original = prototype.getCanvasMenuOptions;
  prototype.getCanvasMenuOptions = function (...args) {
    const originalOptions = original ? original.apply(this, args) : [];
    const options = Array.isArray(originalOptions) ? originalOptions : [];
    if (options.length > 0 && options.at(-1) !== null) options.push(null);
    for (const entry of sortedMenuItems(menuItems)) {
      options.push({
        content: typeof entry.content === "function" ? entry.content() : entry.content,
        callback: entry.callback,
      });
    }
    return options;
  };
  Object.defineProperty(prototype, PATCH_KEY, { value: true });
}
