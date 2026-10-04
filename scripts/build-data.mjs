/* Genera data/game-data.js desde los CSV oficiales de PokéAPI (repo PokeAPI/pokeapi).
   Nombres en español (language_id 7, los mismos de PokeDuelo y Buscaminas) y en inglés como alias.
   Los CSV se cachean en .cache/ (no se versiona). Los sprites que falten se bajan a assets/sprites/.

   node scripts/build-data.mjs            usa la caché si existe
   node scripts/build-data.mjs --refresh  vuelve a descargar los CSV */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const CSV_BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const FILES = ['pokemon_species', 'pokemon_species_names', 'pokemon_types'];
const LANG_ES = '7', LANG_EN = '9';
const LAST_ID = 1025;

async function csv(name) {
  const file = path.join(CACHE, `${name}.csv`);
  if (process.argv.includes('--refresh') || !fs.existsSync(file)) {
    const res = await fetch(`${CSV_BASE}/${name}.csv`);
    if (!res.ok) throw new Error(`No se pudo descargar ${name}.csv (${res.status})`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(file, await res.text());
  }
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1).map(line => {
    const out = []; let cell = '', quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { out.push(cell); cell = ''; }
      else cell += ch;
    }
    out.push(cell);
    return out;
  });
}

const [species, names, types] = await Promise.all(FILES.map(csv));
const es = {}, en = {};
for (const [id, lang, name] of names) {
  if (lang === LANG_ES) es[id] = name;
  if (lang === LANG_EN) en[id] = name;
}
const typesOf = {};
for (const [pokemonId, typeId, slot] of types) {
  if (+pokemonId > LAST_ID) continue; // sólo formas por defecto (id de pokemon = id de especie)
  (typesOf[pokemonId] = typesOf[pokemonId] || [])[+slot - 1] = +typeId;
}

const pokemon = species.filter(r => +r[0] <= LAST_ID).map(([id, , gen]) => {
  if (!es[id] || !en[id] || !typesOf[id]) throw new Error(`Faltan datos de la especie ${id}`);
  return [+id, es[id], en[id], +gen, typesOf[id].filter(Boolean)];
});
if (pokemon.length !== LAST_ID) throw new Error(`Se esperaban ${LAST_ID} especies, hay ${pokemon.length}`);

const data = { builtAt: new Date().toISOString(), source: `PokéAPI CSV (${CSV_BASE})`, pokemon };
fs.writeFileSync(path.join(ROOT, 'data', 'game-data.js'),
  `/* Generado por scripts/build-data.mjs — NO editar a mano.\n   [id, nombre ES, nombre EN, generación, [tipos PokéAPI]] */\nwindow.LETRAS_DATA = ${JSON.stringify(data)};\n`);
console.log(`data/game-data.js · ${pokemon.length} Pokémon`);

const spriteDir = path.join(ROOT, 'assets', 'sprites');
fs.mkdirSync(spriteDir, { recursive: true });
const missing = pokemon.map(p => p[0]).filter(id => !fs.existsSync(path.join(spriteDir, `${id}.png`)));
for (const id of missing) {
  const res = await fetch(`${SPRITE_BASE}/${id}.png`);
  if (!res.ok) throw new Error(`No se pudo descargar el sprite ${id} (${res.status})`);
  fs.writeFileSync(path.join(spriteDir, `${id}.png`), Buffer.from(await res.arrayBuffer()));
}
console.log(`assets/sprites · ${missing.length} descargados, ${pokemon.length - missing.length} ya estaban`);
