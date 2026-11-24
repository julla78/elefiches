// Éléfiches — lecture des paquets de fiches (CSV) et modèle de données.
import { norm, noAcc, heads, clozes, unmark } from './match.js';
import { LIMITS } from './levels.js';

export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Lecteur CSV : détecte le séparateur (; tabulation ,) et gère les guillemets.
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [';', '\t', ','].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cur = '', q = false;
  const endRow = () => { row.push(cur); cur = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else cur += ch;
  }
  if (cur !== '' || row.length) endRow();
  return rows;
}

// Noms de colonnes reconnus, en français, anglais et espagnol.
const COLUMNS = [
  [/^(word|mot|terme|term|palabra|expression|vocabulaire|vocabulary)$/, 'word'],
  [/^(definition|définition|definicion|definición)$/, 'definition'],
  [/^(example|exemple|ejemplo|phrase|sentence)\s*\d*$/, 'example'],
  [/^(image|imagen|picture|photo|illustration)$/, 'image'],
  [/^(audio|son|sound)$/, 'audio'],
  [/^(ipa|api|prononciation|pronunciation)$/, 'ipa'],
  [/^(category|catégorie|categorie|categoria|categoría)$/, 'category'],
  [/^(theme|thème|tema)$/, 'theme'],
  [/^(register|registre|registro)$/, 'register'],
  [/^(family|famille|familia)$/, 'family'],
  [/^(pos|nature|catégorie grammaticale)$/, 'pos'],
  [/^(genre|gender|g[ée]nero)$/, 'gender'],
  [/^(doutes?|doubts?|dudas?)$/, 'doubt'],
  [/^(situation|contexte|context|situación|situacion)$/, 'situation'],
  [/^(distracteurs?|distractors?|distractores?|mots pi[eè]ges?|pi[eè]ges?)$/, 'distractors'],
];

// « Traduction FR », « Translation (EN) », « Trad. español »… : une colonne par langue de traduction.
const TR = /^(?:translation|traduction|traduccion|traducción|trad)\.?\s*(?:[-–:(]\s*)?(\p{L}*)\)?$/u;
const LANGS = { fr: 'fr', francais: 'fr', french: 'fr', frances: 'fr', en: 'en', anglais: 'en', english: 'en', ingles: 'en', es: 'es', espagnol: 'es', spanish: 'es', espanol: 'es' };
const plain = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Un identifiant venu d'un fichier sert de clé d'objet : lettres, chiffres, tiret et souligné seulement, jamais un nom réservé.
export const safeKey = v => (typeof v === 'string' && /^[A-Za-z0-9_*-]{1,64}$/.test(v) && !['__proto__', 'constructor', 'prototype'].includes(v) ? v : '');

// Un texte venu d'Anki, d'un tableur ou d'une IA peut contenir des codes HTML à la place des caractères
// (« J&#x27;ai », « caf&eacute; », « &amp; ») : on rend le vrai caractère, partout.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', bull: '•', middot: '·', euro: '€', deg: '°',
  oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ', szlig: 'ß', ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ', Ntilde: 'Ñ', iquest: '¿', iexcl: '¡' };
const ACC = { acute: '́', grave: '̀', circ: '̂', uml: '̈', tilde: '̃', ring: '̊' };
export function decode(text) {
  let s = String(text ?? '');
  for (let pass = 0; pass < 2 && s.includes('&'); pass++) {            // deux passes : « &amp;#x27; » existe aussi
    s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
      if (e[0] === '#') { const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return n ? String.fromCodePoint(n) : m; } catch { return m; } }
      if (ENT[e] !== undefined) return ENT[e];
      const a = e.match(/^([a-z])(acute|grave|circ|uml|tilde|ring)$/i);        // &eacute; &Agrave; &ntilde;…
      return a ? (a[1] + ACC[a[2].toLowerCase()]).normalize('NFC') : m;
    });
  }
  return s;
}
const TEXTS = ['word', 'definition', 'situation', 'theme', 'register', 'family', 'ipa', 'pos', 'gender', 'doubt'];
// Plafonds : un paquet démesuré ralentirait chaque ouverture de l'application sur un téléphone.
export const DECK_LIMITS = { cards: 2000, word: 200, definition: 500, situation: 400, theme: 80, register: 40, family: 80, ipa: 80, pos: 40, gender: 20, doubt: 300, example: 300, examples: 6, trap: 80, traps: 6 };
// Genre d'un nom, tel que le paquet l'écrit (« m », « masculin », « f », « féminin », « mf » pour un nom qui a les deux).
export const normGender = v => { const g = plain(String(v || '')).trim(); return /^(mf|m\s*\/\s*f|m et f|epicene|les deux|both|ambos)/.test(g) ? 'mf' : /^m/.test(g) ? 'm' : /^f/.test(g) ? 'f' : ''; };
const cut = (v, n) => (typeof v === 'string' && v.length > n ? v.slice(0, n) : v);
// Nettoie une fiche déjà enregistrée ou tout juste importée. Les positions du mot dans les exemples (marks) sont
// oubliées si un exemple change de longueur : elles seront retrouvées d'après le mot.
function tidyCard(c) {
  if (!Array.isArray(c.examples)) c.examples = [];      // stockage abîmé ou modifié à la main : jamais une chaîne à la place d'une liste
  if (c.translations !== undefined && (typeof c.translations !== 'object' || c.translations === null || Array.isArray(c.translations))) c.translations = {};
  for (const k of TEXTS) if (c[k] !== undefined && typeof c[k] !== 'string') delete c[k]; else if (c[k]) c[k] = cut(c[k], DECK_LIMITS[k] * 4);     // coupe large avant décodage
  const fix = v => (typeof v === 'string' && v.includes('&') ? decode(v) : v);
  for (const k of TEXTS) if (c[k]) c[k] = cut(fix(c[k]), DECK_LIMITS[k]);
  // Le genre est gardé sous une seule forme (m, f, mf). « Nom masculin » dans la catégorie le donne aussi.
  const pg = plain(c.pos || '').trim(), g = normGender(c.gender) || (/^(?:nom|noun|sustantivo|n\.?)\s*(?:m\.?|masc\w*)$/.test(pg) ? 'm' : /^(?:nom|noun|sustantivo|n\.?)\s*(?:f\.?|fem\w*)$/.test(pg) ? 'f' : '');
  if (g) c.gender = g; else delete c.gender;
  if (Array.isArray(c.examples)) {
    c.examples = c.examples.filter(e => typeof e === 'string');
    const before = c.examples.join('\n');
    c.examples = c.examples.slice(0, 24).map(e => fix(cut(e, 4000))).flatMap(e => (/(^|\s)[•▪◦‣]\s/.test(e) ? e.split(/(?:^|\s)[•▪◦‣]\s+/).map(x => x.trim()).filter(Boolean) : [e]));   // « • phrase • phrase » : une phrase par exemple
    const n = c.examples.length; c.examples = c.examples.slice(0, DECK_LIMITS.examples).map(e => cut(e, DECK_LIMITS.example));
    if (c.marks && (c.examples.join('\n') !== before || n !== c.examples.length)) delete c.marks;
  }
  if (Array.isArray(c.distractors)) c.distractors = c.distractors.filter(x => typeof x === 'string').slice(0, DECK_LIMITS.traps).map(x => cut(fix(x), DECK_LIMITS.trap)); else delete c.distractors;
  if (c.translations) for (const k of Object.keys(c.translations)) c.translations[k] = fix(c.translations[k]);
  if (c.translation) c.translation = fix(c.translation);
}

// Images et sons : seulement un contenu intégré au paquet (data:) ou un fichier rangé à côté de l'application.
// Jamais une adresse d'un autre site : elle révélerait à ce site chaque étudiant qui ouvre la fiche.
export function safeUrl(u) {
  u = String(u || '').trim();
  if (/^data:(image\/(png|jpeg|webp|gif|svg\+xml)|audio\/[\w.+-]+|video\/webm)[;,]/i.test(u)) return u.length <= 1500000 ? u : '';
  return u.length <= 200 && /^(?:[\w -]+\/)*[\w -]+(?:\.[\w-]+)+$/.test(u) ? u : '';       // chemin relatif simple : ni « / » initial, ni « .. », ni « % »
}

// Champ « image » d'une fiche : une case de planche (« P1-3 ») ou une image sûre.
const imgRef = v => (/^P\d+-\d+$/i.test(String(v ?? '').trim()) ? String(v).trim() : safeUrl(v));

// Niveau du paquet (A1 à C2) : il décide de la langue des consignes et du feedback.
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const levelIn = name => (String(name).toUpperCase().match(/(?<![A-Z0-9])([ABC][12])(?![0-9])/) || [])[1] || '';      // « Logement (A2) », « A1SQ2_Londres »
export const guessLevel = name => (String(name).toUpperCase().match(/(?<![A-Z0-9])([ABC][12])(?![A-Z0-9])/) || [])[1] || 'A2';

export const deckFromCSV = (text, name, lang = 'fr', level) => deckFromRows(parseCSV(text), name, lang, level);

// Paquet construit à partir d'un tableau : première ligne = noms des colonnes.
export function deckFromRows(rows, name, lang = 'fr', level) {
  if (rows.length < 2) throw new Error('empty');
  if (rows.length > DECK_LIMITS.cards * 5) throw new Error('too-many');
  const cols = rows[0].map(h => {
    const k = h.trim().toLowerCase();
    const tr = k.match(TR);
    if (tr) return 'tr:' + (LANGS[plain(tr[1])] || safeKey(plain(tr[1])) || '*');
    const hit = COLUMNS.find(([re]) => re.test(k));
    return hit ? hit[1] : 'extra:' + h.trim();
  });
  if (!cols.includes('word')) throw new Error('no-word-column');
  const cards = []; let skipped = 0; const seen = new Set();
  for (const r of rows.slice(1)) {
    const c = { examples: [], extra: {}, translations: {} };
    cols.forEach((col, i) => {
      const v = (r[i] ?? '').trim();
      if (!v) return;
      if (col === 'example') c.examples.push(v);
      else if (col.startsWith('tr:')) c.translations[col.slice(3)] = v;
      else if (col === 'image' || col === 'audio') { const u = col === 'image' ? imgRef(v) : safeUrl(v); if (u) c[col] = u; }
      else if (col === 'distractors') c.distractors = v.split('|').map(x => x.trim()).filter(Boolean);
      else if (col.startsWith('extra:')) c.extra[col.slice(6)] = v;
      else c[col] = v;
    });
    if (c.category) {                       // « Monde du travail · Registre familier »
      const [a, b] = c.category.split('·').map(s => s.trim());
      c.theme ??= a; if (b) c.register ??= b;
      delete c.category;
    }
    const anyTr = Object.values(c.translations)[0];
    if (!c.word || !(c.definition || anyTr)) { skipped++; continue; }
    c.id = hash(c.word + '|' + (c.definition || anyTr));
    if (seen.has(c.id)) { skipped++; continue; }
    seen.add(c.id);
    cards.push(c);
  }
  if (cards.length < 3) throw new Error('too-few');
  return prepare({ id: 'd' + hash(norm(name)), name, lang, level: LEVELS.includes(level) ? level : '', cards, skipped, fields: [...new Set(cols)] });
}

// ---------- Paquets Anki (.apkg) ----------
// N'importe quel paquet Anki : chaque type de note est lu à part. Le rôle d'un champ se reconnaît d'abord à son nom
// (« Expression », « Front », « Picture », « Exemple »…), sinon à ce qu'il contient (une image, un son, un mot court,
// une phrase). Les notes « texte à trous » deviennent des fiches dont le mot est la partie cachée.
const ROLES = [
  ['word', /^(word|words|mot|mots|terme?|expressions?|vocab|vocabulary|vocabulaire|front|recto|anverso|vorderseite|question|pregunta|palabra|wort|parola|headword|lemma|lemme|entr[ée]e|entry|item|target|kanji|hanzi|simplified|hangul)$/],
  ['definition', /^(d[ée]finitions?|definici[oó]n|meaning|sens|signification|significado|explication|explanation|back|verso|reverso|r[üu]ckseite|answer|r[ée]ponse|respuesta|gloss|glose|description)$/],
  ['example', /^(examples?|exemples?|ejemplos?|sentences?|phrases?|frases?|contextes?|usage|beispiele?|satz)\s*\d*$/],
  ['image', /^(images?|pictures?|pics?|photos?|illustrations?|dessins?|imagen|img|visuel|bild|foto)$/],
  ['audio', /^(audio|sound|sons?|voix|voice|mp3|pronunciation audio|audio du mot)$/],
  ['ipa', /^(ipa|api|prononciation|pronunciation|phon[ée]tique|phonetics?|transcription|pinyin|reading|lecture)$/],
  ['category', /^(cat[ée]gor(y|ie|ies|ia|ía)|th[èe]mes?|temas?|topics?|sujet|rubrique|domaine|champ lexical|chapitre|chapter|le[cç]on|lesson|unit|unité)$/],
  ['pos', /^(pos|nature|part of speech|classe grammaticale|cat[ée]gorie grammaticale)$/],
  ['gender', /^(genre|gender|g[ée]nero)$/],
  ['register', /^(register|registre|registro)$/],
  ['situation', /^(situation|situaci[oó]n)$/],
  ['distractors', /^(distracteurs?|distractors?|distractores?|mots pi[eè]ges?|pi[eè]ges?)$/],
  ['extra', /^(extra|verso suppl[ée]mentaire|back extra|notes?|remarques?|hint|indice|comment(aire)?s?|tags?)$/],
];
const TR_NAMES = { fr: /^(fran[cç]ais|french|franc[eé]s|fr)$/, en: /^(anglais|english|ingl[eé]s|en)$/, es: /^(espagnol|spanish|espa[nñ]ol|es)$/ };
const BREAK = /<br\s*\/?>|<\/(div|p|li|tr|h\d)>|\r?\n/gi;
const FIELD_MAX = 2000;                       // un champ de vocabulaire n'approche jamais cette longueur
const CLOZE = /\{\{c(\d+)::((?:(?!\}\}|::)[\s\S])*)(?:::((?:(?!\}\})[\s\S])*))?\}\}/g;
const strip = html => decode(String(html).slice(0, FIELD_MAX).replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/\[sound:[^\]\[]*\]/g, ' ').replace(BREAK, ' ').replace(/<[^<>]*>/g, '')).replace(/\s+/g, ' ').trim();
const imgOf = html => { const m = String(html).slice(0, FIELD_MAX * 2).match(/<img[^>]+src\s*=\s*["']?([^"'>\s]+)/i); return m ? decode(m[1]) : ''; };
const sndOf = html => { const m = String(html).slice(0, FIELD_MAX).match(/\[sound:([^\]\[]+)\]/); return m ? decode(m[1]) : ''; };
// Un champ d'exemples peut en réunir plusieurs : lignes, puces « • », éléments de liste.
const lines = html => String(html).slice(0, FIELD_MAX).replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').split(/<br\s*\/?>|<\/(?:div|p|li|tr)>|\r?\n|\s[•▪◦‣·]\s|^\s*[•▪◦‣]\s*/gi)
  .map(x => strip(x || '').replace(/^[-–—•▪◦‣*]\s+|^\d+[.)]\s+/, '')).filter(Boolean);
const wordsIn = t => (t ? t.split(/\s+/).length : 0);

function ankiRoles(model, notes) {
  const flds = [...(model.flds || [])].sort((a, b) => a.ord - b.ord), n = Math.max(1, notes.length);
  const stat = flds.map((f, i) => {
    const raw = notes.map(x => x.f[i] || ''), txt = raw.map(strip), filled = txt.filter(Boolean);
    return { img: raw.filter(r => /<img/i.test(r)).length / n, snd: raw.filter(r => /\[sound:/.test(r)).length / n, text: filled.length / n,
      len: filled.reduce((a, t) => a + wordsIn(t), 0) / Math.max(1, filled.length), sent: filled.filter(t => /[.!?…。]["»”)]?$/.test(t)).length / Math.max(1, filled.length) };
  });
  const role = flds.map(f => {
    const k = plain(f.name.trim()).replace(/[_-]+/g, ' '), tr = k.match(TR) || null;
    const lang = Object.keys(TR_NAMES).find(l => TR_NAMES[l].test(k));
    if (lang) return 'tr:' + lang;
    if (tr) return 'tr:' + (LANGS[plain(tr[1])] || plain(tr[1]) || '*');
    const hit = ROLES.find(([, re]) => re.test(k) || re.test(f.name.trim().toLowerCase()));
    return hit ? hit[0] : '';
  });
  const free = i => !role[i], has = r => role.some(x => x === r || (r === 'tr' && x.startsWith('tr:')));
  // Champs sans nom reconnu : d'abord ceux qui ne contiennent qu'une image ou qu'un son.
  stat.forEach((s, i) => { if (free(i) && s.text < 0.2 && s.img >= 0.3 && !has('image')) role[i] = 'image'; else if (free(i) && s.text < 0.2 && s.snd >= 0.3 && !has('audio')) role[i] = 'audio'; });
  const texty = i => free(i) && stat[i].text >= 0.5;
  if (!has('word')) {                      // le champ de tri d'Anki est le plus souvent le mot ; sinon le premier champ de texte court
    const sortf = model.sortf ?? 0, pick = texty(sortf) ? sortf : stat.findIndex((s, i) => texty(i) && s.len <= 8);
    const any = pick >= 0 ? pick : stat.findIndex((s, i) => texty(i));
    if (any >= 0) role[any] = 'word';
  }
  if (!has('definition') && !has('tr')) {  // le premier autre champ de texte donne le sens
    const d = stat.findIndex((s, i) => texty(i));
    if (d >= 0) role[d] = 'definition';
  }
  stat.forEach((s, i) => { if (texty(i)) role[i] = s.len >= 4 && s.sent >= 0.5 ? 'example' : 'extra'; });
  return role;
}

// Note « texte à trous » : {{c1::mot::indice}} dans une phrase.
function clozeCard(text, extra) {
  text = String(text).slice(0, FIELD_MAX);
  const all = [...text.matchAll(CLOZE)];
  if (!all.length) return null;
  const first = all[0], word = strip(first[2]), open = t => t.replace(CLOZE, '$2');
  const marked = strip(open(String(text).replace(first[0], '\u0001' + first[2] + '\u0002'))).replace('\u0001', '[').replace('\u0002', ']');
  const holed = strip(open(String(text).replace(first[0], '\u0001'))).replace('\u0001', '…');
  return { word, example: marked, definition: strip(extra || '') || strip(first[3] || '') || `Le mot qui manque dans : « ${holed} »` };
}

export function deckFromAnki(db, name, lang = 'fr', level) {
  const col = db.table('col')[0] || [];
  let models = {}, decks = {};
  try { models = JSON.parse(col[9] || '{}'); decks = JSON.parse(col[10] || '{}'); } catch { /* base d'un autre format */ }
  const notes = db.table('notes').map(n => ({ id: String(n[0]), mid: String(n[2]), tags: String(n[5] || '').trim().split(/\s+/).filter(Boolean), f: String(n[6] ?? '').slice(0, 60000).split('\x1f').slice(0, 40).map(x => x.slice(0, FIELD_MAX)) }));
  if (notes.length > DECK_LIMITS.cards * 5) throw new Error('too-many');
  if (!notes.length || !Object.keys(models).length) throw new Error('anki-new');
  // Sous-paquets : le nom du sous-paquet d'une note sert de thème quand la note n'en a pas.
  const deckName = id => String(decks[id]?.name || '').split('::').pop().trim();
  const used = {}; try { for (const c of db.table('cards')) used[String(c[1])] ??= String(c[2]); } catch { /* table absente */ }
  const real = (Object.keys(used).length ? [...new Set(Object.values(used))] : Object.keys(decks)).filter(id => deckName(id) && deckName(id) !== 'Default' && deckName(id) !== 'Par défaut');
  const levelTag = t => LEVELS.includes(t.toUpperCase());
  const maxEx = 4, header = ['Word', 'Definition', 'Translation', 'Translation FR', 'Translation EN', 'Translation ES', ...Array.from({ length: maxEx }, (_, i) => 'Example ' + (i + 1)), 'Image', 'Audio', 'Category', 'IPA', 'POS', 'Genre', 'Register', 'Situation', 'Distracteurs'];
  const rows = [header]; let tagLevel = '';
  for (const mid of Object.keys(models)) {
    const mine = notes.filter(n => n.mid === mid); if (!mine.length) continue;
    const model = models[mid], flds = [...(model.flds || [])].sort((a, b) => a.ord - b.ord), isCloze = model.type === 1 || mine.some(n => /\{\{c\d+::/.test(n.f.join(' ')));
    const role = ankiRoles(model, mine), at = r => role.indexOf(r);
    for (const n of mine) {
      const get = r => (at(r) >= 0 ? strip(n.f[at(r)] || '') : ''), c = { ex: [] };
      tagLevel ||= n.tags.find(levelTag) || '';
      if (isCloze) {
        const ti = n.f.findIndex(x => /\{\{c\d+::/.test(x)), z = ti >= 0 ? clozeCard(n.f[ti], n.f.filter((_, i) => i !== ti && !/<img|\[sound:/.test(n.f[i])).map(strip).filter(Boolean).join(' — ')) : null;
        if (!z) continue;
        Object.assign(c, { word: z.word, definition: z.definition }); c.ex.push(z.example);
      } else {
        c.word = get('word'); c.definition = get('definition');
        role.forEach((r, i) => { if (r === 'example') c.ex.push(...lines(n.f[i] || '')); else if (r.startsWith('tr:')) c[r] = strip(n.f[i] || ''); });
      }
      c.image = (at('image') >= 0 && (imgOf(n.f[at('image')]) || (/\.(png|jpe?g|gif|webp|svg)$/i.test(get('image')) ? get('image') : ''))) || imgOf(n.f.join(' '));
      c.audio = (at('audio') >= 0 && sndOf(n.f[at('audio')])) || sndOf(n.f.join(' '));
      const tag = n.tags.find(t => !levelTag(t) && !/^(leech|marked)$/i.test(t));
      c.category = get('category') || (real.length > 1 ? deckName(used[n.id]) : '') || (tag ? tag.replace(/::/g, ' · ').replace(/_/g, ' ') : '');
      rows.push([c.word, c.definition, c['tr:*'] || '', c['tr:fr'] || '', c['tr:en'] || '', c['tr:es'] || '', ...Array.from({ length: maxEx }, (_, i) => c.ex[i] || ''), c.image, c.audio, c.category, get('ipa'), get('pos'), get('gender'), get('register'), get('situation'), get('distractors')]);
    }
  }
  const own = real.map(id => String(decks[id].name)).sort((a, b) => a.length - b.length)[0]?.split('::')[0];
  const first = models[Object.keys(models).find(mid => notes.some(n => n.mid === mid))];
  const deck = deckFromRows(rows, name || own || first?.name || 'Paquet Anki', lang, level || tagLevel.toUpperCase());
  deck.fields = [];
  return deck;
}

// Plusieurs paquets réunis en un seul : les fiches en double (même mot, même sens) ne sont gardées qu'une fois.
export function mergeDecks(decks, name) {
  const seen = new Set(), cards = [];
  for (const d of decks) for (const c of d.cards) { if (seen.has(c.id)) continue; seen.add(c.id); cards.push(c); }
  const nm = name || decks.map(d => d.name).join(' + '), first = decks[0];
  const level = decks.every(d => d.level === first.level && !d.levelGuessed) ? first.level : '';
  return prepare({ id: 'd' + hash(norm(nm)), name: nm, lang: first.lang, level, grid: first.grid, cards, skipped: decks.reduce((a, d) => a + (d.skipped || 0), 0), fields: [] });
}

// Calcule ce qui se déduit des fiches : phrases à trous et fiches « voisines » (sens proche).
export function prepare(deck) {
  // Niveau absent : on le lit dans le nom (« Logement (A2) ») ; sinon A2 par défaut, et l'import demande de le choisir.
  if (!LEVELS.includes(deck.level)) { deck.levelGuessed = !levelIn(deck.name); deck.level = guessLevel(deck.name); }
  // Ce qui sert d'attribut ou de clé ne vient jamais tel quel d'un fichier : code de langue et identifiants sont contrôlés.
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(deck.lang || '')) deck.lang = 'fr';
  if (!safeKey(deck.id)) deck.id = 'd' + hash(norm(String(deck.name || 'paquet')));
  deck.name = String(deck.name || 'Paquet').slice(0, 120);
  deck.cards = (Array.isArray(deck.cards) ? deck.cards : []).filter(c => c && typeof c === 'object' && typeof c.word === 'string' && c.word.trim());
  if (deck.cards.length > DECK_LIMITS.cards) { deck.skipped = (deck.skipped || 0) + deck.cards.length - DECK_LIMITS.cards; deck.cards = deck.cards.slice(0, DECK_LIMITS.cards); }
  if (deck.fields !== undefined) deck.fields = (Array.isArray(deck.fields) ? deck.fields : []).filter(f => typeof f === 'string').slice(0, 60).map(f => f.slice(0, 80));
  const ids = new Set();
  for (const c of deck.cards) {
    if (!safeKey(c.id) || c.id === 'new' || ids.has(c.id)) c.id = hash(c.word + '|' + (c.definition || '') + '|' + ids.size);
    ids.add(c.id);
    if (c.image && !imgRef(c.image)) delete c.image;
    if (c.audio && !safeUrl(c.audio)) delete c.audio;
    if (c.translations && typeof c.translations === 'object') c.translations = Object.fromEntries(Object.entries(c.translations).filter(([k, v]) => safeKey(k) && typeof v === 'string'));
  }
  deck.cards.forEach(tidyCard);
  const FILLER = new Set('un une des les le la de du et ou qui que pour dans sur avec par est sont pas plus tres the an of to and or that which for in on with is are not very el los las una y o para en con es son muy quelqu quelque chose something someone alguien algo'.split(' '));
  const tokSet = s => new Set(noAcc(norm(s || '')).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const info = deck.cards.map(c => ({
    heads: heads(c.word).map(noAcc).filter(h => !h.includes(' ') && h.length >= 4),
    def: tokSet(c.definition),
    // Mots pleins de la définition et traductions : deux fiches qui se définissent ou se traduisent presque de la même
    // façon (« embaucher » et « recruter ») ne peuvent pas être départagées par leur sens : l'enseignant en est averti.
    core: new Set([...tokSet(c.definition)].filter(w => (w.length > 2 || /\d/.test(w)) && !FILLER.has(w))),
    tr: new Set(Object.values(c.translations || (c.translation ? { '*': c.translation } : {})).map(x => noAcc(norm(String(x || '')))).filter(Boolean)),
  }));
  const alikeDef = (a, b) => { if (a.size < 2 || b.size < 2) return false; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n) >= 0.75; };   // « mot familier qui signifie travail » et « … entreprise » ne diffèrent que d'un mot, mais c'est le mot qui compte : seuil haut
  deck.twins = [];
  deck.cards.forEach((c, i) => {
    c.translations ??= c.translation ? { '*': c.translation } : {};
    c.examples ??= [];
    // Mot marqué entre crochets dans un exemple : on retient sa place et on retire les crochets.
    if (c.examples.some(e => /\[[^\]]+\]/.test(e))) { const u = c.examples.map(unmark); c.examples = u.map(x => x[0]); c.marks = u.map(x => x[1]); }
    else if (c.marks && c.marks.length !== c.examples.length) delete c.marks;
    // « P1-3 » : le dessin de cette fiche est la case 3 de la planche 1, découpée à l'import des planches.
    if (/^P\d+-\d+$/i.test(c.image || '')) { c.sheet = c.image.toUpperCase(); delete c.image; }
    // « Au (siècle) » : la glose entre parenthèses aide l'enseignant, mais donnerait la réponse dans une question.
    c.bare = c.word.replace(/\s\([^)]*\)/g, '').trim() || c.word;
    c.key = noAcc(norm(c.bare));
    c.clozes = clozes(c);
    const nb = new Set();
    deck.cards.forEach((d, j) => {
      if (i === j) return;
      const fam = c.family && d.family && norm(c.family) === norm(d.family);
      // Sans champ « famille » : deux fiches du même thème, de registres différents, dont l'une est
      // définie à l'aide de l'autre (« boulot : mot familier pour un emploi ») sont jugées proches.
      const mention = info[j].heads.some(h => info[i].def.has(h)) || info[i].heads.some(h => info[j].def.has(h));
      const variant = mention && c.theme === d.theme && c.register && d.register && c.register !== d.register;
      // Signalées dans le contrôle du paquet, sans effet sur le calendrier : la séance écarte elle-même, question par
      // question, les sens qui s'affichent presque à l'identique (voir sameSense dans session.js).
      if (i < j && deck.twins.length < 200 && (alikeDef(info[i].core, info[j].core) || [...info[i].tr].some(x => info[j].tr.has(x)))) deck.twins.push([c.word, d.word]);      // liste bornée : au-delà, le paquet est à refaire, pas à détailler
      if (fam || variant) nb.add(d.id);
    });
    c.neighbours = [...nb];
  });
  // Deux variantes d'un même mot sont voisines entre elles : « job », « boulot » et « taf » sont chacun définis à l'aide
  // de « emploi », donc aucun des trois ne peut servir de mot piège aux deux autres (« Ce ___ étudiant lui permet de
  // payer son loyer » les accepterait tous). Un seul niveau : pas de chaîne qui avalerait tout un thème.
  // Coût borné : un paquet entier rangé sous la même « famille » (des centaines de voisines) ne doit pas figer l'appli ;
  // ces fiches sont de toute façon déjà voisines deux à deux.
  const cardOf = new Map(deck.cards.map(c => [c.id, c])), direct = new Map(deck.cards.map(c => [c.id, [...c.neighbours]]));
  for (const hub of deck.cards) {
    const group = direct.get(hub.id); if (group.length < 2 || group.length > 30) continue;
    for (const a of group) { const A = cardOf.get(a), have = new Set(A.neighbours); for (const b of group) if (a !== b && !have.has(b)) { A.neighbours.push(b); have.add(b); } }
  }
  const seen = new Map();
  for (const c of deck.cards) seen.set(c.key, (seen.get(c.key) || 0) + 1);
  deck.homographs = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));   // deux fiches « En »
  deck.helpLangs = [...new Set(deck.cards.flatMap(c => Object.keys(c.translations)))];
  if (!/^\d+x\d+$/.test(deck.grid || '')) deck.grid = '3x3';        // cases d'une planche d'images : colonnes x rangées
  // Table sans prototype : un identifiant forgé (« __proto__ », « constructor ») n'y trouve jamais rien.
  deck.byId = Object.assign(Object.create(null), Object.fromEntries(deck.cards.map(c => [c.id, c])));
  return deck;
}

// Contrôle d'un paquet : ce qu'une machine peut vérifier. La justesse et le naturel des phrases restent à relire.
// Renvoie une liste de constats { key, cards } (fiches concernées), du plus gênant au moins gênant.
// Phrases « de manuel » en anglais. Deux repérages, de fiabilité différente.
// 1. bookish : sujet en « a / an » + présent simple + un ancrage dans une scène précise (lieu défini, possessif, « this »).
//    « A rabbit eats carrots in the garden. » est signalée ; la définition « A nurse helps sick people. » ne l'est pas.
// 2. sceneLike : sujet précis (« the », « my ») + verbe d'action au présent simple, sans repère d'habitude.
//    « The dog plays with my friends. » : action en cours (présent continu) ou habitude sans repère ? À relire.
const bare1 = ex => String(ex).replace(/[\[\]]/g, '').replace(/[’`´]/g, "'").trim();
const ANCHOR = /\b(?:this|that|these|those|my|your|his|her|our|their|here|now|today|tonight)\b|\b(?:in|on|at|under|behind|near|next to|with|into|by|from)\s+(?:the|us|me|him|them)\b/i;
const A_SUBJECT = /^an?\s+[a-z-]+\s+(?!is\b|was\b|has\b|does\b)[a-z]+[^s\W]s\b(.*)$/i;
export const bookish = ex => { const m = A_SUBJECT.exec(bare1(ex)); return !!m && ANCHOR.test(m[1]); };
const ACTIONS = new Set('play eat run sleep read cook drink walk swim jump sit stand watch write drive ride dance sing cry laugh bark fly wash clean carry pull push roll look wait climb draw paint talk listen cut open close throw catch kick hide dig'.split(' '));
const HABIT = /\b(?:always|usually|often|sometimes|never|rarely|every|each|once|twice|when|whenever|if)\b|\bon \w+days\b|\bat (?:night|weekends?)\b|\bin the (?:morning|afternoon|evening)\b|\ba (?:day|week|month|year)\b/i;
const THE_SUBJECT = /^(?:the|my|our|his|her|their|your)\s+[a-z-]+\s+([a-z]+s)\b/i;
const stem = v => v.toLowerCase().replace(/ies$/, 'y').replace(/(ch|sh|x|ss|o)es$/, '$1').replace(/s$/, '');
export const sceneLike = ex => { const p = bare1(ex), m = THE_SUBJECT.exec(p); return !!m && ACTIONS.has(stem(m[1])) && !HABIT.test(p); };
export function audit(deck) {
  const lim = LIMITS[deck.level] || {}, wc = t => (t || '').trim().split(/\s+/).filter(Boolean).length, out = [];
  const add = (key, cards, warn = true, lines) => { if (cards.length) out.push({ key, cards, warn, lines }); };
  add('auNoImage', deck.cards.filter(c => !c.image && !c.sheet), !!lim.image);
  add('auLongDef', deck.cards.filter(c => c.definition && lim.def && wc(c.definition) > lim.def));
  add('auNoExample', deck.cards.filter(c => !c.examples.length));
  add('auNoCloze', deck.cards.filter(c => c.examples.length && !c.clozes.length));
  add('auDefHasWord', deck.cards.filter(c => c.definition && c.key.length >= 4 && noAcc(norm(c.definition)).split(/[^\p{L}\p{N}]+/u).includes(c.key.split(' ').pop())));
  // « A rabbit eats carrots in the garden. » : sujet en a/an suivi d'un présent simple. Naturel pour une définition
  // (« A nurse helps sick people. »), pas pour une scène : ces phrases sont à relire par l'enseignant.
  if (deck.lang === 'en') {
    add('auBookish', deck.cards.filter(c => c.examples.some(bookish)), true, deck.cards.flatMap(c => c.examples.filter(bookish)));
    add('auScene', deck.cards.filter(c => c.examples.some(sceneLike)), false, deck.cards.flatMap(c => c.examples.filter(sceneLike)));
  }
  add('auTwins', deck.cards.filter(c => (deck.twins || []).some(p => p.includes(c.word))), true, (deck.twins || []).map(p => p.join(' / ')));
  // Doutes que l'IA (ou l'enseignant) a notés sur une fiche : à lire avant de donner le paquet aux étudiants.
  add('auDoubt', deck.cards.filter(c => c.doubt), true, deck.cards.filter(c => c.doubt).map(c => `${c.word} : ${c.doubt}`));
  add('auFewExamples', deck.cards.filter(c => c.examples.length && c.examples.length < 4), false);
  add('auNoSituation', deck.cards.filter(c => !c.situation), false);
  add('auNoTraps', deck.cards.filter(c => !(c.distractors || []).length), false);
  return out;
}

// Forme enregistrable d'un paquet (sans les champs calculés).
export function serialize(deck) {
  return {
    id: deck.id, name: deck.name, lang: deck.lang, level: deck.level, grid: deck.grid, fields: deck.fields, demo: deck.demo,
    cards: deck.cards.map(({ clozes, neighbours, bare, key, ...c }) => c),   // helpLangs, byId et twins sont recalculés
  };
}

// Paquet complet (avec images et sons intégrés) : format d'échange .json d'Éléfiches.
export function deckToJSON(deck) {
  return JSON.stringify({ elefiches: 1, ...serialize(deck) }, null, 1);
}
// Une IA entoure souvent le paquet d'un bloc de code ou d'une phrase : on ne garde que l'objet JSON.
export const looksJSON = text => /^\s*(```\w*\s*)?\{/.test(text);
// Si l'IA a répondu en plusieurs fois, plusieurs blocs peuvent être collés à la suite : leurs fiches sont réunies.
function jsonBlocks(text) {
  const out = []; let depth = 0, start = -1, str = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (str) { if (ch === '\\') i++; else if (ch === '"') str = false; continue; }
    if (ch === '"' && depth) str = true;
    else if (ch === '{') { if (!depth++) start = i; }
    else if (ch === '}' && depth && !--depth) out.push(text.slice(start, i + 1));
  }
  return out;
}
export function deckFromJSON(text, name, level) {
  let d = null;
  for (const block of jsonBlocks(String(text))) {
    let x; try { x = JSON.parse(block); } catch { continue; }
    if (!x || !Array.isArray(x.cards)) continue;
    if (d) d.cards.push(...x.cards); else d = x;
  }
  if (!d) throw new Error('bad-json');
  if (!d || !Array.isArray(d.cards)) throw new Error('empty');
  if (d.cards.length > DECK_LIMITS.cards * 5) throw new Error('too-many');     // au-delà, on ne tente même pas la lecture
  const str = v => (typeof v === 'string' ? v : '');
  const cards = d.cards.filter(c => c && str(c.word)).map(c => ({
    id: safeKey(c.id) || hash(c.word + '|' + (str(c.definition) || Object.values(c.translations || {}).find(str) || '')), word: str(c.word), definition: str(c.definition) || undefined,
    translations: Object.fromEntries(Object.entries(c.translations && typeof c.translations === 'object' ? c.translations : {}).filter(([k, v]) => safeKey(k) && str(v))),
    examples: (Array.isArray(c.examples) ? c.examples : []).filter(str), theme: str(c.theme) || undefined, register: str(c.register) || undefined,
    family: str(c.family) || undefined, ipa: str(c.ipa) || undefined, image: imgRef(c.image) || undefined, audio: safeUrl(c.audio) || undefined, extra: {},
    sheet: /^P\d+-\d+$/i.test(str(c.sheet)) ? c.sheet : undefined, pos: str(c.pos) || undefined, gender: str(c.gender) || str(c.genre) || undefined, doubt: str(c.doubt) || str(c.doute) || undefined,
    marks: Array.isArray(c.marks) ? c.marks.map(m => (Array.isArray(m) && m.length === 2 ? [+m[0], +m[1]] : null)) : undefined, situation: str(c.situation) || undefined, distractors: (Array.isArray(c.distractors) ? c.distractors : []).filter(str),
  })).filter(c => c.definition || Object.keys(c.translations).length);
  if (cards.length < 3) throw new Error('too-few');
  const nm = name || str(d.name) || 'Paquet';
  return prepare({ id: 'd' + hash(norm(nm)), name: nm, lang: str(d.lang) || 'fr', level: LEVELS.includes(level) ? level : str(d.level).toUpperCase(), grid: str(d.grid), cards, skipped: d.cards.length - cards.length, fields: d.fields || [] });
}

// Paquet de démonstration, écrit pour Éléfiches.
export const DEMO_CSV = `Word;Definition;Example 1;Example 2;Category;Family;Situation;Distracteurs;Nature;Genre
Un café;Boisson chaude et noire, préparée avec des grains torréfiés.;Je prends un café le matin.;Elle boit son café sans sucre.;Au café · Registre courant;;Le matin, tu as besoin de te réveiller avant le cours.;lait|chocolat;nom;m
Un thé;Boisson chaude préparée avec des feuilles infusées dans l'eau.;Il commande un thé au citron.;Nous buvons du thé l'après-midi.;Au café · Registre courant;;Ton ami n'aime pas le café. Que fait-il ?;sirop|gâteau;nom;m
Commander;Demander un plat ou une boisson dans un café ou un restaurant.;Je voudrais commander un sandwich.;Ils commandent deux jus d'orange.;Au café · Registre courant;;Le serveur arrive à ta table et attend.;manger|préparer;verbe;
L'addition;Papier qui indique le prix total à payer au restaurant ou au café.;L'addition, s'il vous plaît !;Le serveur apporte l'addition.;Au café · Registre courant;addition;Tu as fini de manger et tu veux payer.;;nom;f
La note;Autre mot pour le papier qui indique le prix à payer, au café ou à l'hôtel.;Je demande la note avant de partir.;La note est de douze euros.;Au café · Registre courant;addition;Tu quittes l'hôtel et tu veux savoir combien tu dois.;carte|clé;nom;f
Un serveur / une serveuse;Personne qui apporte les plats et les boissons aux clients.;La serveuse arrive avec les boissons.;Le serveur est très aimable.;Au café · Registre courant;;Vous attendez vos boissons. Qui arrive ?;cliente|voisine;nom;mf
Un pourboire;Petite somme d'argent laissée en plus pour remercier du service.;Nous laissons un pourboire sur la table.;Elle donne un pourboire de deux euros.;Au café · Registre courant;;Le service était très bien et vous voulez dire merci.;billet|message;nom;m
Payer;Donner de l'argent pour un produit ou un service.;Je peux payer par carte ?;Vous pouvez payer à la caisse.;Au café · Registre courant;;Tu n'as pas d'argent liquide sur toi.;commander|réserver;verbe;
Avoir soif;Avoir envie ou besoin de boire.;J'ai soif, je voudrais de l'eau.;Les enfants ont soif après le match.;Au café · Registre courant;;Il fait très chaud et tu n'as rien bu depuis ce matin.;froid|sommeil;verbe;
Avoir faim;Avoir envie ou besoin de manger.;Tu as faim ? Il y a des croissants.;Nous avons faim à midi.;Au café · Registre courant;;Ton amie n'a rien mangé ce matin. Tu lui proposes quelque chose.;froid|peur;verbe;
Cher / chère;Qui coûte beaucoup d'argent.;Ce restaurant est trop cher.;La limonade est chère ici.;Au café · Registre courant;;Tu regardes les prix sur la carte et tu préfères partir.;loin|petit;adjectif;
Boire;Avaler un liquide.;J'ai soif : je voudrais boire quelque chose.;Qu'est-ce que vous voulez boire ?;Au café · Registre courant;;Tu as très soif et le serveur te demande ce que tu veux.;manger|payer;verbe;
Réserver;Demander à l'avance une table dans un restaurant.;Je voudrais réserver une table pour samedi soir.;Nous réservons toujours avant de venir.;Au café · Registre courant;;Le restaurant est souvent plein le samedi. Tu téléphones avant d'y aller.;commander|payer;verbe;
Avoir chaud;Sentir que la température est trop élevée.;J'ai trop chaud au soleil, on s'installe à l'ombre ?;Ils ont chaud en terrasse l'été.;Au café · Registre courant;;Le soleil tape sur ta table et tu veux changer de place.;froid|faim;verbe;
Une terrasse;Partie d'un café située dehors, avec des tables et des chaises.;Nous nous installons en terrasse.;La terrasse est pleine en été.;Au café · Registre courant;;Il fait beau et vous voulez boire un verre dehors.;cuisine|ville;nom;f
`;

// Illustrations du paquet de démonstration, dessinées pour Éléfiches.
const svg = body => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140">${body}</svg>`);
export const DEMO_IMAGES = {
  'Un café': svg('<rect width="200" height="140" rx="16" fill="#fdebd8"/><ellipse cx="96" cy="112" rx="62" ry="10" fill="#e9c9a6"/><path d="M52 52h88v26a36 36 0 0 1-36 36H88a36 36 0 0 1-36-36z" fill="#fff"/><path d="M140 60h10a14 14 0 0 1 0 28h-12" fill="none" stroke="#fff" stroke-width="9"/><ellipse cx="96" cy="53" rx="44" ry="9" fill="#6b4226"/><path d="M80 36c-6-8 6-10 0-20M100 36c-6-8 6-10 0-20M120 36c-6-8 6-10 0-20" fill="none" stroke="#c9a27e" stroke-width="4" stroke-linecap="round"/>'),
  'Un thé': svg('<rect width="200" height="140" rx="16" fill="#e6f4e4"/><ellipse cx="96" cy="114" rx="62" ry="9" fill="#bfdcb9"/><path d="M50 54h92l-10 46a14 14 0 0 1-14 11H74a14 14 0 0 1-14-11z" fill="#fff"/><path d="M140 62h10a13 13 0 0 1 0 26h-12" fill="none" stroke="#fff" stroke-width="8"/><ellipse cx="96" cy="55" rx="46" ry="8" fill="#c98a3b"/><path d="M112 56V30" stroke="#8a8a8a" stroke-width="2"/><rect x="104" y="14" width="18" height="18" rx="3" fill="#7fb77e"/>'),
  "L'addition": svg('<rect width="200" height="140" rx="16" fill="#e8ecfb"/><path d="M62 14h76v112l-9.5-8-9.5 8-9.5-8-9.5 8-9.5-8-9.5 8-9.5-8-9.5 8z" fill="#fff"/><path d="M76 36h48M76 52h30M76 68h38" stroke="#b7bfe0" stroke-width="5" stroke-linecap="round"/><path d="M118 52h6M118 68h6" stroke="#b7bfe0" stroke-width="5" stroke-linecap="round"/><path d="M76 92h48" stroke="#2b2a33" stroke-width="6" stroke-linecap="round"/><circle cx="150" cy="104" r="22" fill="#ff7a59"/><path d="M158 94a12 12 0 1 0 0 20M140 100h14M140 108h14" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'),
  'Un pourboire': svg('<rect width="200" height="140" rx="16" fill="#fff3d6"/><ellipse cx="100" cy="100" rx="76" ry="22" fill="#fff"/><ellipse cx="100" cy="97" rx="56" ry="14" fill="#f3ead2"/><g fill="#f2b632" stroke="#c98f12" stroke-width="3"><ellipse cx="82" cy="92" rx="18" ry="8"/><ellipse cx="82" cy="84" rx="18" ry="8"/><ellipse cx="118" cy="94" rx="18" ry="8"/><ellipse cx="104" cy="74" rx="18" ry="8"/></g>'),
  'Une terrasse': svg('<rect width="200" height="140" rx="16" fill="#dff1fb"/><rect y="104" width="200" height="36" fill="#cfe3c0"/><path d="M100 22l62 34H38z" fill="#ff7a59"/><path d="M100 22l22 34H78z" fill="#ffd0c2"/><path d="M100 52v62" stroke="#7a6a58" stroke-width="5"/><rect x="74" y="88" width="52" height="7" rx="3" fill="#7a6a58"/><path d="M52 112V84h16v28M148 112V84h-16v28" fill="none" stroke="#7a6a58" stroke-width="5" stroke-linejoin="round"/>'),
};

export function demoDeck() {
  const d = deckFromCSV(DEMO_CSV, 'Au café (A1)', 'fr');
  d.demo = true;
  for (const c of d.cards) if (DEMO_IMAGES[c.word]) c.image = DEMO_IMAGES[c.word];
  return d;
}

// Modèles de fichiers pour les enseignants : un par situation d'enseignement.
export const MODELS = {
  fr: { name: 'Modèle français', lang: 'fr', file: 'modele-francais.csv', csv: `Word;Definition;Example 1;Example 2;Category;Famille;Image;Audio;IPA;Nature;Genre
Un loyer;Somme d'argent payée chaque mois pour habiter un logement.;Mon loyer est de 600 euros par mois.;Le loyer augmente en janvier.;Logement · Registre courant;;;;;nom;m
Un colocataire / une colocataire;Personne qui partage un logement avec d'autres.;Ma colocataire est étudiante en droit.;Je cherche un colocataire pour septembre.;Logement · Registre courant;;;;;nom;mf
Déménager;Quitter un logement pour aller habiter ailleurs.;Nous allons déménager à Lyon cet été.;Il déménage la semaine prochaine.;Logement · Registre courant;;;;;verbe;
Un appart;Mot familier pour un appartement.;Elle a trouvé un appart près de la fac.;Ton appart est super lumineux.;Logement · Registre familier;appartement;;;;nom;m
` },
  en: { name: 'Modèle anglais', lang: 'en', level: 'B1', file: 'modele-anglais.csv', csv: `Word;Definition;Traduction FR;Example 1;Example 2;Category;Famille;Image;Audio;IPA;Nature;Genre
A deadline;The latest time or date by which something must be finished.;Une date limite;The deadline for the essay is Friday.;We missed the deadline by two days.;University · Neutral;;;;/ˈded.laɪn/;nom;
To hand in;To give a piece of work to a teacher.;Rendre (un devoir);Please hand in your report by Monday.;She handed in her essay late.;University · Neutral;;;;/hænd ɪn/;verbe;
A lecture;A formal talk given to a group of students.;Un cours magistral;The lecture starts at nine.;I took notes during the lecture.;University · Neutral;;;;/ˈlek.tʃər/;nom;
A tutorial;A class in which a small group of students discusses a subject with a teacher.;Un TD (travaux dirigés);We have a tutorial every Thursday.;The tutorial was cancelled today.;University · Neutral;;;;/tjuːˈtɔː.ri.əl/;nom;
` },
  es: { name: 'Modèle espagnol', lang: 'es', file: 'modele-espagnol.csv', csv: `Word;Definition;Traduction FR;Traduction EN;Example 1;Example 2;Category;Famille;Image;Audio;IPA;Nature;Genre
Una cita;Encuentro acordado entre dos o más personas a una hora y en un lugar.;Un rendez-vous;An appointment;Tengo una cita con el médico a las diez.;Llegó tarde a la cita.;Vida diaria · Neutro;;;;;nom;f
Madrugar;Levantarse muy temprano por la mañana.;Se lever très tôt;To get up very early;Mañana tengo que madrugar.;No me gusta madrugar los domingos.;Vida diaria · Neutro;;;;;verbe;
El sueldo;Dinero que recibe una persona cada mes por su trabajo.;Le salaire;The salary;Cobro el sueldo a final de mes.;Su sueldo no es muy alto.;Vida diaria · Neutro;;;;;nom;m
Quedar;Acordar un encuentro con alguien.;Se donner rendez-vous;To arrange to meet;Hemos quedado en la plaza a las ocho.;¿Quedamos mañana por la tarde?;Vida diaria · Coloquial;;;;;verbe;
` },
};
