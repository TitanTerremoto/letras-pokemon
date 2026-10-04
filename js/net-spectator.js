/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · PANTALLA DE ESPECTADOR
   index.html?espectador=CÓDIGO (vertical) · horizontal.html?espectador=CÓDIGO (horizontal)
   Se conecta a la sala como dispositivo de sólo lectura y dibuja la misma partida, con
   las mismas animaciones, sonidos, carteles y lo que se va escribiendo. No ocupa lado ni
   puede actuar. Sirve para que otro stream muestre la partida (también como Fuente de
   navegador de OBS). Todo lo que llega se valida antes de dibujarse.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const App = window.LetrasApp;
  if (!App || !App.spectator) return;

  let synced = false;
  document.body.classList.add('waiting');
  App.stamp('final', 'CONECTANDO CON LA SALA…');

  const client = window.LetrasClient.connect(App.spectator, {
    onOpen: () => client.send({ t: 'watch' }),
    onStatus(kind, text) {
      if (kind === 'online') return;
      if (!synced || kind === 'error') { document.body.classList.add('waiting'); App.stamp('final', text.toLocaleUpperCase('es')); synced = false; }
    },
    onMessage(msg) {
      if (msg.t === 'state') {
        // El cartel de conexión se saca antes de dibujar, así queda el que corresponda (p. ej. el final).
        if (!synced) App.stamp(null);
        if (!App.applyRemote(msg.game)) return console.warn('Estado de la sala inválido: se ignora.');
        if (!synced) { synced = true; document.body.classList.remove('waiting'); }
      } else if (msg.t === 'cast' && msg.e && typeof msg.e.text === 'string') {
        if (msg.e.kind === 'typing') App.setTyping(msg.e.text);
        else if (msg.e.kind === 'toast') App.toast(msg.e.text);
      } else if (msg.t === 'error' && typeof msg.msg === 'string') {
        App.stamp('final', msg.msg.toLocaleUpperCase('es'));
      }
    },
  });
})();
