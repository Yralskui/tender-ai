export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "tender-ai-theme";

export function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}
