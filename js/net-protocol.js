/* ═══════════════════════════════════════════════════════════════
   LETRAS POKÉMON · PROTOCOLO DE LA SALA EN LÍNEA
   Mismo esquema que Carrera de Medallas: PeerJS (WebRTC). El servidor público de
   PeerJS sólo presenta a los dispositivos; los mensajes viajan entre ellos.

   Autoridad: la pantalla principal (index.html / horizontal.html) guarda la partida
   y decide todo. Los celulares sólo mandan intenciones y muestran lo que reciben.

   Dispositivo → pantalla principal
     { t:'join', seat, token }   ocupar o recuperar el asiento 0 (izquierda) o 1 (derecha)
     { t:'watch' }               mirar sin jugar (pantalla de espectador)
     { t:'leave' }               liberar el asiento
     { t:'answer', text }        responder (sólo vale en el turno de ese asiento)
     { t:'typing', text }        lo que se está escribiendo (se ve en la pantalla y en los espectadores)
     { t:'ping' }                latido (cada PING_MS)

   Pantalla principal → dispositivo
     { t:'state', room, you, seats, game }   foto completa tras cada cambio
     { t:'joined', seat } · { t:'kicked' } · { t:'error', msg } · { t:'pong' }
     { t:'note', msg }                     respuesta a un 'answer' que no avanzó (no existe, repetido, no es tu turno)
     { t:'cast', e:{ kind:'toast'|'typing', text } }   lo que muestra la pantalla principal

   Latido: si un lado no oye nada del otro en DEAD_MS, da la conexión por muerta;
   la pantalla libera el asiento y el dispositivo se reconecta solo.
   ═══════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LetrasNet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROOM_PREFIX = 'letras-pokemon-v1-';   // para no chocar con otras apps de PeerJS
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L
  const CODE_LENGTH = 5;
  const MAX_DEVICE_CHARS = 2000;
  const MAX_STATE_CHARS = 100000;
  const MAX_TEXT = 40;
  const PING_MS = 2000;
  const DEAD_MS = 8000;

  function randomInts(n) {
    const arr = new Uint32Array(n);
    crypto.getRandomValues(arr);
    return Array.from(arr);
  }
  const newRoomCode = () => randomInts(CODE_LENGTH).map(v => CODE_CHARS[v % CODE_CHARS.length]).join('');
  /* Normaliza lo que escribe una persona: mayúsculas y sin caracteres raros. */
  function normalizeCode(text) {
    const clean = String(text || '').toUpperCase().split('').filter(ch => CODE_CHARS.includes(ch)).join('');
    return clean.length === CODE_LENGTH ? clean : null;
  }
  /* Identificador secreto del dispositivo para recuperar su asiento al recargar. */
  const newToken = () => randomInts(4).map(v => v.toString(36).padStart(7, '0')).join('');
  const isToken = t => typeof t === 'string' && /^[a-z0-9]{8,64}$/.test(t);
  const isSeat = s => s === 0 || s === 1;
  const cleanText = t => typeof t === 'string' ? t.slice(0, MAX_TEXT) : '';

  /* Acepta sólo objetos con tipo de mensaje y tamaño razonable. */
  function isMessage(msg, fromHost) {
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return false;
    try { return JSON.stringify(msg).length <= (fromHost ? MAX_STATE_CHARS : MAX_DEVICE_CHARS); } catch (_) { return false; }
  }

  function pageUrl(page, param, code) {
    const url = new URL(page, location.href);
    url.search = `?${param}=${code}`;
    url.hash = '';
    return url.toString();
  }
  const playerUrl = code => pageUrl('jugar.html', 'sala', code);
  const spectatorUrl = (code, layout) => pageUrl(layout === 'horizontal' ? 'horizontal.html' : 'index.html', 'espectador', code);

  return { ROOM_PREFIX, CODE_LENGTH, MAX_TEXT, PING_MS, DEAD_MS, newRoomCode, normalizeCode, newToken, isToken, isSeat, cleanText, isMessage, playerUrl, spectatorUrl };
});
