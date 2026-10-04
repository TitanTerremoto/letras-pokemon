/* Sala en línea (validación de lo que llega por la red, códigos) y escalado del tablero. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const D = require('../js/letters.js');
const G = require('../js/game.js');
const Net = require('../js/net-protocol.js');
const L = require('../js/layout.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL('../data/game-data.js', import.meta.url), 'utf8'), sandbox);
const DATA = JSON.parse(JSON.stringify(sandbox.window.LETRAS_DATA));
const IDX = D.buildIndex(DATA);
const OPTS = G.boardOpts(G.DEFAULTS);
const fresh = () => JSON.parse(JSON.stringify(G.createMatch(IDX, DATA, { seed: 'net' })));

test('la foto de una partida real es válida, también a mitad de ronda y con bomba', () => {
  const s = G.createMatch(IDX, DATA, { seed: 'net' });
  assert.ok(G.isValidState(JSON.parse(JSON.stringify(s)), IDX));
  G.answer(s, IDX, IDX.byId.get(s.round.cards[0]).name);
  assert.ok(G.isValidState(JSON.parse(JSON.stringify(s)), IDX));
  G.answer(s, IDX, 'Arceus');
  G.answer(s, IDX, 'Pikachu');
  assert.ok(G.isValidState(JSON.parse(JSON.stringify(s)), IDX));
});

test('rechaza fotos manipuladas o rotas', () => {
  const bad = [
    s => { s.config.players[0] = 'X'.repeat(200); },
    s => { s.config.players = ['solo']; },
    s => { s.round.cards.push(99999); },
    s => { s.round.found = [99999]; },
    s => { s.round.id = 'gen99:min'; },
    s => { s.order = ['<img src=x onerror=alert(1)>']; },
    s => { s.active = 2; },
    s => { s.scores = [1, '2']; },
    s => { s.round.status = 'hackeado'; },
    s => { s.round.status = 'bomb'; s.round.bomb = { id: 25, reason: 'x'.repeat(500) }; s.round.bomber = 0; },
    s => { s.round.log = Array.from({ length: 100 }, () => ({ id: 1, player: 0, ok: true })); },
    s => { delete s.round; },
  ];
  bad.forEach((mut, i) => { const s = fresh(); mut(s); assert.equal(G.isValidState(s, IDX), false, `caso ${i}`); });
  assert.equal(G.isValidState(null, IDX), false);
  assert.equal(G.isValidState('hola', IDX), false);
});

test('códigos de sala y tokens', () => {
  const c = Net.newRoomCode();
  assert.equal(c.length, Net.CODE_LENGTH);
  assert.equal(Net.normalizeCode(c.toLowerCase()), c);
  assert.equal(Net.normalizeCode(' ab-cd e '), 'ABCDE');
  assert.equal(Net.normalizeCode('ABC'), null);
  assert.equal(Net.normalizeCode('ABCD0'), null, 'el 0 no se usa');
  assert.ok(Net.isToken(Net.newToken()));
  assert.equal(Net.isToken('<script>'), false);
  assert.equal(Net.cleanText('x'.repeat(100)).length, Net.MAX_TEXT);
  assert.equal(Net.cleanText(42), '');
  assert.ok(Net.isMessage({ t: 'answer', text: 'mew' }));
  assert.equal(Net.isMessage({ t: 'answer', text: 'x'.repeat(5000) }), false);
  assert.equal(Net.isMessage({ text: 'sin tipo' }), false);
});

/* Zonas medidas en el navegador (reel a escala 1). */
const ZONES = { vertical: [1032, 552, 14, 14], horizontal: [1276, 340, 12, 10] };

test('todas las rondas del banco entran en la zona, en las dos orientaciones', () => {
  const sizes = new Set(D.roundBank(IDX, OPTS).map(id => D.describeRound(IDX, id, OPTS).board.total));
  for (const [name, [W, H, gx, gy]] of Object.entries(ZONES)) {
    for (const n of sizes) {
      const r = L.bestLayout(n, W, H, gx, gy, 1.8);
      assert.ok(r.cols * r.rows >= n, `${name} ${n}`);
      assert.ok(r.cols * r.cardW + (r.cols - 1) * gx <= W + 0.5, `${name} ${n}: ancho`);
      assert.ok(r.rows * r.cardH + (r.rows - 1) * gy <= H + 0.5, `${name} ${n}: alto`);
      assert.ok(r.k >= 1 - 1e-9, `${name} ${n}: nunca más chico que la grilla 4×3`);
    }
  }
});

test('pocas cartas se agrandan; 12 quedan en la grilla 4×3 del Buscaminas', () => {
  for (const [W, H, gx, gy] of Object.values(ZONES)) {
    const few = L.bestLayout(3, W, H, gx, gy, 1.8), full = L.bestLayout(12, W, H, gx, gy, 1.8);
    assert.ok(few.k > 1.4);
    assert.equal(`${full.cols}x${full.rows}`, '4x3');
    assert.equal(full.k, 1);
  }
});
