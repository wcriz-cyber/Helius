// ══════════════════════════════════════════════════════════════
//  5X SERVICE WORKER — Background Notifications + Bot Keep-Alive
//  Maneja notificaciones cuando la app está cerrada/minimizada
//  y hace ping a la página para mantener el bot activo
// ══════════════════════════════════════════════════════════════

const SW_VERSION = '5x-sw-v5';
const CACHE_NAME  = SW_VERSION;

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
    self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        // 1. Limpiar cachés viejas
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            // 2. Tomar control de todos los clientes inmediatamente
            .then(() => self.clients.claim())
            // 3. Notificar a todas las páginas que el SW está listo
            .then(() => self.clients.matchAll({ includeUncontrolled: true }))
            .then(clients => {
                clients.forEach(c => c.postMessage({ type: 'SW_READY', version: SW_VERSION }));
            })
    );
});

// ── FETCH — NO interceptar (evita congelar la app) ──────────
// IMPORTANTE: No interceptar fetch. Si se usa caches.match('/index.html')
// y la caché está vacía, la app se congela completamente.
// La app 5X es single-file — no necesita caché de red.

// ── PUSH — notificaciones desde servidor (futuro) ────────────
self.addEventListener('push', event => {
    if (!event.data) return;
    let data = {};
    try { data = event.data.json(); } catch(e) { data = { title: '5X', body: event.data.text() }; }
    event.waitUntil(
        self.registration.showNotification(data.title || '5X Trading', {
            body:              data.body  || '',
            icon:              data.icon  || 'icon.png',
            badge:             'icon.png',
            tag:               data.tag   || 'c5x-push',
            requireInteraction: data.requireInteraction !== false,
            vibrate:           data.vibrate || [200, 100, 200],
            data:              data.data   || {},
            actions:           data.actions || []
        })
    );
});

// ── NOTIFICATION CLICK ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            // Si ya hay una ventana abierta, enfocarla
            for (const client of clients) {
                if ('focus' in client) return client.focus();
            }
            // Si no hay ventana abierta, abrir la app
            return self.clients.openWindow ? self.clients.openWindow('./') : null;
        })
    );
});

// ── PERIODIC BACKGROUND SYNC ──────────────────────────────────
// Permite que el SW haga chequeos periódicos aunque la app esté cerrada
self.addEventListener('periodicsync', event => {
    if (event.tag === 'c5x-market-check') {
        event.waitUntil(doBackgroundMarketCheck());
    }
});

async function doBackgroundMarketCheck() {
    try {
        // Notificar a clientes activos que hagan un ciclo del bot
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        if (clients.length > 0) {
            clients.forEach(c => c.postMessage({ type: 'SW_PING_BOT' }));
            return; // La página maneja el ciclo
        }
        // Si no hay clientes activos: hacer chequeo directo de precios desde SW
        // (notificaciones sin que la app esté abierta)
        const saved = await getFromStorage('c5x_slots');
        const modes = await getFromStorage('c5x_slot_modes');
        if (!saved || !modes) return;

        const slots     = JSON.parse(saved);
        const slotModes = JSON.parse(modes);
        const autoSlots = slots.filter((s, i) => s && s.name && slotModes[i] === 'auto');
        if (autoSlots.length === 0) return;

        // Obtener precios de Gate.io
        const resp = await fetch('https://api.gateio.ws/api/v4/spot/tickers', {
            headers: { 'Accept': 'application/json' }
        });
        if (!resp.ok) return;
        const tickers = await resp.json();

        for (const slot of autoSlots) {
            const ticker = tickers.find(t => t.currency_pair === slot.name + '_USDT');
            if (!ticker) continue;
            const price = parseFloat(ticker.last);
            if (!price) continue;

            // Verificar si algún nivel fue alcanzado
            await checkSlotLevelsBackground(slot, price);
        }
    } catch(e) {
        console.warn('[SW] Background check error:', e.message);
    }
}

async function checkSlotLevelsBackground(slot, currentPrice) {
    // Verificar niveles alcanzados y enviar notificación
    const base = slot.price;
    if (!base || base <= 0) return;

    const strat = slot.strat || 'normal';
    let levelPrice = base;
    const boughtLevels = slot.buys || [];

    for (let i = 1; i < 12; i++) {
        // Calculo simplificado del precio del nivel
        const step = 5; // inc por defecto
        levelPrice = levelPrice * (1 - step / 100);

        if (boughtLevels.includes(i)) continue;
        if (currentPrice <= levelPrice * 1.002) {
            // Nivel alcanzado — enviar notificación
            await self.registration.showNotification(`📈 Nivel ${i+1} alcanzado — ${slot.name}`, {
                body:              `Precio actual $${currentPrice.toFixed(6)} llegó a N${i+1} ($${levelPrice.toFixed(6)})`,
                icon:              'icon.png',
                badge:             'icon.png',
                tag:               `c5x-level-${slot.name}-${i}`,
                requireInteraction: true,
                vibrate:           [300, 100, 300],
                data:              { slotName: slot.name, level: i, price: currentPrice }
            });
            break; // Solo notificar el primer nivel no comprado
        }
    }
}

// ── MESSAGE desde la página ───────────────────────────────────
self.addEventListener('message', event => {
    if (!event.data) return;

    if (event.data.type === 'PING' || event.data.type === 'SW_READY') {
        // Confirmar al cliente
        event.source && event.source.postMessage({ type: 'SW_READY', version: SW_VERSION });
    }

    // ── Mostrar notificación enviada desde la página (foreground) ──
    if (event.data.type === 'SHOW_NOTIF') {
        const d = event.data;
        self.registration.showNotification(d.title || '5X', {
            body:               d.body    || '',
            tag:                d.tag     || ('c5x-msg-' + Date.now()),
            icon:               'icon.png',
            badge:              'icon.png',
            vibrate:            d.vibrate || [200, 100, 200],
            requireInteraction: !!d.requireInteraction,
            silent:             false,
            timestamp:          Date.now(),
            data:               d.data    || {}
        }).catch(() => {});
    }

    if (event.data.type === 'BOT_BACKGROUND') {
        // La página se fue a background con slots en auto
        // Guardamos el estado y programamos un chequeo si el SO permite
        const { slots: slotNames } = event.data;
        console.log('[SW] Bot en background para:', slotNames);
        // Intentar mantener al SW activo con un ping cada 25s
        // (dentro del límite que permiten la mayoría de SO)
        scheduleBackgroundPing();
    }

    if (event.data.type === 'BOT_FOREGROUND') {
        // La página volvió al frente — cancelar pings del SW
        clearBackgroundPing();
    }

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// ── BACKGROUND PING: mantiene SW activo y hace chequeos ──────
let _bgPingInterval = null;
let _bgPingCount    = 0;

function scheduleBackgroundPing() {
    clearBackgroundPing();
    _bgPingCount = 0;
    _bgPingInterval = setInterval(async () => {
        _bgPingCount++;
        // Después de 30 pings (~12.5 min) parar para no agotar batería
        if (_bgPingCount > 30) { clearBackgroundPing(); return; }

        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
        if (clients.length > 0) {
            // Hay página activa — pedirle que haga el ciclo del bot
            clients.forEach(c => c.postMessage({ type: 'SW_PING_BOT' }));
        } else {
            // No hay página — hacer chequeo directo
            doBackgroundMarketCheck();
        }
    }, 25000); // cada 25 segundos
}

function clearBackgroundPing() {
    if (_bgPingInterval) { clearInterval(_bgPingInterval); _bgPingInterval = null; }
}

// ── HELPER: leer de localStorage desde SW (vía IndexedDB proxy) ─
// Los SW no tienen acceso a localStorage, usamos IDB o Cache API como proxy
async function getFromStorage(key) {
    // Intentar obtener de Cache API como proxy de localStorage
    try {
        const cache = await caches.open('c5x-state-v1');
        const resp  = await cache.match('/_state/' + key);
        if (resp) return await resp.text();
    } catch(e) {}
    return null;
}
