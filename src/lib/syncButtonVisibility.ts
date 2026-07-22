export const SYNC_BUTTON_VISIBLE_KEY = "tender-ai-manual-sync-visible";
export const SYNC_BUTTON_VISIBILITY_EVENT = "tender-ai-manual-sync-visibility-change";

export function readSyncButtonVisible(): boolean {
  return localStorage.getItem(SYNC_BUTTON_VISIBLE_KEY) === "1";
}

export function writeSyncButtonVisible(visible: boolean) {
  localStorage.setItem(SYNC_BUTTON_VISIBLE_KEY, visible ? "1" : "0");
  window.dispatchEvent(new Event(SYNC_BUTTON_VISIBILITY_EVENT));
}
