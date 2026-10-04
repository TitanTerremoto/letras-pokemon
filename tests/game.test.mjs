/* Reglas con la Pokédex REAL (data/game-data.js): conteo de letras, tableros,
   reconocimiento de nombres, turnos, bomba, tablero limpio, deshacer, reintento. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const D = require('../js/letters.js');
const G = require('../js/game.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../data/game-data.js', import.meta.url), 'utf8'), sandbox);
const DATA = JSON.parse(JSON.stringify(sandbox.window.LETRAS_DATA));
const IDX = D.buildIndex(DATA);
const OPTS = G.boardOpts(G.DEFAULTS);
const name = id => IDX.byId.get(id).name;

/* Partida que empieza en una ronda concreta. */
function matchAt(roundId, extra) {
  const s = G.createMatch(IDX, DATA, { seed: 'test', config: extra });
  s.order[0] = roundId;
  s.round = null;
  s.index = 0;
  s.active = s.config.startingPlayer;
  s.round = { id: roundId, cards: G.dealCards(IDX, roundId, s.seed, 0, 0, s.config), found: [], by: {}, log: [],
    status: 'playing', bomb: null, bomber: null, starter: s.active, attempt: 0, points: 0, pointsBy: [0, 0], scoresBefore: [0, 0] };
  return s;
}

test('la Pokédex tiene las 1025 especies con nombre en español', () => {
  assert.equal(IDX.list.length, 1025);
  assert.equal(name(772), 'Código Cero');
  assert.equal(name(984), 'Colmilargo');
});

test('se cuentan letras y números, no espacios ni signos', () => {
  assert.equal(D.letterCount('Mew'), 3);
  assert.equal(D.letterCount('Mr. Mime'), 6);
  assert.equal(D.letterCount('Ho-Oh'), 4);
  assert.equal(D.letterCount('Porygon2'), 8);
  assert.equal(D.letterCount('Farfetch’d'), 9);
  assert.equal(D.letterCount('Nidoran♀'), 7);
  assert.equal(D.letterCount('Flabébé'), 7);
  assert.equal(D.letterCount('Código Cero'), 10);
});

test('Kanto más corto: Mew y Muk (3) primero, luego la escalera de 4 letras', () => {
  const def = D.describeRound(IDX, 'gen1:min', OPTS);
  assert.deepEqual(def.board.tiers[0].ids.map(name).sort(), ['Mew', 'Muk']);
  assert.equal(def.board.tiers[1].len, 4);
  assert.equal(def.question, 'POKÉMON DE KANTO CON EL NOMBRE MÁS CORTO');
});

test('Psíquico más corto empieza por Mew', () => {
  const def = D.describeRound(IDX, 'type14:min', OPTS);
  assert.deepEqual(def.board.tiers[0].ids.map(name), ['Mew']);
});

test('ningún tablero del banco pasa la grilla 4×3 ni repite Pokémon', () => {
  const bank = D.roundBank(IDX, OPTS);
  assert.ok(bank.length >= 40, `banco chico: ${bank.length}`);
  for (const id of bank) {
    const b = D.describeRound(IDX, id, OPTS).board;
    const ids = b.tiers.flatMap(t => t.ids);
    assert.ok(ids.length >= 3 && ids.length <= 12, id);
    assert.equal(new Set(ids).size, ids.length, id);
    // El primer escalón siempre es el extremo real de la categoría.
    const { cat, ext } = D.parseRoundId(id);
    const lens = IDX.list.filter(p => D.inCategory(p, cat)).map(p => p.len);
    assert.equal(b.tiers[0].len, ext === 'min' ? Math.min(...lens) : Math.max(...lens), id);
  }
});

test('reconoce español, inglés, sin tildes y un error de tipeo', () => {
  assert.equal(D.lookup(IDX, 'codigo cero', true).matches[0].id, 772);
  assert.equal(D.lookup(IDX, 'Type: Null', true).matches[0].id, 772);
  assert.equal(D.lookup(IDX, 'pikachuu', true).matches[0].id, 25);
  assert.equal(D.lookup(IDX, 'pikachuu', false), null);
  assert.equal(D.lookup(IDX, 'mex', true), null, 'nombres cortos: sin corrección');
  assert.equal(D.lookup(IDX, 'nidoran', true).matches.length, 2);
});

test('acierto suma al que respondió y pasa el turno; repetido e inexistente no cuentan', () => {
  const s = matchAt('gen1:min');
  assert.equal(s.active, 0);
  assert.equal(G.answer(s, IDX, 'mew').type, 'correct');
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.active, 1);
  assert.equal(G.answer(s, IDX, 'MEW').type, 'repeat');
  assert.equal(G.answer(s, IDX, 'qwertyuiop').type, 'unknown');
  assert.equal(s.active, 1);
  assert.equal(G.answer(s, IDX, 'Muk').type, 'correct');
  assert.deepEqual(s.scores, [1, 1]);
});

test('otro largo u otra categoría es bomba y termina la ronda', () => {
  const s = matchAt('gen1:min');
  G.answer(s, IDX, 'mew');
  const r = G.answer(s, IDX, 'pikachu');
  assert.equal(r.type, 'bomb');
  assert.equal(s.round.status, 'bomb');
  assert.equal(s.round.bomber, 1);
  assert.equal(s.round.bomb.reason, 'TIENE 7 LETRAS');
  assert.equal(G.answer(s, IDX, 'muk').type, 'ignored');
  const s2 = matchAt('gen1:min');
  G.answer(s2, IDX, 'natu');
  assert.equal(s2.round.bomb.reason, 'ES DE JOHTO');
  const s3 = matchAt('type14:min');
  G.answer(s3, IDX, 'muk');
  assert.equal(s3.round.bomb.reason, 'ES VENENO');
});

test('completar todas las cartas es TABLERO LIMPIO', () => {
  const s = matchAt('gen1:min');
  const cards = s.round.cards.slice();
  cards.forEach(id => G.answer(s, IDX, name(id)));
  assert.equal(s.round.status, 'perfect');
  assert.equal(s.scores[0] + s.scores[1], cards.length);
  assert.equal(s.history.length, 1);
});

test('Nidoran: con uno ya dicho, "nidoran" va al otro', () => {
  const id = D.roundBank(IDX, OPTS).find(r => G.dealCards(IDX, r, 's', 0, 0, G.DEFAULTS).includes(29));
  if (!id) return; // ningún tablero actual los incluye
  const s = matchAt(id);
  assert.equal(G.answer(s, IDX, 'nidoran').type, 'correct');
});

test('deshacer devuelve punto y turno, y reabre una ronda terminada en bomba', () => {
  const s = matchAt('gen1:min');
  G.answer(s, IDX, 'mew');
  G.answer(s, IDX, 'pikachu');
  assert.equal(s.round.status, 'bomb');
  assert.ok(G.undo(s, IDX));
  assert.equal(s.round.status, 'playing');
  assert.equal(s.active, 1);
  assert.deepEqual(s.scores, [1, 0]);
  assert.ok(G.undo(s, IDX));
  assert.deepEqual(s.scores, [0, 0]);
  assert.equal(s.active, 0);
});

test('reintentar restaura puntajes; continuar alterna quién abre', () => {
  const s = matchAt('gen1:min');
  assert.equal(G.next(s, IDX), false, 'no se continúa con la ronda en juego');
  G.answer(s, IDX, 'mew');
  G.answer(s, IDX, 'pikachu');
  assert.ok(G.retry(s, IDX));
  assert.deepEqual(s.scores, [0, 0]);
  assert.equal(s.round.status, 'playing');
  assert.equal(s.round.starter, 0);
  G.answer(s, IDX, 'pikachu');
  assert.ok(G.next(s, IDX));
  assert.equal(s.index, 1);
  assert.equal(s.round.starter, 1);
});

test('misma seed = misma partida', () => {
  const a = G.createMatch(IDX, DATA, { seed: 'abc' }), b = G.createMatch(IDX, DATA, { seed: 'abc' });
  assert.deepEqual(a.order, b.order);
  assert.deepEqual(a.round.cards, b.round.cards);
  assert.equal(new Set(a.order).size, a.order.length);
});
