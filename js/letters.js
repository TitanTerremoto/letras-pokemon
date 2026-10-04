/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · DOMINIO (sin DOM)
   Conteo de letras, categorías, armado de tableros y reconocimiento de nombres.
   Compartido por el juego (navegador) y los tests (Node).

   Regla de conteo: se cuentan letras y números del nombre en español;
   espacios, guiones, puntos, apóstrofos, ♀/♂ y tildes no cuentan.
   Mr. Mime = 6 · Ho-Oh = 4 · Porygon2 = 8 · Código Cero = 10.
   ═══════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LetrasDomain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Teselia', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  /* Índice = id de tipo en PokéAPI − 1 */
  const TYPES = ['Normal', 'Lucha', 'Volador', 'Veneno', 'Tierra', 'Roca', 'Bicho', 'Fantasma', 'Acero',
    'Fuego', 'Agua', 'Planta', 'Eléctrico', 'Psíquico', 'Hielo', 'Dragón', 'Siniestro', 'Hada'];
  const TYPE_COLORS = ['#A8A77A', '#C22E28', '#A98FF3', '#A33EA1', '#E2BF65', '#B6A136', '#A6B91A', '#735797', '#B7B7CE',
    '#EE8130', '#6390F0', '#7AC74C', '#F7D02C', '#F95587', '#96D9D6', '#6F35FC', '#705746', '#D685AD'];

  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const letterCount = name => norm(name).length;

  /* ─── Índice de la Pokédex ─── */
  function buildIndex(data) {
    const list = data.pokemon.map(([id, name, en, gen, types]) => ({ id, name, en, gen, types, len: letterCount(name) }));
    const byId = new Map(list.map(p => [p.id, p]));
    const byKey = new Map();
    const add = (key, p) => {
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      if (!byKey.get(key).includes(p)) byKey.get(key).push(p);
    };
    list.forEach(p => { add(norm(p.name), p); add(norm(p.en), p); });
    // Nidoran♀ / Nidoran♂ se escriben igual: se aceptan también con la letra o la palabra.
    [[29, ['nidoranf', 'nidoranhembra']], [32, ['nidoranm', 'nidoranmacho']]].forEach(([id, keys]) => keys.forEach(k => add(k, byId.get(id))));
    return { list, byId, byKey, keys: [...byKey.keys()] };
  }

  /* ─── Categorías ─── */
  const categoryId = (kind, value) => `${kind}${value}`;
  function categories() {
    return [
      ...REGIONS.map((label, i) => ({ id: categoryId('gen', i + 1), kind: 'gen', value: i + 1, label })),
      ...TYPES.map((label, i) => ({ id: categoryId('type', i + 1), kind: 'type', value: i + 1, label })),
    ];
  }
  const inCategory = (p, cat) => cat.kind === 'gen' ? p.gen === cat.value : p.types.includes(cat.value);

  /* ─── Tablero de una ronda ───
     El primer escalón es siempre el extremo (el nombre más corto o más largo).
     Si hay pocas cartas se suma el escalón siguiente ("escalera"), sin pasar de maxCards. */
  function buildBoard(index, cat, ext, opts) {
    const minCards = opts.minCards, maxCards = opts.maxCards;
    const pool = index.list.filter(p => inCategory(p, cat));
    const lens = [...new Set(pool.map(p => p.len))].sort((a, b) => ext === 'min' ? a - b : b - a);
    const tiers = [];
    let total = 0;
    for (const len of lens) {
      const ids = pool.filter(p => p.len === len).map(p => p.id);
      if (tiers.length && total + ids.length > maxCards) break;
      tiers.push({ len, ids });
      total += ids.length;
      if (total >= minCards) break;
    }
    return { pool: pool.length, tiers, total, valid: total >= opts.minValid && total <= maxCards };
  }

  const roundId = (cat, ext) => `${cat.id}:${ext}`;
  function parseRoundId(id) {
    const m = /^(gen|type)(\d+):(min|max)$/.exec(id);
    if (!m) throw new Error(`Ronda desconocida: ${id}`);
    const cat = categories().find(c => c.kind === m[1] && c.value === +m[2]);
    if (!cat) throw new Error(`Ronda desconocida: ${id}`);
    return { cat, ext: m[3] };
  }

  /* Todas las rondas jugables con estas opciones (las que no entran en la grilla se descartan). */
  function roundBank(index, opts) {
    const out = [];
    for (const cat of categories()) for (const ext of ['min', 'max']) {
      const board = buildBoard(index, cat, ext, opts);
      if (board.valid) out.push(roundId(cat, ext));
    }
    return out;
  }

  function describeRound(index, id, opts) {
    const { cat, ext } = parseRoundId(id);
    const board = buildBoard(index, cat, ext, opts);
    const label = cat.label.toLocaleUpperCase('es');
    const where = cat.kind === 'gen' ? `DE ${label}` : `DE TIPO ${label}`;
    const lens = board.tiers.map(t => t.len);
    return {
      id, cat, ext, board,
      question: `POKÉMON ${where} CON EL NOMBRE MÁS ${ext === 'min' ? 'CORTO' : 'LARGO'}`,
      lengths: lens,
      rule: `${lens.length > 1 ? `${lens.slice(0, -1).join(', ')} Y ${lens[lens.length - 1]}` : lens[0]} LETRAS · CUENTAN LETRAS Y NÚMEROS, NO ESPACIOS NI SIGNOS`,
    };
  }

  /* ─── Reconocer lo que escribió el jugador ───
     Exacto (español o inglés, sin tildes ni signos) o, si no, con un error de tipeo
     (dos en nombres de 9+ letras). Devuelve los candidatos posibles. */
  function distance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  function lookup(index, text, fuzzy) {
    const key = norm(text);
    if (!key) return null;
    if (index.byKey.has(key)) return { matches: index.byKey.get(key), fuzzy: false };
    if (!fuzzy) return null;
    const max = key.length >= 9 ? 2 : key.length >= 5 ? 1 : 0;
    if (!max) return null;
    let best = null, bestD = max + 1, tie = false;
    for (const k of index.keys) {
      const d = distance(key, k, max);
      if (d < bestD) { best = k; bestD = d; tie = false; }
      else if (d === bestD && best && index.byKey.get(k)[0] !== index.byKey.get(best)[0]) tie = true;
    }
    // Dos Pokémon distintos igual de cerca: no se adivina, se pide que lo escriban bien.
    if (!best || tie) return null;
    return { matches: index.byKey.get(best), fuzzy: true };
  }

  /* ─── RNG reproducible (mismo que Buscaminas Pokémon: mulberry32 + hash de texto) ─── */
  function hashSeed(str) {
    let h = 1779033703 ^ String(str).length;
    for (let i = 0; i < String(str).length; i++) {
      h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return {
    REGIONS, TYPES, TYPE_COLORS, norm, letterCount, buildIndex, categories, inCategory,
    buildBoard, roundId, parseRoundId, roundBank, describeRound, lookup, hashSeed, rng, shuffle,
  };
});
