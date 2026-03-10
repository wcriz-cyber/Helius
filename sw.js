// 5X Service Worker v4 — Web Push + Background Notifications
// Maneja: push events (app cerrada), notification clicks, postMessage desde app

const CACHE_NAME = '5x-v4';

// ── PUSH: recibe notificaciones aunque la app esté cerrada ──────────────
self.addEventListener('push', function(event) {
  let payload = { title: '5X', body: '', type: 'info', sound: 'normal', data: {} };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch(_) {
    if (event.data) payload.body = event.data.text();
  }

  const iconMap = {
    order_filled: '✅',
    buy:          '🛒',
    sell:         '💰',
    alert:        '⚠️',
    level:        '📊',
    tp1:          '🎯',
    tp2:          '🏆',
    trailing:     '🔵',
    rebuy:        '🔄',
    system:       '🔔',
  };
  const icon  = iconMap[payload.type] || '🔔';
  const title = payload.title || '5X Trading';
  const body  = payload.body  || '';

  const opts = {
    body:               body,
    icon:               '/icon.png',
    badge:              '/icon.png',
    tag:                payload.tag || ('5x-' + (payload.type || 'info') + '-' + Date.now()),
    requireInteraction: payload.type === 'order_filled' || payload.type === 'tp1' || payload.type === 'tp2',
    silent:             false,
    vibrate:            payload.type === 'order_filled' ? [200,100,200,100,200] : [150,75,150],
    data:               Object.assign({ url: '/', ts: Date.now() }, payload.data || {}),
    actions: payload.type === 'order_filled' ? [
      { action: 'view', title: '📊 Ver niveles' },
      { action: 'dismiss', title: '✕' }
    ] : []
  };

  event.waitUntil(self.registration.showNotification(title, opts));
});

// ── NOTIFICATION CLICK: abrir/enfocar la app ────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(cs) {
      for (const c of cs) {
        if (c.url && c.focus) { c.focus(); return; }
      }
      return clients.openWindow('/');
    })
  );
});

// ── MESSAGE desde la app (notificaciones cuando está abierta) ───────────
self.addEventListener('message', function(event) {
  const d = event.data || {};
  if (d.type !== 'SHOW_NOTIFICATION') return;

  const opts = {
    body:               d.body  || '',
    icon:               '/icon.png',
    badge:              '/icon.png',
    tag:                d.tag   || ('5x-msg-' + Date.now()),
    requireInteraction: !!d.requireInteraction,
    silent:             !!d.silent,
    vibrate:            d.vibrate || [100, 50, 100],
    data:               d.data   || {},
    actions:            d.actions || []
  };

  event.waitUntil(self.registration.showNotification(d.title || '5X', opts));
});

// ── INSTALL / ACTIVATE (minimal, sin caché agresiva) ───────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
