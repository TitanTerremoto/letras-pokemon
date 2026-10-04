/* ─── CONFIGURACIÓN DE LETRAS POKÉMON ───
   Se puede editar sin tocar el resto del código. */
window.LETRAS_CONFIG = {
  players: ['SKY', 'GUTI'],   // los mismos jugadores que PokeDuelo y Buscaminas (izquierda, derecha)
  startingPlayer: 0,          // 0 = SKY abre la primera ronda, 1 = GUTI (después se alterna)
  totalRounds: 12,            // rondas por partida (el banco tiene 48; nunca se repiten)
  allowRetry: true,           // botón REINTENTAR RONDA (false para competitivo)
  perfectBonus: 0,            // puntos extra para quien completa el tablero
  bombPenalty: 0,             // puntos que pierde quien dice un Pokémon equivocado
  keepPointsOnBomb: true,     // al equivocarse se conservan los aciertos de esa ronda
  minCards: 6,                // "escalera": si el extremo tiene pocos Pokémon se suma el largo siguiente…
  maxCards: 12,               // …sin pasar de la grilla 4×3
  minValid: 3,                // tableros con menos cartas no se usan
  fuzzy: true,                // acepta un error de tipeo (dos en nombres de 9+ letras)
  audio: {                    // si el archivo no existe, se ignora en silencio
    correct: 'assets/audio/correct.mp3',
    bomb: 'assets/audio/bomb.mp3',
    perfect: 'assets/audio/perfect.mp3',
    nextRound: 'assets/audio/next-round.mp3',
  },
};
