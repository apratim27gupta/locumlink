/** Injected when the WebView has JS context but stale PWA caches block boot. */
export const CLEAR_PWA_STORAGE_SCRIPT = `
(function() {
  function reload() { window.location.reload(); }
  try {
    if (!('serviceWorker' in navigator)) { reload(); return; }
    navigator.serviceWorker.getRegistrations()
      .then(function(regs) {
        return Promise.all(regs.map(function(r) { return r.unregister(); }));
      })
      .then(function() {
        if (!('caches' in window)) return;
        return caches.keys().then(function(keys) {
          return Promise.all(keys.map(function(k) { return caches.delete(k); }));
        });
      })
      .then(reload)
      .catch(reload);
  } catch (e) {
    reload();
  }
})();
true;
`;

export const MAX_WEBVIEW_RECOVERY_ATTEMPTS = 2;
