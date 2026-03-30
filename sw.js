'use strict';
let CACHE = 'helius-sw-v4';

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
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch(err) { data = { title: 'Helius', body: e.data ? e.data.text() : '' }; }
  let title   = data.title || 'Helius — Nueva alerta';
  let options = {
    body:              data.body || '',
    tag:               data.tag  || 'helius-push-' + Date.now(),
    icon:              data.icon || _iconUrl('icon.png'),
    badge:             _iconUrl('icon.png'),   /* badge.png no existe — usar icon.png */
    vibrate:           data.vibrate || [200, 100, 200],
    requireInteraction: !!data.requireInteraction,
    silent:            false,
    timestamp:         data.timestamp || Date.now(),
    renotify:          false,
    data:              data.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── Click en notificación → abrir / enfocar app ──────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  // FIX APK: usar self.registration.scope en lugar de '/' hardcodeado
  // Necesario para apps en subdirectorio (GitHub Pages: /repo/)
  let appUrl = self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      // Primero intentar enfocar una ventana ya abierta
      for (let i = 0; i < list.length; i++) {
        let client = list[i];
        // Verificar que la URL pertenece a la app (mismo scope)
        if (client.url.startsWith(appUrl)) {
          if ('focus' in client) return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir la app
      if (self.clients.openWindow) return self.clients.openWindow(appUrl);
      return null;
    })
  );
});

// ── Background Sync (Chrome Android) ────────────────────────────
self.addEventListener('sync', function(e) {
  if (e.tag === 'helius-market-check') {
    // El cliente maneja la lógica; solo despertar
  }
});

// ── Mensajes desde la app principal ─────────────────────────────
self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'PING') {
    if (e.source) e.source.postMessage({ type: 'SW_READY' });
  }
  // Mostrar notificación directo desde el cliente (foreground)
  if (e.data.type === 'SHOW_NOTIF') {
    let d = e.data;
    let iconAbs = self.registration.scope + 'icon.png';
    
    // ✅ FIX9: renotify:true asegura que cada notif aparezca incluso con mismo tag
    self.registration.showNotification(d.title || 'Helius', {
      body:               d.body || '',
      tag:                d.tag || 'helius-' + Date.now(),
      icon:               iconAbs,
      badge:              iconAbs,
      vibrate:            d.vibrate || [200, 100, 200],
      requireInteraction: !!d.requireInteraction,
      renotify:           true,   /* ✅ muestra siempre aunque haya notif con mismo tag */
      silent:             false,
      timestamp:          Date.now(),
      data:               d.data || {}
    }).catch(function(){});
  }
});