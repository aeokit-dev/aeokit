import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "theme-preference";
const THEME_CHANGE_EVENT = "theme-preference-change";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveThemeName(
  preference: ThemePreference,
  systemPrefersDark: boolean,
) {
  if (preference === "light") return "openaeo";
  if (preference === "dark") return "openaeo-dark";
  return systemPrefersDark ? "openaeo-dark" : "openaeo";
}

function applyThemePreference(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const systemPrefersDark = window.matchMedia(DARK_MEDIA_QUERY).matches;
  document.documentElement.dataset.theme = resolveThemeName(
    preference,
    systemPrefersDark,
  );
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);
  const handlePreferenceChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  const handleSystemChange = () => {
    applyThemePreference(readThemePreference());
    onStoreChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, handlePreferenceChange);
  window.addEventListener("storage", handleStorage);
  mediaQuery.addEventListener("change", handleSystemChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handlePreferenceChange);
    window.removeEventListener("storage", handleStorage);
    mediaQuery.removeEventListener("change", handleSystemChange);
  };
}

export function useThemePreference() {
  const themePreference = useSyncExternalStore(
    subscribe,
    readThemePreference,
    () => "system" as const,
  );

  useEffect(() => applyThemePreference(themePreference), [themePreference]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    try {
      if (preference === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      }
    } catch {
      // Theme switching still works when storage is unavailable.
    }
    applyThemePreference(preference);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return { themePreference, setThemePreference };
}
