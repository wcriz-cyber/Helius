'use strict';
/* ═══════════════════════════════════════════════════════════════
   5X — Service Worker v3
   Archivo separado para que las notificaciones muestren
   el nombre de la app (5X) en lugar de la URL blob:// en Android.
═══════════════════════════════════════════════════════════════ */
var CACHE_NAME = 'c5x-sw-v3';
var APP_ICON   = './icon.png';

/* ── Instalación: activar inmediatamente ────────────────────── */
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

/* ── Push: recibir notificaciones desde servidor ────────────── */
self.addEventListener('push', function(event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch(e) {
    data = { title: '5X', body: event.data ? event.data.text() : 'Nueva alerta' };
  }

  var title   = data.title   || '5X — Nueva alerta';
  var options = {
    body:               data.body    || '',
    tag:                data.tag     || ('c5x-push-' + Date.now()),
    icon:               data.icon    || APP_ICON,
    badge:              data.badge   || APP_ICON,
    vibrate:            data.vibrate || [200, 100, 200],
    requireInteraction: !!data.requireInteraction,
    silent:             false,
    timestamp:          Date.now(),
    data:               data.data    || {}
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* ── Click en notificación → abrir / enfocar app ────────────── */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(list) {
        for (var i = 0; i < list.length; i++) {
          if ('focus' in list[i]) return list[i].focus();
        }
        return self.clients.openWindow ? self.clients.openWindow('./') : null;
      })
  );
});

/* ── Background Sync ────────────────────────────────────────── */
self.addEventListener('sync', function(event) {
  /* La lógica la maneja la app; el SW solo despierta el proceso */
});

/* ── Mensajes desde la app (mostrar notif desde foreground) ─── */
self.addEventListener('message', function(event) {
  if (!event.data) return;

  /* Ping de diagnóstico */
  if (event.data.type === 'PING') {
    if (event.source) event.source.postMessage({ type: 'SW_READY' });
    return;
  }

  /* Mostrar notificación enviada directamente desde la página */
  if (event.data.type === 'SHOW_NOTIF') {
    var d = event.data;
    self.registration.showNotification(d.title || '5X', {
      body:               d.body    || '',
      tag:                d.tag     || ('c5x-msg-' + Date.now()),
      icon:               APP_ICON,
      badge:              APP_ICON,
      vibrate:            d.vibrate || [200, 100, 200],
      requireInteraction: !!d.requireInteraction,
      silent:             false,
      timestamp:          Date.now(),
      data:               d.data    || {}
    }).catch(function(err) {
      /* silencioso — el cliente ya tiene fallback */
    });
  }
});
