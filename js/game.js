/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · LÓGICA DE PARTIDA (sin DOM)
   Mismas reglas que Buscaminas Pokémon en modo "un clic cada uno":
   SKY y GUTI completan el MISMO tablero alternándose respuesta a respuesta.
   · Acierto: +1 para quien lo nombró, se da vuelta la carta y pasa el turno.
   · Error (otro largo u otra categoría) = BOMBA: termina la ronda y se revela todo.
   · Nombre inexistente o ya dicho: no cuenta, sigue el mismo jugador.
   · Si se completan todas las cartas: ¡TABLERO LIMPIO!
   Quién abre la ronda se alterna ronda a ronda.
   Estado serializable en JSON (localStorage + sincronización entre pestañas).
   ═══════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./letters.js'));
  else root.LetrasGame = factory(root.LetrasDomain);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const DEFAULTS = {
    players: ['SKY', 'GUTI'], startingPlayer: 0, totalRounds: 12, allowRetry: true,
    perfectBonus: 0, bombPenalty: 0, keepPointsOnBomb: true,
    minCards: 6, maxCards: 12, minValid: 3, fuzzy: true,
  };
  const boardOpts = cfg => ({ minCards: cfg.minCards, maxCards: cfg.maxCards, minValid: cfg.minValid });

  /* Orden de rondas: sin repetir, sin la misma categoría seguida y alternando corto/largo cuando se puede. */
  function buildOrder(index, seed, cfg) {
    const rand = D.rng(`${seed}:order`);
    const pool = D.shuffle(D.roundBank(index, boardOpts(cfg)), rand);
    const n = Math.min(cfg.totalRounds, pool.length);
    const order = [];
    for (let i = 0; i < n; i++) {
      const prev = order.length ? D.parseRoundId(order[order.length - 1]) : null;
      let best = null, bestScore = -Infinity;
      for (const id of pool) {
        if (order.includes(id)) continue;
        const r = D.parseRoundId(id);
        const score = (prev && prev.ext !== r.ext ? 4 : 0) - (prev && prev.cat.kind === r.cat.kind ? 2 : 0) + rand();
        if (score > bestScore) { best = id; bestScore = score; }
      }
      order.push(best);
    }
    return order;
  }

  /* Cartas de la ronda: por escalón de letras; dentro de cada escalón, en orden aleatorio. */
  function dealCards(index, roundId, seed, roundNo, attempt, cfg) {
    const def = D.describeRound(index, roundId, boardOpts(cfg));
    const rand = D.rng(`${seed}:deal:${roundNo}:${attempt}`);
    return def.board.tiers.flatMap(t => D.shuffle(t.ids, rand));
  }

  const starterFor = (state, roundNo) => (state.config.startingPlayer + roundNo) % 2;

  function freshRound(state, index, attempt) {
    const id = state.order[state.index];
    state.active = starterFor(state, state.index);
    return {
      id, cards: dealCards(index, id, state.seed, state.index, attempt, state.config),
      found: [], by: {}, log: [], status: 'playing', bomb: null, bomber: null,
      starter: state.active, attempt, points: 0, pointsBy: [0, 0], scoresBefore: state.scores.slice(),
    };
  }

  function createMatch(index, data, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts && opts.config);
    const seed = String(opts && opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
    const state = {
      version: 1, dataBuiltAt: data.builtAt, seed, config: cfg,
      order: buildOrder(index, seed, cfg), index: 0, scores: [0, 0],
      active: cfg.startingPlayer, history: [], finished: false, round: null,
    };
    state.round = freshRound(state, index, 0);
    return state;
  }

  function addPoints(state, player, n) {
    const r = state.round;
    state.scores[player] += n;
    r.pointsBy[player] += n;
    r.points += n;
  }

  /* Por qué una respuesta es bomba (texto para el cartel). */
  function bombReason(index, p, roundId, cfg) {
    const def = D.describeRound(index, roundId, boardOpts(cfg));
    if (!D.inCategory(p, def.cat)) {
      return def.cat.kind === 'gen'
        ? `ES DE ${D.REGIONS[p.gen - 1].toLocaleUpperCase('es')}`
        : `ES ${p.types.map(t => D.TYPES[t - 1].toLocaleUpperCase('es')).join('/')}`;
    }
    return `TIENE ${p.len} LETRAS`;
  }

  /* Respuesta del jugador activo (texto libre). */
  function answer(state, index, text) {
    const r = state.round;
    if (state.finished || r.status !== 'playing') return { type: 'ignored' };
    const hit = D.lookup(index, text, state.config.fuzzy);
    if (!hit) return { type: 'unknown', text };
    const open = hit.matches.find(p => r.cards.includes(p.id) && !r.found.includes(p.id));
    if (open) return resolve(state, index, open.id, hit.fuzzy);
    const p = hit.matches[0];
    if (r.cards.includes(p.id)) return { type: 'repeat', id: p.id, fuzzy: hit.fuzzy };
    return resolve(state, index, p.id, hit.fuzzy);
  }

  /* Aplica una respuesta ya reconocida (id de Pokémon). También la usa undo() para rehacer. */
  function resolve(state, index, id, fuzzy) {
    const r = state.round;
    const player = state.active;
    if (r.cards.includes(id)) {
      r.found.push(id);
      r.by[id] = player;
      r.log.push({ id, player, ok: true });
      addPoints(state, player, 1);
      if (r.found.length === r.cards.length) {
        r.status = 'perfect';
        addPoints(state, player, state.config.perfectBonus);
        record(state);
        return { type: 'perfect', id, player, fuzzy };
      }
      state.active = 1 - player;
      return { type: 'correct', id, player, fuzzy };
    }
    const p = index.byId.get(id);
    r.log.push({ id, player, ok: false });
    r.status = 'bomb';
    r.bomb = { id, reason: bombReason(index, p, r.id, state.config) };
    r.bomber = player;
    if (!state.config.keepPointsOnBomb) addPoints(state, player, -r.pointsBy[player]);
    if (state.config.bombPenalty) addPoints(state, player, -state.config.bombPenalty);
    record(state);
    return { type: 'bomb', id, player, fuzzy };
  }

  function record(state) {
    const r = state.round;
    state.history = state.history.filter(h => h.index !== state.index);
    state.history.push({
      index: state.index, roundId: r.id, starter: r.starter, points: r.points, pointsBy: r.pointsBy.slice(),
      result: r.status, bomber: r.bomber, scoresBefore: r.scoresBefore.slice(),
    });
  }

  /* Deshacer la última respuesta (correcciones durante una grabación). */
  function undo(state, index) {
    const r = state.round;
    if (state.finished || !r.log.length) return false;
    const keep = r.log.slice(0, -1);
    const undoneBy = r.log[r.log.length - 1].player;
    state.scores = r.scoresBefore.slice();
    state.history = state.history.filter(h => h.index !== state.index);
    Object.assign(r, { found: [], by: {}, log: [], status: 'playing', bomb: null, bomber: null, points: 0, pointsBy: [0, 0] });
    for (const step of keep) { state.active = step.player; resolve(state, index, step.id, false); }
    state.active = undoneBy;
    return true;
  }

  function retry(state, index) {
    const r = state.round;
    if (!state.config.allowRetry || r.status === 'playing' || state.finished) return false;
    state.scores = r.scoresBefore.slice();
    state.history = state.history.filter(h => h.index !== state.index);
    state.round = freshRound(state, index, r.attempt + 1);
    return true;
  }

  /* CONTINUAR. Con {force:true} (admin) salta aunque la ronda no haya terminado. */
  function next(state, index, opts) {
    if (state.finished) return false;
    if (state.round.status === 'playing' && !(opts && opts.force)) return false;
    if (state.index + 1 >= state.order.length) { state.finished = true; return true; }
    state.index += 1;
    state.round = freshRound(state, index, 0);
    return true;
  }

  /* Ronda anterior (admin): deshace el resultado de esa ronda y la vuelve a repartir. */
  function prev(state, index) {
    if (state.index === 0 && !state.finished) return false;
    if (!state.finished) state.index -= 1;
    state.finished = false;
    const h = state.history.find(x => x.index === state.index);
    if (h) state.scores = h.scoresBefore.slice();
    state.history = state.history.filter(x => x.index < state.index);
    state.round = freshRound(state, index, 0);
    return true;
  }

  function setActive(state, player) {
    if (player !== 0 && player !== 1) return false;
    state.active = player;
    return true;
  }
  function adjustScore(state, player, delta) { state.scores[player] += delta; return true; }
  function resetScores(state) {
    state.scores = [0, 0];
    Object.assign(state.round, { scoresBefore: [0, 0], points: 0, pointsBy: [0, 0] });
    state.history = [];
    return true;
  }
  function winner(state) {
    if (state.scores[0] === state.scores[1]) return -1;
    return state.scores[0] > state.scores[1] ? 0 : 1;
  }

  /* Estado que llega de otra pantalla (sala en línea): se acepta sólo si tiene la forma
     exacta que dibuja el juego. Lo que viene de la red es de otra persona. */
  function isValidState(s, index) {
    const int = v => Number.isInteger(v);
    const seat = v => v === 0 || v === 1;
    const pid = v => int(v) && index.byId.has(v);
    const str = (v, max) => typeof v === 'string' && v.length <= max;
    const pair = v => Array.isArray(v) && v.length === 2 && v.every(int);
    try {
      if (!s || s.version !== 1 || !str(s.seed, 40) || !str(s.dataBuiltAt, 40)) return false;
      const c = s.config;
      if (!c || !Array.isArray(c.players) || c.players.length !== 2 || !c.players.every(p => str(p, 16))) return false;
      if (!Array.isArray(s.order) || !s.order.length || s.order.length > 60) return false;
      s.order.forEach(id => D.parseRoundId(id));
      if (!int(s.index) || s.index < 0 || s.index >= s.order.length || !pair(s.scores) || !seat(s.active) || typeof s.finished !== 'boolean') return false;
      if (!Array.isArray(s.history) || s.history.length > 60 || !s.history.every(h => h && int(h.index) && pair(h.pointsBy)
        && ['perfect', 'bomb'].includes(h.result) && (h.bomber === null || seat(h.bomber)))) return false;
      const r = s.round;
      if (!r || r.id !== s.order[s.index] || !Array.isArray(r.cards) || !r.cards.length || r.cards.length > 12 || !r.cards.every(pid)) return false;
      if (!Array.isArray(r.found) || !r.found.every(id => r.cards.includes(id))) return false;
      if (!r.by || typeof r.by !== 'object' || !r.found.every(id => seat(r.by[id]))) return false;
      if (!Array.isArray(r.log) || r.log.length > 40 || !r.log.every(x => x && pid(x.id) && seat(x.player) && typeof x.ok === 'boolean')) return false;
      if (!['playing', 'perfect', 'bomb'].includes(r.status) || !pair(r.pointsBy)) return false;
      if (r.status === 'bomb' && !(r.bomb && pid(r.bomb.id) && str(r.bomb.reason, 40) && seat(r.bomber))) return false;
      return true;
    } catch (_) { return false; }
  }

  return { DEFAULTS, boardOpts, buildOrder, dealCards, createMatch, answer, undo, retry, next, prev, setActive, adjustScore, resetScores, winner, isValidState };
});
