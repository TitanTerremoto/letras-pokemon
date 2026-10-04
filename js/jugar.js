/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · CELULAR DEL JUGADOR (jugar.html?sala=CÓDIGO)
   Elige lado, muestra la partida y manda respuestas sólo en su turno.
   Mientras escribe, la pantalla principal y los espectadores ven lo que escribe.
   La autoridad es la pantalla principal: acá nada decide si una respuesta es correcta.
   Todo lo que llega de la sala se valida y se dibuja como texto.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const Net = window.LetrasNet, D = window.LetrasDomain, G = window.LetrasGame;
  const IDX = D.buildIndex(window.LETRAS_DATA);
  const CFG = Object.assign({}, G.DEFAULTS, window.LETRAS_CONFIG || {});
  const OPTS = G.boardOpts(CFG);
  const $ = id => document.getElementById(id);
  const up = s => String(s).toLocaleUpperCase('es');
  const show = view => ['v-code', 'v-seat', 'v-game'].forEach(v => { $(v).hidden = v !== view; });
  const ICON_OK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const code = Net.normalizeCode(new URLSearchParams(location.search).get('sala'));
  if (!code) {
    show('v-code');
    $('codeForm').addEventListener('submit', e => {
      e.preventDefault();
      const c = Net.normalizeCode($('codeIn').value);
      if (!c) { $('codeMsg').textContent = `El código tiene ${Net.CODE_LENGTH} letras o números.`; return; }
      location.search = `?sala=${c}`;
    });
    return;
  }

  /* Lado elegido y token (para recuperar el lugar al recargar o reconectar). */
  const SEAT_KEY = `letras-seat-${code}`;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SEAT_KEY)); } catch (_) { saved = null; }
  let token = saved && Net.isToken(saved.token) ? saved.token : Net.newToken();
  let wantSeat = saved && Net.isSeat(saved.seat) ? saved.seat : null;
  let mySeat = null, game = null, seats = [false, false], lastKey = null;
  const remember = () => { try { localStorage.setItem(SEAT_KEY, JSON.stringify({ seat: wantSeat, token })); } catch (_) { /* sin almacenamiento: se elige de nuevo al recargar */ } };

  const statusEl = $('status');
  const client = window.LetrasClient.connect(code, {
    onOpen: () => { if (wantSeat != null) client.send({ t: 'join', seat: wantSeat, token }); },
    onStatus(kind, text) { statusEl.className = `ph-status ${kind}`; statusEl.textContent = kind === 'online' ? `Sala ${code}` : text; },
    onMessage(msg) {
      switch (msg.t) {
        case 'state':
          if (!G.isValidState(msg.game, IDX)) return console.warn('Estado de la sala inválido: se ignora.');
          game = msg.game;
          seats = Array.isArray(msg.seats) ? msg.seats.map(Boolean) : [false, false];
          mySeat = Net.isSeat(msg.you) ? msg.you : null;
          return render();
        case 'joined': mySeat = msg.seat; $('note').textContent = ''; return render();
        case 'kicked':
          mySeat = null; wantSeat = null; remember();
          $('seatMsg').textContent = 'Tu lado se abrió en otro dispositivo.';
          return render();
        case 'error': case 'note':
          if (typeof msg.msg !== 'string') return;
          if (mySeat == null) $('seatMsg').textContent = msg.msg; else $('note').textContent = msg.msg;
          return;
        default: return;
      }
    },
  });

  /* ── Elegir lado ── */
  function renderSeats() {
    const box = $('seats');
    box.replaceChildren(...[0, 1].map(i => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ph-seat outline';
      b.textContent = game.config.players[i];
      const small = document.createElement('small');
      small.textContent = i === 0 ? 'IZQUIERDA' : 'DERECHA';
      if (seats[i]) small.textContent += ' · OCUPADO';
      b.append(small);
      b.disabled = seats[i];
      b.onclick = () => { wantSeat = i; remember(); $('seatMsg').textContent = 'Conectando…'; client.send({ t: 'join', seat: i, token }); };
      return b;
    }));
  }
  $('leave').onclick = () => { client.send({ t: 'leave' }); mySeat = null; wantSeat = null; remember(); render(); };

  /* ── Partida ── */
  function render() {
    if (!game) return;
    if (mySeat == null) { show('v-seat'); renderSeats(); return; }
    show('v-game');
    const P = game.config.players, r = game.round, def = D.describeRound(IDX, r.id, OPTS);
    const playing = !game.finished && r.status === 'playing', mine = playing && game.active === mySeat;

    $('score').replaceChildren(...[0, 1].map(i => {
      const d = document.createElement('div');
      d.className = `${game.active === i && playing ? 'active' : ''} ${i === mySeat ? 'me' : ''}`;
      const n = document.createElement('span'); n.textContent = P[i];
      const s = document.createElement('b'); s.textContent = game.scores[i];
      d.append(n, s);
      return d;
    }));
    $('round').textContent = `RONDA ${game.index + 1} / ${game.order.length}`;
    $('chip').textContent = def.ext === 'min' ? 'MÁS CORTO' : 'MÁS LARGO';
    $('chip').className = `chip ${def.ext}`;
    $('qText').textContent = def.question;
    $('qRule').textContent = def.rule;

    const turn = $('turn');
    if (game.finished) {
      const w = G.winner(game);
      turn.className = 'ph-turn outline perfect';
      turn.textContent = w < 0 ? '¡EMPATE!' : `¡GANA ${P[w]}!`;
    } else if (r.status === 'bomb') {
      turn.className = 'ph-turn outline bomb';
      turn.textContent = `¡BOMBA! ${P[r.bomber]} DIJO ${up(IDX.byId.get(r.bomb.id).name)} · ${r.bomb.reason}`;
    } else if (r.status === 'perfect') {
      turn.className = 'ph-turn outline perfect';
      turn.textContent = '¡TABLERO LIMPIO!';
    } else {
      turn.className = `ph-turn outline ${mine ? 'mine' : ''}`;
      turn.textContent = mine ? '¡TE TOCA!' : `TURNO DE ${P[game.active]}`;
    }
    const input = $('answer');
    input.disabled = !mine;
    $('answerForm').querySelector('button').disabled = !mine;
    input.placeholder = mine ? 'POKÉMON…' : playing ? 'ESPERÁ TU TURNO' : 'ESPERANDO A LA PANTALLA…';
    const key = `${game.index}|${r.attempt}|${r.found.length}|${game.active}|${r.status}`;
    if (key !== lastKey) {
      lastKey = key;
      input.value = '';
      if (mine) { input.focus({ preventScroll: true }); if (navigator.vibrate) navigator.vibrate(60); }
      $('note').textContent = playing || game.finished ? '' : 'La pantalla principal sigue con la próxima ronda.';
    }
    renderGrid(r);
  }

  function renderGrid(r) {
    const ended = r.status !== 'playing';
    $('grid').replaceChildren(...r.cards.map(id => {
      const p = IDX.byId.get(id), found = r.found.includes(id), open = found || ended;
      const c = document.createElement('div');
      c.className = `card${open ? ' open ok' : ''}${ended && !found ? ' rev' : ''}`;
      c.innerHTML = '<span class="tint"></span><span class="detail"></span><span class="art"><span class="ball"></span><img alt=""></span><span class="slots"></span><span class="name"></span>';
      c.querySelector('.detail').textContent = `${p.len} LETRAS`;
      if (open) {
        c.querySelector('img').src = `assets/sprites/${id}.png`;
        c.querySelector('.name').textContent = up(p.name);
        if (found) {
          const b = document.createElement('span');
          b.className = 'badge b-ok';
          b.innerHTML = ICON_OK;
          const who = document.createElement('em'); who.style.fontStyle = 'normal'; who.textContent = game.config.players[r.by[id]];
          b.append(who);
          c.append(b);
        }
      } else {
        c.querySelector('.slots').innerHTML = Array.from({ length: p.len }, (_, k) => k ? '<i></i>' : '<i class="first"></i>').join('');
      }
      return c;
    }));
  }

  /* ── Responder ── */
  let typingTimer = null;
  $('answer').addEventListener('input', e => {
    clearTimeout(typingTimer);
    const text = e.target.value;
    typingTimer = setTimeout(() => client.send({ t: 'typing', text: Net.cleanText(text) }), 80);
  });
  $('answerForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('answer'), text = input.value.trim();
    if (!text || input.disabled) return;
    clearTimeout(typingTimer);
    $('note').textContent = '';
    if (!client.send({ t: 'answer', text: Net.cleanText(text) })) { $('note').textContent = 'Sin conexión: reintentando…'; return; }
    input.value = '';
    client.send({ t: 'typing', text: '' });
  });
})();
