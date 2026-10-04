/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · ESCALADO DEL TABLERO (sin DOM)
   Los tableros tienen entre 3 y 12 cartas. El tamaño base de una carta es el de la
   grilla 4×3 (12 cartas). Para cada cantidad se prueban todas las columnas posibles y
   se elige la que permite el contenido más grande sin deformarlo (factor k sobre la base),
   con un tope para que 3 cartas no queden gigantes. Cada carta llena su celda.
   ═══════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LetrasLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BASE_COLS = 4, BASE_ROWS = 3;

  /* W×H: zona de la grilla · gx/gy: separación · kMax: tope de agrandado. */
  function bestLayout(n, W, H, gx, gy, kMax) {
    const baseW = (W - (BASE_COLS - 1) * gx) / BASE_COLS;
    const baseH = (H - (BASE_ROWS - 1) * gy) / BASE_ROWS;
    let best = null;
    for (let cols = 1; cols <= Math.min(n, 6); cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (W - (cols - 1) * gx) / cols;
      const ch = (H - (rows - 1) * gy) / rows;
      const k = Math.min(cw / baseW, ch / baseH, kMax);
      // A igual tamaño se prefiere la disposición con menos huecos.
      const holes = cols * rows - n;
      if (!best || k > best.k + 1e-6 || (Math.abs(k - best.k) <= 1e-6 && holes < best.holes)) best = { cols, rows, k, holes };
    }
    // La carta llena su celda (sin pasar del tope); el contenido escala con k.
    const cw = (W - (best.cols - 1) * gx) / best.cols, ch = (H - (best.rows - 1) * gy) / best.rows;
    return { cols: best.cols, rows: best.rows, k: best.k, cardW: Math.min(cw, baseW * kMax), cardH: Math.min(ch, baseH * kMax) };
  }

  return { bestLayout };
});
