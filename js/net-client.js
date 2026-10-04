/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · CONEXIÓN DE UN DISPOSITIVO A LA SALA
   La usan la pantalla de espectador y el celular del jugador (jugar.html).
   Se reconecta solo: si no oye a la pantalla principal en DEAD_MS, cierra y reintenta.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const Net = window.LetrasNet;
  const RETRY_MS = 3000;

  /* handlers: { onOpen(), onMessage(msg), onStatus(kind, text) } */
  function connect(code, handlers) {
    let peer = null, conn = null, lastSeen = 0, retryTimer = null, closed = false;
    const status = (kind, text) => handlers.onStatus && handlers.onStatus(kind, text);

    function start() {
      clearTimeout(retryTimer);
      if (closed) return;
      if (typeof window.Peer !== 'function') return status('error', 'No se pudo cargar la librería de conexión.');
      status('connecting', 'Conectando con la sala…');
      peer = new window.Peer({ debug: 1 });
      peer.on('open', () => {
        conn = peer.connect(Net.ROOM_PREFIX + code, { reliable: true });
        conn.on('open', () => { lastSeen = Date.now(); status('online', 'Conectado'); handlers.onOpen && handlers.onOpen(); });
        conn.on('data', msg => {
          lastSeen = Date.now();
          if (Net.isMessage(msg, true)) handlers.onMessage(msg);
        });
        conn.on('close', () => restart('La sala se cerró o se cortó la conexión. Reintentando…'));
        conn.on('error', err => { console.warn('Error de conexión con la sala:', err); restart('Error de conexión. Reintentando…'); });
      });
      peer.on('error', err => {
        console.warn('Error de PeerJS:', err.type, err);
        restart(err.type === 'peer-unavailable' ? 'No hay sala con ese código (¿está abierta la pantalla principal?). Reintentando…' : 'Sin conexión. Reintentando…');
      });
    }
    function restart(text) {
      if (closed) return;
      status('error', text);
      if (peer && !peer.destroyed) peer.destroy();
      peer = conn = null;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(start, RETRY_MS);
    }
    const send = msg => { if (conn && conn.open) { conn.send(msg); return true; } return false; };

    // Latido: si la pantalla principal no contesta, la conexión se da por muerta.
    setInterval(() => {
      if (!conn || !conn.open) return;
      send({ t: 'ping' });
      if (Date.now() - lastSeen > Net.DEAD_MS) restart('La sala no responde. Reconectando…');
    }, Net.PING_MS);
    addEventListener('beforeunload', () => { closed = true; if (peer && !peer.destroyed) peer.destroy(); });

    start();
    return { send };
  }

  window.LetrasClient = { connect };
})();
