export const LIST_PAGE_RESET_EVENT = "artifacte:list-page-reset";

export function dispatchListPageReset() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(LIST_PAGE_RESET_EVENT));
}