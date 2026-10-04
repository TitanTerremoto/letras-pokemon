/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · APP (DOM)
   Compartida por index.html (vertical) y horizontal.html. Cada layout sólo cambia CSS.
   Misma estructura que Buscaminas Pokémon: las animaciones salen de comparar el estado
   nuevo con el último dibujado, así funcionan igual si la respuesta se escribe en el
   juego o en el panel abierto en otra pestaña.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const DATA = window.LETRAS_DATA;
  if (!DATA) {
    document.body.innerHTML = '<p style="color:#fff;font:20px system-ui;padding:40px">Falta data/game-data.js. Corré <code>npm run build</code>.</p>';
    return;
  }
  const D = window.LetrasDomain, G = window.LetrasGame, A = window.BMAudio;
  const CFG = Object.assign({}, G.DEFAULTS, window.LETRAS_CONFIG || {});
  const OPTS = G.boardOpts(CFG);
  const IDX = D.buildIndex(DATA);
  const params = new URLSearchParams(location.search);
  const KEY = 'letras-state-v1';
  const up = s => String(s).toLocaleUpperCase('es');
  /* Nombres de jugador y texto escrito pueden venir de otra pantalla: siempre como texto. */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = s => document.querySelector(s);
  const el = {
    grid: $('.grid'), status: $('.status'), stamp: $('.stamp'), progress: $('.progress'), toast: $('.toast'),
    qText: $('.q-text'), qRule: $('.q-rule'), roundNo: $('.round-no'), chip: $('.head .chip'),
    players: [...document.querySelectorAll('.player')],
  };

  if (params.get('debug') === '1') document.body.classList.add('debug');
  if (params.get('nopanel') === '1') document.body.classList.add('nopanel');
  if (params.get('clean') === '1') document.body.classList.add('clean');
  const PANEL_ONLY = location.hash === '#panel';
  if (PANEL_ONLY) document.body.classList.add('panel-only');
  /* Espectador (index.html?espectador=CÓDIGO): sólo mira lo que manda la pantalla principal. */
  const SPECTATOR = window.LetrasNet ? window.LetrasNet.normalizeCode(params.get('espectador')) : null;
  if (SPECTATOR) document.body.classList.add('spectator', 'nopanel');

  /* ─────────── ESTADO + SINCRONIZACIÓN ENTRE PESTAÑAS (como PokeDuelo) ─────────── */
  const flags = c => ({ allowRetry: c.allowRetry, perfectBonus: c.perfectBonus, bombPenalty: c.bombPenalty, keepPointsOnBomb: c.keepPointsOnBomb, players: c.players, fuzzy: c.fuzzy });
  const sameBoard = s => ['minCards', 'maxCards', 'minValid'].every(k => s.config[k] === CFG[k]);
  const validState = s => G.isValidState(s, IDX) && s.dataBuiltAt === DATA.builtAt && sameBoard(s);
  const newMatch = seed => G.createMatch(IDX, DATA, { seed, config: CFG });
  let S = null;
  if (!SPECTATOR) {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (_) { S = null; }
  }
  const urlSeed = params.get('seed');
  if (SPECTATOR || !validState(S) || (urlSeed && S.seed !== urlSeed)) S = newMatch(SPECTATOR ? 'espera' : urlSeed || undefined);
  if (!SPECTATOR) S.config = Object.assign({}, S.config, flags(CFG));

  let bc = null;
  if (!SPECTATOR) {
    try { bc = new BroadcastChannel('letras-pokemon'); bc.onmessage = e => receive(e.data); } catch (_) { bc = null; }
    addEventListener('storage', e => { if (e.key === KEY && e.newValue) { try { receive(JSON.parse(e.newValue)); } catch (_) { /* estado ajeno ilegible: se ignora */ } } });
  }
  const changeListeners = [];
  function commit() {
    S.v = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* sin almacenamiento: sólo esta pestaña */ }
    try { if (bc) bc.postMessage(S); } catch (_) { /* sin canal: sólo esta pestaña */ }
    render();
    changeListeners.forEach(fn => fn(S));
  }
  function receive(ns) {
    if (ns && ns.v > (S.v || 0) && validState(ns)) { S = ns; render(); changeListeners.forEach(fn => fn(S)); }
  }

  /* ─────────── SPRITES (mismos de PokeDuelo / Buscaminas: PokeAPI/sprites) ─────────── */
  const spriteOf = id => (window.LETRAS_SPRITES && window.LETRAS_SPRITES[id]) || `assets/sprites/${id}.png`;
  const preloaded = new Map();
  function preload() {
    S.order.forEach(id => D.describeRound(IDX, id, OPTS).board.tiers.forEach(t => t.ids.forEach(pid => {
      if (preloaded.has(pid)) return;
      const img = new Image(); img.decoding = 'async'; img.src = spriteOf(pid);
      if (img.decode) img.decode().catch(() => {});
      preloaded.set(pid, img);
    })));
  }

  /* ─────────── ÍCONO (el del Buscaminas) ─────────── */
  const ICON_OK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8.5l4 4 8-9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ─────────── RENDER ─────────── */
  const view = { key: null, found: [], status: null, scores: [null, null], finished: false, first: true, statusHtml: '' };
  let cardEls = [];
  const LAYOUT = document.body.dataset.layout;

  function restart(node, cls) {
    node.classList.remove('a-pop', 'a-shake', 'a-rev', 'a-deal');
    void node.offsetWidth; // reinicia la animación CSS
    node.classList.add(cls);
  }
  /* Achica el texto hasta que entre en maxLines líneas y en su ancho (una vez por ronda). */
  function fitText(node, min, maxLines) {
    node.style.fontSize = '';
    const cs = getComputedStyle(node);
    let size = parseFloat(cs.fontSize);
    const lh = (parseFloat(cs.lineHeight) || size * 1.1) / size;
    const tooBig = () => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > size * lh * (maxLines + 0.5);
    while (tooBig() && size > min) { size -= 1; node.style.fontSize = size + 'px'; }
  }
  function restartTurn(p) {
    const t = p.querySelector('.turn');
    t.classList.remove('flip'); void t.offsetWidth; t.classList.add('flip');
  }

  /* Reparte las cartas de la ronda para aprovechar la zona (js/layout.js) y escala su contenido con --k.
     El padding lateral fuerza exactamente `cols` cartas por fila; la última fila queda centrada. */
  const K_MAX = 1.8;
  function layoutGrid(n) {
    const g = el.grid;
    g.style.paddingInline = '';
    const cs = getComputedStyle(g);
    const W = g.clientWidth, H = g.clientHeight;
    const gx = parseFloat(cs.columnGap) || 0, gy = parseFloat(cs.rowGap) || 0;
    const L = window.LetrasLayout.bestLayout(n, W, H, gx, gy, K_MAX);
    const rowW = L.cols * L.cardW + (L.cols - 1) * gx;
    g.style.setProperty('--k', L.k.toFixed(3));
    g.style.setProperty('--cw', `${Math.floor(L.cardW)}px`);
    g.style.setProperty('--ch', `${Math.floor(L.cardH)}px`);
    g.style.paddingInline = `${Math.max(0, Math.floor((W - rowW) / 2))}px`;
    g.dataset.layout = `${L.cols}x${L.rows}`;
  }

  function buildGrid(animate) {
    el.grid.innerHTML = S.round.cards.map((id, i) => {
      const p = IDX.byId.get(id), name = up(p.name);
      const slots = Array.from({ length: p.len }, (_, k) => k === 0 ? '<i class="first"></i>' : '<i></i>').join('');
      return `<div class="card" data-id="${id}" style="--d:${i * 35}ms">
        <span class="tint"></span>
        <span class="art"><span class="ball"></span><img src="${spriteOf(id)}" alt="" width="96" height="96" decoding="async"></span>
        <span class="slots">${slots}</span>
        <span class="name${name.length > 11 ? ' long' : ''}">${name}</span>
        <span class="badge b-ok">${ICON_OK}<em style="font-style:normal">CORRECTO</em></span>
        <span class="detail">${p.len} LETRAS</span>
      </div>`;
    }).join('');
    cardEls = [...el.grid.children];
    layoutGrid(cardEls.length);
    cardEls.forEach(c => {
      // El nombre se mide visible (si no, no tiene ancho) y vuelve a ocultarse.
      c.classList.add('open');
      fitText(c.querySelector('.name'), 12, 2);
      c.classList.remove('open');
      if (animate) restart(c, 'a-deal');
    });
    el.grid.classList.remove('celebrate');
  }

  function updateGrid(prevFound, justEnded, animate) {
    const r = S.round, ended = r.status !== 'playing';
    el.grid.classList.toggle('done', ended);
    if (!ended) el.grid.classList.remove('celebrate');
    if (justEnded && r.status === 'perfect') el.grid.classList.add('celebrate');
    let n = 0;
    cardEls.forEach(c => {
      const id = +c.dataset.id, found = r.found.includes(id), show = found || ended;
      c.classList.toggle('open', show);
      c.classList.toggle('ok', show);
      c.classList.toggle('picked', found);
      c.classList.toggle('rev', ended && !found);
      c.querySelector('.b-ok em').textContent = found ? S.config.players[r.by[id]] : 'FALTÓ';
      c.querySelector('.first').textContent = '';
      if (animate && found && !prevFound.includes(id)) restart(c, 'a-pop');
      if (justEnded && !found) { c.style.setProperty('--d', `${(r.status === 'bomb' ? 420 : 200) + n++ * 70}ms`); restart(c, 'a-rev'); }
    });
  }

  function renderPlayers(animate) {
    el.players.forEach((p, i) => {
      const on = S.active === i && !S.finished && S.round.status === 'playing';
      if (animate && on && !p.classList.contains('active')) restartTurn(p);
      p.classList.toggle('active', on);
      p.querySelector('.pname').textContent = S.config.players[i];
      const score = p.querySelector('.pscore');
      score.textContent = S.scores[i];
      if (animate && view.scores[i] !== null && view.scores[i] !== S.scores[i]) { score.classList.remove('bump'); void score.offsetWidth; score.classList.add('bump'); }
      p.querySelector('.phist').innerHTML = S.history.slice(-12)
        .map(h => `<i class="${h.bomber === i ? 'bomb' : h.result === 'perfect' ? 'perfect' : ''}" title="Ronda ${h.index + 1}">${h.pointsBy[i]}</i>`).join('');
    });
  }

  function renderHead(def) {
    el.roundNo.textContent = `RONDA ${S.index + 1} / ${S.order.length}`;
    el.chip.textContent = def.ext === 'min' ? 'MÁS CORTO' : 'MÁS LARGO';
    el.chip.className = `chip ${def.ext}`;
    const results = Object.fromEntries(S.history.map(h => [h.index, h.result]));
    el.progress.innerHTML = S.order.map((_, i) => {
      const res = results[i];
      const cls = res === 'perfect' ? 'perfect' : res === 'bomb' ? 'bomb' : i === S.index && !S.finished ? 'current' : '';
      return `<i class="${cls}"></i>`;
    }).join('');
  }

  function renderQuestion(def, fresh) {
    if (!fresh && el.qText.dataset.id === def.id) return;
    el.qText.dataset.id = def.id;
    el.qText.textContent = def.question;
    el.qRule.textContent = def.rule;
    // Primero se intenta en una línea sin bajar de 26px; si no entra, vertical admite dos.
    fitText(el.qText, 26, 1);
    const size = parseFloat(el.qText.style.fontSize || getComputedStyle(el.qText).fontSize);
    const oneLine = el.qText.scrollHeight <= size * 1.6 && el.qText.scrollWidth <= el.qText.clientWidth + 1;
    if (LAYOUT === 'vertical' && !oneLine) fitText(el.qText, 18, 2);
  }

  function renderStatus(animate) {
    const r = S.round;
    const last = S.index + 1 >= S.order.length;
    let html;
    const P = S.config.players.map(esc);
    if (S.finished) {
      html = `<div class="result perfect outline">PARTIDA TERMINADA</div>${SPECTATOR ? '' : '<div class="actions"><button class="btn go" data-act="new">NUEVA PARTIDA</button></div>'}`;
    } else if (r.status === 'playing') {
      // El espectador ve la misma casilla, de sólo lectura, con lo que se está escribiendo.
      const field = SPECTATOR
        ? '<input id="answer" type="text" readonly tabindex="-1" placeholder="POKÉMON…" aria-label="Respuesta en curso">'
        : `<input id="answer" type="text" spellcheck="false" autocapitalize="characters" enterkeyhint="send" placeholder="POKÉMON…" aria-label="Respuesta de ${P[S.active]}"><button class="btn go" type="submit">OK</button>`;
      html = `<div class="turnlbl outline">TURNO: <b>${P[S.active]}</b></div>
        <form class="answer" autocomplete="off">${field}</form>
        <div class="count outline"><b>${r.found.length}</b> / ${r.cards.length}</div>`;
    } else {
      const split = `<small>${P[0]} +${r.pointsBy[0]} · ${P[1]} +${r.pointsBy[1]}</small>`;
      const txt = r.status === 'perfect' ? `¡TABLERO LIMPIO!${split}` : `¡BOMBA DE ${P[r.bomber]}!${split}`;
      html = `<div class="result ${r.status} outline">${txt}</div>${SPECTATOR ? '' : `<div class="actions">
        ${S.config.allowRetry ? '<button class="btn retry" data-act="retry">REINTENTAR RONDA</button>' : ''}
        <button class="btn go" data-act="next">${last ? 'VER RESULTADO' : 'CONTINUAR'}</button></div>`}`;
    }
    // La fila se reconstruye sólo si cambió algo (turno, contador o resultado).
    if (html === view.statusHtml) return;
    const kindChanged = (view.status === 'playing') !== (r.status === 'playing') || view.finished !== S.finished;
    view.statusHtml = html;
    el.status.innerHTML = html;
    const input = $('#answer');
    typingText = '';
    if (input && !PANEL_ONLY && !SPECTATOR) input.focus({ preventScroll: true });
    if (!input && document.activeElement && document.activeElement !== document.body && !PANEL_ONLY && !panel.contains(document.activeElement)) document.activeElement.blur();
    if (animate && kindChanged) [...el.status.children].forEach((c, i) => { c.classList.add('enter'); c.style.animationDelay = `${250 + i * 120}ms`; });
  }

  function showStamp(kind, html) {
    el.stamp.className = 'stamp';
    el.stamp.innerHTML = html;
    void el.stamp.offsetWidth;
    if (kind === 'final') el.stamp.classList.add('final', 'stay');
    else el.stamp.classList.add(kind, 'show', ...(kind === 'perfect' ? ['big'] : []));
  }

  let typingText = '';
  const typingListeners = [], toastListeners = [];
  /* Lo que se escribe (acá, en un celular o en la pantalla principal vista por un espectador). */
  function setTyping(text) {
    typingText = String(text || '').slice(0, 40);
    const input = $('#answer');
    if (input && input.value !== typingText) input.value = typingText;
  }

  function toast(text) {
    toastListeners.forEach(fn => fn(text));
    el.toast.textContent = text;
    el.toast.classList.remove('show'); void el.toast.offsetWidth; el.toast.classList.add('show');
    const form = el.status.querySelector('.answer');
    if (form) restart(form, 'a-shake');
  }

  function render() {
    const r = S.round, def = D.describeRound(IDX, r.id, OPTS);
    const key = `${S.index}|${r.attempt}|${r.id}`;
    const fresh = key !== view.key, animate = !view.first;
    const prevFound = fresh ? r.found : view.found;
    const justEnded = animate && !fresh && view.status === 'playing' && r.status !== 'playing';

    renderPlayers(animate);
    renderHead(def);
    renderQuestion(def, fresh);
    if (fresh) buildGrid(animate);
    updateGrid(prevFound, justEnded, animate);
    renderStatus(animate);

    const P = S.config.players.map(esc);
    if (justEnded && r.status === 'perfect') {
      showStamp('perfect', `¡TABLERO LIMPIO!<small>${P[0]} +${r.pointsBy[0]} · ${P[1]} +${r.pointsBy[1]}</small>`);
      A.play('perfect');
    } else if (justEnded && r.status === 'bomb') {
      const p = IDX.byId.get(r.bomb.id);
      showStamp('bomb', `¡BOMBA!<small>${P[r.bomber]} DIJO</small><span class="word">${up(p.name)}</span><small>${r.bomb.reason}</small>`);
      A.play('bomb');
    } else if (animate && !fresh && r.found.length > view.found.length && r.status === 'playing') A.play('correct');
    if (S.finished && (!view.finished || view.first)) {
      const w = G.winner(S);
      showStamp('final', `${w < 0 ? '¡EMPATE!' : `¡GANA ${P[w]}!`}<small>${P[0]} ${S.scores[0]} · ${P[1]} ${S.scores[1]}</small>`);
      if (!animate) el.stamp.classList.add('noanim');
    } else if (!S.finished && (fresh || view.finished)) el.stamp.className = 'stamp';
    if (fresh && animate && !S.finished) A.play('nextRound');

    Object.assign(view, { key, found: r.found.slice(), status: r.status, scores: S.scores.slice(), finished: S.finished, first: false });
    renderPanel(def);
  }

  /* ─────────── ACCIONES ─────────── */
  const answerMsg = res => {
    if (res.type === 'unknown') return `NO ESTÁ EN LA POKÉDEX: ${up(res.text)}`;
    if (res.type === 'repeat') return `${up(IDX.byId.get(res.id).name)} YA ESTÁ`;
    return '';
  };
  const act = {
    answer: text => {
      if (SPECTATOR || !text.trim()) return '';
      const res = G.answer(S, IDX, text);
      if (res.type === 'unknown' || res.type === 'repeat') { const m = answerMsg(res); toast(m); return m; }
      if (res.type !== 'ignored') commit();
      return res.fuzzy ? `Entendido: ${IDX.byId.get(res.id).name}` : '';
    },
    /* Respuesta desde un celular: vale sólo en el turno de ese asiento. */
    answerFrom: (seat, text) => {
      if (S.finished || S.round.status !== 'playing') return 'La ronda no está en juego.';
      if (seat !== S.active) return `Ahora responde ${S.config.players[S.active]}.`;
      setTyping('');
      return act.answer(text);
    },
    next: () => { if (G.next(S, IDX)) commit(); },
    retry: () => { if (G.retry(S, IDX)) commit(); },
    skip: () => { if (G.next(S, IDX, { force: true })) commit(); },
    prev: () => { if (G.prev(S, IDX)) commit(); },
    swap: () => { G.setActive(S, 1 - S.active); commit(); },
    undo: () => { if (G.undo(S, IDX)) commit(); },
    setActive: i => { G.setActive(S, i); commit(); },
    adjust: (i, d) => { G.adjustScore(S, i, d); commit(); },
    resetScores: () => { if (confirm('¿Poner los dos marcadores en 0?')) { G.resetScores(S); commit(); } },
    newMatch: seed => {
      if (!confirm('¿Empezar una partida nueva? Se pierde la actual.')) return;
      const v = S.v; S = newMatch(seed || undefined); S.v = v; view.key = null; view.first = true; preload(); commit();
    },
  };

  el.status.addEventListener('input', e => {
    if (e.target.id !== 'answer') return;
    typingText = e.target.value;
    typingListeners.forEach(fn => fn(typingText));
  });
  el.status.addEventListener('submit', e => {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const text = input.value;
    input.value = '';
    act.answer(text);
    typingListeners.forEach(fn => fn(''));
    const again = $('#answer');
    if (again && !PANEL_ONLY) again.focus({ preventScroll: true });
  });
  el.status.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    b.blur();
    if (b.dataset.act === 'next') act.next();
    else if (b.dataset.act === 'retry') act.retry();
    else if (b.dataset.act === 'new') act.newMatch();
  });

  /* ─────────── PANEL DE CONTROL (no se graba) ─────────── */
  const panel = $('#panel');
  panel.innerHTML = `
    <header><h2>⚙ Panel · Letras Pokémon</h2>
      <div class="line"><button id="b-sound" title="Silenciar (M)">🔊</button><button id="b-pop" title="Abrir el panel en otra pestaña">↗ Pestaña</button></div></header>
    <section><h3>Respuesta</h3>
      <div class="line"><input id="p-answer" placeholder="Lo que dijo el jugador + Enter"><button class="primary" id="b-answer">Responder</button></div>
      <div class="muted" id="p-msg" style="min-height:18px;margin-top:4px"></div>
      <label>Dichos en esta ronda</label><div id="p-log" class="muted"></div>
    </section>
    <section><h3>Partida</h3>
      <div class="muted">Seed <b id="p-seed"></b> · ronda <b id="p-round"></b> · <span id="p-ext"></span></div>
      <div class="line" style="margin-top:8px"><button id="b-prev" title="←">◀ Anterior</button><button id="b-retry" title="T">↺ Reintentar</button><button id="b-skip" title="→">Siguiente ▶</button></div>
      <label>Nueva partida (seed opcional, para reproducirla)</label>
      <div class="line"><input id="p-seed-in" placeholder="p. ej. 12345"><button class="danger" id="b-new">Nueva partida</button></div>
    </section>
    <section><h3>Jugadores</h3>
      ${[0, 1].map(i => `<div class="line" style="margin-bottom:6px"><button data-active="${i}" style="min-width:90px"></button>
        <button data-adj="${i}:-1">−</button><span class="score" data-score="${i}"></span><button data-adj="${i}:1">+</button></div>`).join('')}
      <div class="line"><button id="b-swap" title="J">⇄ Cambiar turno</button><button id="b-undo" title="U">↶ Deshacer respuesta</button><button class="danger" id="b-reset">Reset score</button></div>
      <div class="muted" style="margin-top:6px">Tablero compartido: cada uno responde una vez y pasa el turno.</div>
    </section>
    <section><h3>Solución (no se graba)</h3>
      <button id="b-sol">Mostrar / ocultar</button><div id="p-sol" class="muted" hidden></div>
    </section>
    <section id="debug"><h3>Debug</h3><div id="dbg"></div></section>
    <footer><kbd>R</kbd> grabación 1:1 · <kbd>G</kbd> guías · <kbd>P</kbd> panel · <kbd>M</kbd> mute · <kbd>D</kbd> debug<br>
      <kbd>Enter</kbd>/<kbd>Espacio</kbd> continuar · <kbd>T</kbd> reintentar · <kbd>J</kbd> cambiar turno · <kbd>U</kbd> deshacer respuesta ·
      <kbd>←</kbd>/<kbd>→</kbd> ronda anterior/siguiente · <kbd>+</kbd>/<kbd>−</kbd> puntaje del jugador activo<br>
      Las teclas funcionan con la casilla de respuesta sin foco (<kbd>Esc</kbd> la suelta).</footer>`;
  const pq = s => panel.querySelector(s);
  const panelAnswer = () => {
    const input = pq('#p-answer'), text = input.value;
    input.value = '';
    pq('#p-msg').textContent = act.answer(text);
  };
  pq('#b-answer').onclick = panelAnswer;
  pq('#p-answer').addEventListener('keydown', e => { if (e.key === 'Enter') panelAnswer(); });
  pq('#b-sound').onclick = () => { A.setMuted(!A.isMuted()); updateSound(); };
  pq('#b-pop').onclick = () => window.open(location.href.split('#')[0] + '#panel', '_blank');
  pq('#b-prev').onclick = act.prev;
  pq('#b-retry').onclick = act.retry;
  pq('#b-skip').onclick = act.skip;
  pq('#b-new').onclick = () => act.newMatch(pq('#p-seed-in').value.trim());
  pq('#b-swap').onclick = act.swap;
  pq('#b-undo').onclick = act.undo;
  pq('#b-reset').onclick = act.resetScores;
  pq('#b-sol').onclick = () => { pq('#p-sol').hidden = !pq('#p-sol').hidden; };
  panel.addEventListener('click', e => {
    const a = e.target.closest('[data-active]'), d = e.target.closest('[data-adj]');
    if (a) act.setActive(+a.dataset.active);
    if (d) { const [i, v] = d.dataset.adj.split(':').map(Number); act.adjust(i, v); }
  });
  function updateSound() { pq('#b-sound').textContent = A.isMuted() ? '🔇' : '🔊'; }

  function renderPanel(def) {
    const P = S.config.players, r = S.round;
    pq('#p-seed').textContent = S.seed;
    pq('#p-round').textContent = `${S.index + 1}/${S.order.length}${S.finished ? ' (terminada)' : ''}`;
    pq('#p-ext').textContent = `${def.cat.label} · más ${def.ext === 'min' ? 'corto' : 'largo'}`;
    pq('#b-retry').disabled = !S.config.allowRetry;
    pq('#p-answer').disabled = S.finished || r.status !== 'playing';
    pq('#p-log').textContent = r.log.length
      ? r.log.map(s => `${s.ok ? '✓' : '💣'} ${IDX.byId.get(s.id).name} (${P[s.player]})`).join(' · ')
      : '—';
    [0, 1].forEach(i => {
      const b = pq(`[data-active="${i}"]`);
      b.textContent = (S.active === i ? '▶ ' : '') + P[i];
      b.classList.toggle('on', S.active === i);
      pq(`[data-score="${i}"]`).textContent = S.scores[i];
    });
    pq('#p-sol').innerHTML = def.board.tiers.map(t => `<div><b>${t.len} letras:</b> ${t.ids.map(id => IDX.byId.get(id).name).join(', ')}</div>`).join('');
    if (!document.body.classList.contains('debug')) return;
    const nextId = S.order[S.index + 1] || '—', prevId = S.order[S.index - 1] || '—';
    pq('#dbg').innerHTML = `
      <div><b>${def.id}</b> · seed ${esc(S.seed)} · activo: ${esc(P[S.active])}</div>
      <div class="muted">anterior: ${prevId} · siguiente: ${nextId} · ${def.board.pool} Pokémon en la categoría</div>
      <pre>${JSON.stringify({ tiers: def.board.tiers.map(t => [t.len, t.ids.length]), found: r.found, log: r.log }, null, 1)}</pre>
      <p class="muted">Datos ${DATA.builtAt}<br>${DATA.source}</p>`;
  }

  /* ─────────── ESCALA / TECLAS ─────────── */
  const reel = $('#reel');
  const cssPx = v => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(v));
  function fit() {
    if (document.body.classList.contains('rec')) { reel.style.transform = ''; return; }
    const h = ['--h-banner-top', '--h-cams', '--h-game', '--h-banner-bottom'].reduce((a, v) => a + cssPx(v), 0);
    const s = Math.min(innerWidth / cssPx('--reel-w'), innerHeight / h, 1);
    reel.style.transform = `translate(-50%,-50%) scale(${s})`;
  }
  addEventListener('resize', fit);

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && e.target.id === 'answer') { e.target.blur(); return; }
    if (e.target.closest('input,textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const ended = S.round.status !== 'playing';
    if (SPECTATOR && !['r', 'g', 'm'].includes(k)) return; // el espectador sólo mira
    if (k === 'r') { document.body.classList.toggle('rec'); scrollTo(0, 0); fit(); }
    else if (k === 'g') document.body.classList.toggle('clean');
    else if (k === 'p') document.body.classList.toggle('nopanel');
    else if (k === 'd') { document.body.classList.toggle('debug'); render(); }
    else if (k === 'm') { A.setMuted(!A.isMuted()); updateSound(); }
    else if (k === 'enter' || k === ' ') {
      e.preventDefault();
      if (S.finished) act.newMatch();
      else if (ended) act.next();
      else if ($('#answer')) $('#answer').focus({ preventScroll: true });
    }
    else if (k === 't') { if (ended) act.retry(); }
    else if (k === 'j') act.swap();
    else if (k === 'u' || k === 'backspace') act.undo();
    else if (k === 'arrowright') act.skip();
    else if (k === 'arrowleft') act.prev();
    else if (k === '+' || k === '=') act.adjust(S.active, 1);
    else if (k === '-' || k === '_') act.adjust(S.active, -1);
  });

  A.init(CFG.audio);
  updateSound();
  if (document.fonts) document.fonts.ready.then(() => { view.key = null; view.first = true; view.statusHtml = ''; render(); });
  fit();
  preload();
  render();
  window.LP = { get state() { return S; }, index: IDX, render, act }; // para depurar desde la consola

  /* Lo que usan la sala en línea (js/net-host.js) y la pantalla de espectador (js/net-spectator.js). */
  window.LetrasApp = {
    spectator: SPECTATOR,
    layout: LAYOUT,
    panel,
    get state() { return S; },
    answerFrom: act.answerFrom,
    setTyping,
    toast,
    onChange: fn => changeListeners.push(fn),
    onTyping: fn => typingListeners.push(fn),
    onToast: fn => toastListeners.push(fn),
    /* Espectador: foto que llega de la pantalla principal (validada antes de dibujarla). */
    applyRemote(ns) {
      if (!SPECTATOR || !validState(ns)) return false;
      S = ns;
      render();
      return true;
    },
    /* Cartel central fijo (kind 'final') o ninguno (kind null). */
    stamp: (kind, text) => { if (kind) showStamp(kind, esc(text)); else el.stamp.className = 'stamp'; },
  };
})();
