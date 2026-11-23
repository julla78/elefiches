// Éléfiches — lecture des paquets de fiches (CSV) et modèle de données.
import { norm, noAcc, heads, clozes } from './match.js';

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
  [/^(word|mot|terme|term|palabra)$/, 'word'],
  [/^(definition|définition|definicion|definición)$/, 'definition'],
  [/^(example|exemple|ejemplo|phrase|sentence)\s*\d*$/, 'example'],
  [/^(image|imagen)$/, 'image'],
  [/^(audio|son|sound)$/, 'audio'],
  [/^(ipa|api|prononciation|pronunciation)$/, 'ipa'],
  [/^(category|catégorie|categorie|categoria|categoría)$/, 'category'],
  [/^(theme|thème|tema)$/, 'theme'],
  [/^(register|registre|registro)$/, 'register'],
  [/^(family|famille|familia)$/, 'family'],
  [/^(pos|nature|catégorie grammaticale)$/, 'pos'],
];

// « Traduction FR », « Translation (EN) », « Trad. español »… : une colonne par langue de traduction.
const TR = /^(?:translation|traduction|traduccion|traducción|trad)\.?\s*(?:[-–:(]\s*)?(\p{L}*)\)?$/u;
const LANGS = { fr: 'fr', francais: 'fr', french: 'fr', frances: 'fr', en: 'en', anglais: 'en', english: 'en', ingles: 'en', es: 'es', espagnol: 'es', spanish: 'es', espanol: 'es' };
const plain = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// N'accepte comme image ou son qu'un lien web, une image intégrée ou un chemin relatif.
export function safeUrl(u) {
  u = String(u || '').trim();
  if (/^(https?:\/\/|data:image\/|data:audio\/|data:video\/webm)/i.test(u)) return u;
  return /^[\w.\-\/ %]+$/.test(u) && !u.includes('..') ? u : '';
}

// Niveau du paquet (A1 à C2) : il décide de la langue des consignes et du feedback.
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
export const guessLevel = name => (String(name).toUpperCase().match(/(?<![A-Z0-9])([ABC][12])(?![A-Z0-9])/) || [])[1] || 'A2';

export function deckFromCSV(text, name, lang = 'fr', level) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('empty');
  const cols = rows[0].map(h => {
    const k = h.trim().toLowerCase();
    const tr = k.match(TR);
    if (tr) return 'tr:' + (LANGS[plain(tr[1])] || plain(tr[1]) || '*');
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
      else if (col === 'image' || col === 'audio') { const u = safeUrl(v); if (u) c[col] = u; }
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
  return prepare({ id: 'd' + hash(norm(name)), name, lang, level: LEVELS.includes(level) ? level : guessLevel(name), cards, skipped, fields: [...new Set(cols)] });
}

// Calcule ce qui se déduit des fiches : phrases à trous et fiches « voisines » (sens proche).
export function prepare(deck) {
  if (!LEVELS.includes(deck.level)) deck.level = guessLevel(deck.name);
  const tokSet = s => new Set(noAcc(norm(s || '')).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const info = deck.cards.map(c => ({
    heads: heads(c.word).map(noAcc).filter(h => !h.includes(' ') && h.length >= 4),
    def: tokSet(c.definition),
  }));
  deck.cards.forEach((c, i) => {
    c.translations ??= c.translation ? { '*': c.translation } : {};
    c.examples ??= [];
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
      if (fam || variant) nb.add(d.id);
    });
    c.neighbours = [...nb];
  });
  const seen = new Map();
  for (const c of deck.cards) seen.set(c.key, (seen.get(c.key) || 0) + 1);
  deck.homographs = new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));   // deux fiches « En »
  deck.helpLangs = [...new Set(deck.cards.flatMap(c => Object.keys(c.translations)))];
  deck.byId = Object.fromEntries(deck.cards.map(c => [c.id, c]));
  return deck;
}

// Forme enregistrable d'un paquet (sans les champs calculés).
export function serialize(deck) {
  return {
    id: deck.id, name: deck.name, lang: deck.lang, level: deck.level, fields: deck.fields, demo: deck.demo,
    cards: deck.cards.map(({ clozes, neighbours, bare, key, ...c }) => c),   // helpLangs et byId sont recalculés
  };
}

// Paquet complet (avec images et sons intégrés) : format d'échange .json d'Éléfiches.
export function deckToJSON(deck) {
  return JSON.stringify({ elefiches: 1, ...serialize(deck) }, null, 1);
}
export function deckFromJSON(text, name) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.cards)) throw new Error('empty');
  const str = v => (typeof v === 'string' ? v : '');
  const cards = d.cards.filter(c => c && str(c.word)).map((c, i) => ({
    id: str(c.id) || hash(c.word + '|' + i), word: str(c.word), definition: str(c.definition) || undefined,
    translations: Object.fromEntries(Object.entries(c.translations || {}).filter(([, v]) => str(v))),
    examples: (Array.isArray(c.examples) ? c.examples : []).filter(str), theme: str(c.theme) || undefined, register: str(c.register) || undefined,
    family: str(c.family) || undefined, ipa: str(c.ipa) || undefined, image: safeUrl(c.image) || undefined, audio: safeUrl(c.audio) || undefined, extra: {},
  })).filter(c => c.definition || Object.keys(c.translations).length);
  if (cards.length < 3) throw new Error('too-few');
  const nm = name || str(d.name) || 'Paquet';
  return prepare({ id: 'd' + hash(norm(nm)), name: nm, lang: str(d.lang) || 'fr', level: str(d.level), cards, skipped: d.cards.length - cards.length, fields: d.fields || [] });
}

// Paquet de démonstration, écrit pour Éléfiches.
export const DEMO_CSV = `Word;Definition;Example 1;Example 2;Category;Family
Un café;Boisson chaude et noire, préparée avec des grains torréfiés.;Je prends un café le matin.;Elle boit son café sans sucre.;Au café · Registre courant;
Un thé;Boisson chaude préparée avec des feuilles infusées dans l'eau.;Il commande un thé au citron.;Nous buvons du thé l'après-midi.;Au café · Registre courant;
Commander;Demander un plat ou une boisson dans un café ou un restaurant.;Je voudrais commander un sandwich.;Ils commandent deux jus d'orange.;Au café · Registre courant;
L'addition;Papier qui indique le prix total à payer au restaurant ou au café.;L'addition, s'il vous plaît !;Le serveur apporte l'addition.;Au café · Registre courant;addition
La note;Autre mot pour le papier qui indique le prix à payer, au café ou à l'hôtel.;Je demande la note avant de partir.;La note est de douze euros.;Au café · Registre courant;addition
Un serveur / une serveuse;Personne qui apporte les plats et les boissons aux clients.;La serveuse arrive avec les boissons.;Le serveur est très aimable.;Au café · Registre courant;
Un pourboire;Petite somme d'argent laissée en plus pour remercier du service.;Nous laissons un pourboire sur la table.;Elle donne un pourboire de deux euros.;Au café · Registre courant;
Payer;Donner de l'argent pour un produit ou un service.;Je peux payer par carte ?;Vous pouvez payer à la caisse.;Au café · Registre courant;
Avoir soif;Avoir envie ou besoin de boire.;J'ai soif, je voudrais de l'eau.;Les enfants ont soif après le match.;Au café · Registre courant;
Avoir faim;Avoir envie ou besoin de manger.;Tu as faim ? Il y a des croissants.;Nous avons faim à midi.;Au café · Registre courant;
Cher / chère;Qui coûte beaucoup d'argent.;Ce restaurant est trop cher.;La limonade est chère ici.;Au café · Registre courant;
Une terrasse;Partie d'un café située dehors, avec des tables et des chaises.;Nous nous installons en terrasse.;La terrasse est pleine en été.;Au café · Registre courant;
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
  fr: { name: 'Modèle français', lang: 'fr', file: 'modele-francais.csv', csv: `Word;Definition;Example 1;Example 2;Category;Famille;Image;Audio;IPA
Un loyer;Somme d'argent payée chaque mois pour habiter un logement.;Mon loyer est de 600 euros par mois.;Le loyer augmente en janvier.;Logement · Registre courant;;;;
Un colocataire / une colocataire;Personne qui partage un logement avec d'autres.;Ma colocataire est étudiante en droit.;Je cherche un colocataire pour septembre.;Logement · Registre courant;;;;
Déménager;Quitter un logement pour aller habiter ailleurs.;Nous allons déménager à Lyon cet été.;Il déménage la semaine prochaine.;Logement · Registre courant;;;;
Un appart;Mot familier pour un appartement.;Elle a trouvé un appart près de la fac.;Ton appart est super lumineux.;Logement · Registre familier;appartement;;;
` },
  en: { name: 'Modèle anglais', lang: 'en', level: 'B1', file: 'modele-anglais.csv', csv: `Word;Definition;Traduction FR;Example 1;Example 2;Category;Famille;Image;Audio;IPA
A deadline;The latest time or date by which something must be finished.;Une date limite;The deadline for the essay is Friday.;We missed the deadline by two days.;University · Neutral;;;;/ˈded.laɪn/
To hand in;To give a piece of work to a teacher.;Rendre (un devoir);Please hand in your report by Monday.;She handed in her essay late.;University · Neutral;;;;/hænd ɪn/
A lecture;A formal talk given to a group of students.;Un cours magistral;The lecture starts at nine.;I took notes during the lecture.;University · Neutral;;;;/ˈlek.tʃər/
A tutorial;A class in which a small group of students discusses a subject with a teacher.;Un TD (travaux dirigés);We have a tutorial every Thursday.;The tutorial was cancelled today.;University · Neutral;;;;/tjuːˈtɔː.ri.əl/
` },
  es: { name: 'Modèle espagnol', lang: 'es', file: 'modele-espagnol.csv', csv: `Word;Definition;Traduction FR;Traduction EN;Example 1;Example 2;Category;Famille;Image;Audio;IPA
Una cita;Encuentro acordado entre dos o más personas a una hora y en un lugar.;Un rendez-vous;An appointment;Tengo una cita con el médico a las diez.;Llegó tarde a la cita.;Vida diaria · Neutro;;;;
Madrugar;Levantarse muy temprano por la mañana.;Se lever très tôt;To get up very early;Mañana tengo que madrugar.;No me gusta madrugar los domingos.;Vida diaria · Neutro;;;;
El sueldo;Dinero que recibe una persona cada mes por su trabajo.;Le salaire;The salary;Cobro el sueldo a final de mes.;Su sueldo no es muy alto.;Vida diaria · Neutro;;;;
Quedar;Acordar un encuentro con alguien.;Se donner rendez-vous;To arrange to meet;Hemos quedado en la plaza a las ocho.;¿Quedamos mañana por la tarde?;Vida diaria · Coloquial;;;;
` },
};
