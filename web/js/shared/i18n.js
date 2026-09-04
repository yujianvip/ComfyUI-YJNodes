const DEFAULT_LANGUAGE = "en";

export function resolveLanguage(...candidates) {
  for (const candidate of candidates.flat()) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    return candidate.trim().toLowerCase().startsWith("zh") ? "zh" : "en";
  }
  return DEFAULT_LANGUAGE;
}

export function getCurrentLanguage(app, environment = globalThis) {
  let comfyLocale;
  try {
    comfyLocale = app?.extensionManager?.setting?.get?.("Comfy.Locale");
  } catch {
    comfyLocale = undefined;
  }
  if (!comfyLocale) {
    const legacySettings = app?.ui?.settings;
    for (const key of ["Comfy.Locale", "Comfy.Locale.Language", "locale"]) {
      try {
        comfyLocale = legacySettings?.getSettingValue?.(key);
      } catch {
        comfyLocale = undefined;
      }
      if (comfyLocale) break;
    }
  }
  const navigatorObject = environment?.navigator;
  return resolveLanguage(
    comfyLocale,
    navigatorObject?.languages,
    navigatorObject?.language,
    environment?.document?.documentElement?.lang,
  );
}

export function messageFor(messages, language, key) {
  const selected = language === "zh" ? messages.zh : messages.en;
  return selected?.[key] ?? messages.en?.[key] ?? key;
}
