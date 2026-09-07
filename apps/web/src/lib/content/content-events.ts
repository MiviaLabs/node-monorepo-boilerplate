const CONTENT_REFRESH_EVENT = 'content:refresh';

export function emitContentRefresh(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(CONTENT_REFRESH_EVENT));
}

export function subscribeToContentRefresh(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(CONTENT_REFRESH_EVENT, handler);
  return () => window.removeEventListener(CONTENT_REFRESH_EVENT, handler);
}
