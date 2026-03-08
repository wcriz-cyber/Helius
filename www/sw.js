'use strict';
/* ════════════════════════════════════════════════════════════════
   5X Trading — Service Worker v4
   Archivo: sw.js  (debe estar junto a index.html en www/)
   Maneja notificaciones nativas en Android APK (Capacitor/TWA)
   ════════════════════════════════════════════════════════════════ */
var CACHE = 'c5x-sw-v4';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(self.clients.claim());
});

// Obtener URL absoluta del icono relativa al scope del SW
function _iconUrl(name) {
  // self.registration.scope termina en '/' — ej: https://user.github.io/repo/
  return self.registration.scope + (name || 'icon.png');
}

// ── Push event: notificaciones en background (Web Push Protocol) ──
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) {
    data = { title: '5X', body: e.data ? e.data.text() : '' };
  }
  var title = data.title || '5X — Nueva alerta';
  var options = {
    body:               data.body || '',
    tag:                data.tag  || 'c5x-push-' + Date.now(),
    icon:               data.icon || _iconUrl('icon.png'),
    badge:              _iconUrl('icon.png'),   // icon.png como badge — badge.png no existe
    vibrate:            data.vibrate || [200, 100, 200],
    requireInteraction: !!data.requireInteraction,
    silent:             false,
    timestamp:          data.timestamp || Date.now(),
    renotify:           false,
    data:               data.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Click en notificación → abrir / enfocar app ──────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  // Usar self.registration.scope — soporta GitHub Pages subdirectorios y APK
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

// ── Background Sync (Chrome Android) ────────────────────────────
self.addEventListener('sync', function(e) {
  if (e.tag === 'c5x-market-check') {
    // El cliente maneja la lógica; solo despertar
  }
});

// ── Mensajes desde la app principal ─────────────────────────────
self.addEventListener('message', function(e) {
  if (!e.data) return;

  // PING: confirmar que el SW está activo
  if (e.data.type === 'PING') {
    if (e.source) e.source.postMessage({ type: 'SW_READY' });
  }

  // SHOW_NOTIF: mostrar notificación nativa desde el cliente (foreground o background)
  // Este es el método principal para Android APK / Capacitor
  if (e.data.type === 'SHOW_NOTIF') {
    var d       = e.data;
    var iconAbs = self.registration.scope + 'icon.png';
    self.registration.showNotification(d.title || '5X', {
      body:               d.body || '',
      tag:                d.tag  || 'c5x-' + Date.now(),
      icon:               iconAbs,
      badge:              iconAbs,  // mismo icon.png — badge.png no existe en el APK
      vibrate:            d.vibrate || [200, 100, 200],
      requireInteraction: !!d.requireInteraction,
      silent:             false,
      timestamp:          Date.now(),
      data:               d.data   || {},
      actions:            d.actions || []
    }).catch(function() {
      // Si showNotification falla (permiso denegado / WebView limitado):
      // responder al cliente para que intente new Notification()
      if (e.source) e.source.postMessage({ type: 'NOTIF_FAILED' });
    });
  }
});
