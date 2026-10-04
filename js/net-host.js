/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · SALA EN LÍNEA (pantalla principal)
   Igual que Carrera de Medallas:
   - Crea la sala (un Peer con id fijo derivado del código) desde el panel.
   - Asigna los asientos (0 = izquierda, 1 = derecha) a los celulares y valida sus pedidos.
   - Reenvía al juego sólo las respuestas del asiento en turno (app.js vuelve a validar).
   - Manda a cada dispositivo la foto de la partida tras cada cambio.
   - Espectadores (index.html / horizontal.html ?espectador=CÓDIGO): sólo miran.
   Los asientos sin celular se juegan desde esta pantalla, como siempre.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const App = window.LetrasApp, Net = window.LetrasNet;
  if (!App || App.spectator || location.hash === '#panel') return; // la sala vive en la pantalla que se graba

  const ROOM_KEY = 'letras-room-v1';
  const SEATS = 2;
  const MAX_WATCHERS = 12;
  const ID_RETRIES = 6; // tras recargar, el servidor tarda en liberar el id anterior

  let peer = null, code = null, idRetries = 0, retryTimer = null, queued = false;
  let status = { kind: 'off', text: 'Sin sala en línea' };
  const conns = new Set();
  const seatConn = [null, null];
  const seatToken = [null, null];

  function readRoom() {
    try { return Net.normalizeCode(localStorage.getItem(ROOM_KEY)); } catch (err) { console.warn('No se pudo leer la sala guardada:', err); return null; }
  }
  function writeRoom(value) {
    try { if (value) localStorage.setItem(ROOM_KEY, value); else localStorage.removeItem(ROOM_KEY); } catch (err) { console.warn('No se pudo guardar la sala:', err); }
  }
  const isConnected = seat => !!seatConn[seat] && seatConn[seat].open;
  const watcherCount = () => [...conns].filter(c => c.watch).length;
  function setStatus(kind, text) { status = { kind, text }; renderPanel(); }

  /* ── Ciclo de vida ── */
  function openRoom(existing) {
    clearTimeout(retryTimer);
    if (typeof window.Peer !== 'function') return setStatus('error', 'No se pudo cargar la librería de conexión (vendor/peerjs.min.js).');
    code = existing || Net.newRoomCode();
    writeRoom(code);
    setStatus('connecting', 'Conectando con el servidor…');
    peer = new window.Peer(Net.ROOM_PREFIX + code, { debug: 1 });
    peer.on('open', () => { idRetries = 0; setStatus('online', 'Sala en línea'); });
    peer.on('connection', onConnection);
    peer.on('disconnected', () => {
      // Se perdió el servidor de presentación; las conexiones abiertas siguen.
      if (peer && !peer.destroyed) { setStatus('connecting', 'Reconectando con el servidor…'); peer.reconnect(); }
    });
    peer.on('error', onPeerError);
  }
  function onPeerError(err) {
    console.warn('Error en la sala en línea:', err.type, err);
    if (err.type === 'unavailable-id') {
      destroyPeer();
      if (idRetries++ < ID_RETRIES) { setStatus('connecting', 'Recuperando la sala…'); retryTimer = setTimeout(() => openRoom(code), 3000); }
      else setStatus('error', 'Ese código sigue en uso. Cerrá la sala y creá una nueva.');
      return;
    }
    if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type)) {
      destroyPeer();
      setStatus('error', 'Sin conexión con el servidor. Reintentando…');
      retryTimer = setTimeout(() => openRoom(code), 5000);
      return;
    }
    if (err.type === 'browser-incompatible') setStatus('error', 'Este navegador no permite jugar en línea.');
  }
  function destroyPeer() { if (peer && !peer.destroyed) peer.destroy(); peer = null; }
  function closeRoom() {
    clearTimeout(retryTimer);
    for (const c of conns) c.close();
    conns.clear();
    seatConn.fill(null); seatToken.fill(null);
    destroyPeer();
    code = null;
    writeRoom(null);
    setStatus('off', 'Sin sala en línea');
  }

  /* ── Dispositivos ── */
  function onConnection(conn) {
    conn.seat = null;
    conn.lastSeen = Date.now();
    conn.on('open', () => { conn.lastSeen = Date.now(); conns.add(conn); sendState(conn); });
    conn.on('data', msg => { conn.lastSeen = Date.now(); handle(conn, msg); });
    conn.on('close', () => drop(conn));
    conn.on('error', err => { console.warn('Error en la conexión de un dispositivo:', err); drop(conn); });
  }
  function drop(conn) {
    if (!conns.has(conn)) return;
    conns.delete(conn);
    if (conn.open) conn.close();
    if (conn.seat != null && seatConn[conn.seat] === conn) {
      seatConn[conn.seat] = null;
      App.toast(`${App.state.config.players[conn.seat]} SE DESCONECTÓ`);
    }
    renderPanel();
    broadcast();
  }
  const reply = (conn, msg) => { if (conn.open) conn.send(msg); };

  function handle(conn, msg) {
    if (!Net.isMessage(msg)) return;
    switch (msg.t) {
      case 'ping': return reply(conn, { t: 'pong' });
      case 'join': return join(conn, msg);
      case 'watch':
        if (conn.watch) return;
        if (conn.seat != null) return reply(conn, { t: 'error', msg: 'Este dispositivo ya juega en un asiento.' });
        if (watcherCount() >= MAX_WATCHERS) {
          reply(conn, { t: 'error', msg: 'La sala ya tiene el máximo de espectadores.' });
          return void setTimeout(() => drop(conn), 300);
        }
        conn.watch = true;
        sendState(conn);
        return renderPanel();
      case 'leave':
        if (conn.seat != null && seatConn[conn.seat] === conn) { seatConn[conn.seat] = null; seatToken[conn.seat] = null; conn.seat = null; renderPanel(); broadcast(); }
        return;
      case 'answer': {
        if (!mine(conn)) return reply(conn, { t: 'error', msg: 'Primero elegí tu lado.' });
        const text = Net.cleanText(msg.text);
        const note = App.answerFrom(conn.seat, text);
        if (note) reply(conn, { t: 'note', msg: note });
        return;
      }
      case 'typing':
        // Sólo se muestra lo que escribe quien tiene el turno.
        if (mine(conn) && conn.seat === App.state.active && App.state.round.status === 'playing') {
          const text = Net.cleanText(msg.text);
          App.setTyping(text);
          cast({ kind: 'typing', text });
        }
        return;
      default: return;
    }
  }
  const mine = conn => conn.seat != null && seatConn[conn.seat] === conn;

  function join(conn, msg) {
    if (conn.watch) return reply(conn, { t: 'error', msg: 'Una pantalla de espectador no puede jugar.' });
    if (!Net.isSeat(msg.seat) || !Net.isToken(msg.token)) return reply(conn, { t: 'error', msg: 'Pedido inválido.' });
    const seat = msg.seat, holder = seatConn[seat];
    if (holder && holder !== conn && holder.open && seatToken[seat] !== msg.token) {
      return reply(conn, { t: 'error', msg: 'Ese lado ya está ocupado por otro dispositivo.' });
    }
    if (conn.seat != null && conn.seat !== seat && seatConn[conn.seat] === conn) { seatConn[conn.seat] = null; seatToken[conn.seat] = null; }
    // El mismo jugador se reconectó desde otra conexión: la vieja queda afuera.
    if (holder && holder !== conn) { holder.seat = null; reply(holder, { t: 'kicked' }); setTimeout(() => holder.close(), 300); }
    seatConn[seat] = conn;
    seatToken[seat] = msg.token;
    conn.seat = seat;
    reply(conn, { t: 'joined', seat });
    App.toast(`${App.state.config.players[seat]} SE CONECTÓ`);
    renderPanel();
    broadcast();
  }

  /* ── Envío ── */
  const seatsView = () => [0, 1].map(isConnected);
  function sendState(conn) { reply(conn, { t: 'state', room: code, you: conn.seat, seats: seatsView(), game: App.state }); }
  function broadcast() {
    if (queued) return;
    queued = true;
    // Microtarea: no la frena el navegador si la ventana está oculta.
    queueMicrotask(() => { queued = false; for (const c of conns) sendState(c); });
  }
  function cast(e) { for (const c of conns) if (c.watch) reply(c, { t: 'cast', e }); }

  /* ── Panel ── */
  const section = document.createElement('section');
  section.id = 'room';
  const header = App.panel.querySelector('section');
  App.panel.insertBefore(section, header ? header.nextSibling : null);

  function copy(url, btn) {
    navigator.clipboard.writeText(url).then(
      () => { btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = btn.dataset.label; }, 1500); },
      err => { console.warn('No se pudo copiar el enlace:', err); btn.textContent = 'Copialo a mano'; },
    );
  }
  const localOnly = () => location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  function linkRow(label, url) {
    const row = document.createElement('div');
    row.className = 'line';
    row.style.marginTop = '4px';
    const input = document.createElement('input');
    Object.assign(input, { type: 'text', readOnly: true, value: url });
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    const btn = document.createElement('button');
    btn.textContent = btn.dataset.label = '📋 Copiar';
    btn.onclick = () => copy(url, btn);
    row.append(input, btn);
    return row;
  }

  function renderPanel() {
    section.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = 'Sala en línea';
    section.append(h);
    const p = (text, cls) => { const el = document.createElement('div'); el.className = cls || 'muted'; el.textContent = text; section.append(el); return el; };
    const button = (text, cls, fn) => { const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.onclick = fn; return b; };
    if (!code) {
      p('Cada jugador puede responder desde su celular, y otros streams pueden mirar la partida. Los lados sin celular se juegan desde esta pantalla.');
      const row = document.createElement('div'); row.className = 'line'; row.style.marginTop = '8px';
      row.append(button('🌐 Crear sala en línea', 'primary', () => openRoom(null)));
      section.append(row);
      return;
    }
    const st = p(`● ${status.text}`, 'room-status ' + status.kind);
    st.style.color = { online: '#58e36a', connecting: '#ffd84a', error: '#ff7a70' }[status.kind] || '#a9aab8';
    const codeLine = p('Código ', 'muted');
    const b = document.createElement('b'); b.textContent = code; b.style.cssText = 'font-size:20px;letter-spacing:.15em;color:#fff';
    codeLine.append(b);
    if (localOnly()) p('⚠ Abriste esta pantalla desde este equipo (archivo o localhost): los enlaces sólo sirven acá. Para celulares de otra casa usá la versión publicada en GitHub Pages.', 'muted').style.color = '#ffb37a';
    p('🎮 Jugadores (celular):');
    section.append(linkRow('Enlace para jugadores', Net.playerUrl(code)));
    const seats = document.createElement('div'); seats.className = 'muted'; seats.style.marginTop = '4px';
    seats.textContent = [0, 1].map(i => `${App.state.config.players[i]}: ${isConnected(i) ? '📱 conectado' : 'en esta pantalla'}`).join(' · ');
    section.append(seats);
    p('👀 Espectadores vertical / horizontal (OBS, otros streams):').style.marginTop = '8px';
    section.append(linkRow('Enlace para espectadores, vertical', Net.spectatorUrl(code, 'vertical')));
    section.append(linkRow('Enlace para espectadores, horizontal', Net.spectatorUrl(code, 'horizontal')));
    p(`👀 ${watcherCount()} ${watcherCount() === 1 ? 'espectador' : 'espectadores'} mirando`).style.marginTop = '4px';
    const row = document.createElement('div'); row.className = 'line'; row.style.marginTop = '8px';
    row.append(button('Cerrar sala', 'danger', closeRoom));
    section.append(row);
  }

  /* Conexiones que dejaron de dar latidos: se cierran y el asiento se libera. */
  setInterval(() => {
    const now = Date.now();
    for (const c of [...conns]) if (now - c.lastSeen > Net.DEAD_MS) { console.warn('Un dispositivo dejó de responder.'); drop(c); }
  }, Net.PING_MS);

  App.onChange(broadcast);
  App.onTyping(text => cast({ kind: 'typing', text: Net.cleanText(text) }));
  App.onToast(text => cast({ kind: 'toast', text: Net.cleanText(text) }));
  renderPanel();
  const saved = readRoom();
  if (saved) openRoom(saved);
  addEventListener('beforeunload', destroyPeer);
  window.LetrasRoom = { get code() { return code; }, get status() { return status; }, open: () => openRoom(null), close: closeRoom, watchers: watcherCount, seats: seatsView };
})();
