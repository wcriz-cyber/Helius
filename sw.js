/* ═══════════════════════════════════════════════════════════════
   5X Trading App — Service Worker v5
   IMPORTANTE: Este archivo debe estar en el mismo directorio que index.html
   GitHub Pages: /repo/sw.js
   Android APK (Capacitor): android/app/src/main/assets/public/sw.js
═══════════════════════════════════════════════════════════════ */
'use strict';

var CACHE_NAME = 'c5x-sw-v5';

/* ── Install: activar inmediatamente ────────────────────────── */
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

/* ── Activate: tomar control de todos los clientes ─────────── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Limpiar caches viejos
      caches.keys().then(function(keys) {
        return Promise.all(
          keys.filter(function(k) { return k !== CACHE_NAME && k.startsWith('c5x'); })
              .map(function(k) { return caches.delete(k); })
        );
      })
    ])
  );
});

/* ── URL absoluta del icono ─────────────────────────────────── */
function _iconUrl(name) {
  return self.registration.scope + (name || 'icon.png');
}

/* ── Push Event: Web Push Protocol (background) ─────────────── */
self.addEventListener('push', function(e) {
  var data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch(err) {
    data = { title: '5X', body: e.data ? e.data.text() : '' };
  }

  var title   = data.title || '5X — Nueva alerta';
  var options = {
    body:               data.body || '',
    tag:                data.tag  || 'c5x-push-' + Date.now(),
    icon:               data.icon || _iconUrl('icon.png'),
    badge:              _iconUrl('icon.png'),
    vibrate:            data.vibrate || [200, 100, 200],
    requireInteraction: !!data.requireInteraction,
    renotify:           true,
    silent:             false,
    timestamp:          data.timestamp || Date.now(),
    data:               data.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click: abrir/enfocar app ──────────────────── */
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var appUrl = self.registration.scope;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        if (client.url.startsWith(appUrl)) {
          if ('focus' in client) return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(appUrl);
      return null;
    })
  );
});

/* ── Mensajes desde el cliente ──────────────────────────────── */
self.addEventListener('message', function(e) {
  if (!e.data) return;

  /* PING de health-check */
  if (e.data.type === 'PING') {
    if (e.source) e.source.postMessage({ type: 'SW_READY' });
    return;
  }

  /* SHOW_NOTIF: mostrar notificación desde el cliente (foreground o background) */
  if (e.data.type === 'SHOW_NOTIF') {
    var d        = e.data;
    var iconAbs  = self.registration.scope + 'icon.png';

    self.registration.showNotification(d.title || '5X', {
      body:               d.body    || '',
      tag:                d.tag     || 'c5x-' + Date.now(),
      icon:               iconAbs,
      badge:              iconAbs,
      vibrate:            d.vibrate || [200, 100, 200],
      requireInteraction: !!d.requireInteraction,
      renotify:           true,
      silent:             false,
      timestamp:          Date.now(),
      data:               d.data    || {}
    }).catch(function(err) {
      console.warn('[5X SW] showNotification error:', err);
    });
    return;
  }

  /* GET_STATE: el SW puede leer estado cacheado */
  if (e.data.type === 'GET_STATE' && e.source) {
    caches.open('c5x-state-v1').then(function(cache) {
      cache.match('/_state/c5x_slots').then(function(r) {
        return r ? r.json() : null;
      }).then(function(slots) {
        e.source.postMessage({ type: 'STATE_DATA', slots: slots });
      }).catch(function() {
        e.source.postMessage({ type: 'STATE_DATA', slots: null });
      });
    });
  }
});

/* ── Background Sync ────────────────────────────────────────── */
self.addEventListener('sync', function(e) {
  if (e.tag === 'c5x-market-check') {
    // El cliente maneja la lógica; solo mantener el SW vivo
    console.log('[5X SW] Background sync c5x-market-check');
  }
});
