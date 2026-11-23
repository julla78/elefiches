// Éléfiches — interface : accueil, espace enseignant, session, bilan.
import * as store from './store.js';
import { deckFromCSV, deckFromJSON, deckFromAnki, mergeDecks, deckToJSON, looksJSON, levelIn, prepare, serialize, hash, demoDeck, MODELS, safeUrl, LEVELS } from './deck.js';
import { summary, boxOf, dueInDays, isNew, stageOf, HERD_BOX } from './scheduler.js';
import { Session, Challenge, Tour, meaning, gloss, pickNew, judge, roomFor } from './session.js';
import { clozeParts, norm, noAcc, noArt, diffParts, remark, spoken, slug } from './match.js';
import { unzip, typeOf } from './zip.js';
import { buildPrompts, GRIDS, gridOf } from './prompts.js';
import { openSqlite } from './sqlite.js';
import { STR, LANG_NAMES } from './i18n.js';

const app = document.getElementById('app');
// Deux interfaces sur le même code : index.html pour les étudiants (jouer), enseignant.html pour créer et modifier les paquets.
const TEACHER = document.body.dataset.mode === 'teacher';
const siteBase = () => location.origin + location.pathname.replace(/[^/]*\.html$/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { lang: 'auto', minutes: 5, maxNew: 3, help: 'fr', sound: true, voice: true, decks: [], progress: {}, view: 'home', notice: null, toast: null, confirmReset: null, confirmDel: null, editId: null, cardId: null, draft: {}, local: null, gate: false, builder: { lang: 'fr', level: '', topic: '', count: 20, words: '', grid: '3x3' }, sheets: [], loose: [], perm: 0 };
// Langue des consignes et du feedback. En mode automatique : français jusqu'au niveau B1,
// langue apprise à partir de B2 (règle fixée par Julie). L'étudiant peut toujours choisir lui-même.
function uiLang() {
  if (S.lang !== 'auto') return S.lang;
  const d = (S.view === 'session' || S.view === 'done') && S.session?.deck;
  return d && ['B2', 'C1', 'C2'].includes(d.level) && STR[d.lang] ? d.lang : 'fr';
}
const t = (k, ...a) => { let s = (STR[uiLang()] || STR.fr)[k] ?? STR.fr[k] ?? k; if (typeof s !== 'string') return s; a.forEach((v, i) => { s = s.replaceAll('{' + i + '}', v); }); return s; };
const hue = theme => parseInt(hash(theme || 'x'), 36) % 360;
const VOICES = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' };
const pctOf = x => Math.round(100 * x);

// Éléphant original, dessiné pour Éléfiches, vu de profil. Cinq âges, un par boîte, inspirés des vrais éléphants :
// nouveau-né brun rosé et duveteux, éléphanteau beige, jeune gris aux premières défenses, adulte gris ardoise,
// ancienne aux longues défenses, aux grandes oreilles et au pique-bœuf blanc sur le dos.
const AGES = [null,
  { skin: '#cdb8ab', shade: '#b79f92', ear: '#dcc6bb', body: 0.8, head: 1.12, earS: 0.78, tusk: 0, fuzz: true, trunk: 'M98 46C104 50 104 58 101 63' },
  { skin: '#c8bdae', shade: '#b0a596', ear: '#d9cec1', body: 0.88, head: 1.06, earS: 0.88, tusk: 0, fuzz: true, trunk: 'M98 46C106 50 106 62 101 69C99 72 96 71 97 68' },
  { skin: '#babcc1', shade: '#a3a5ab', ear: '#cdcbcf', body: 0.94, head: 1, earS: 1, tusk: 5, trunk: 'M98 45C109 50 107 68 101 77C98 82 92 80 94 75' },
  { skin: '#a4aab4', shade: '#8d939e', ear: '#babac2', body: 1, head: 1, earS: 1.12, tusk: 10, trunk: 'M98 45C109 50 107 68 101 77C98 82 92 80 94 75' },
  { skin: '#98959b', shade: '#817e85', ear: '#aca5a8', body: 1.03, head: 1, earS: 1.22, tusk: 16, old: true, trunk: 'M98 45C109 50 107 68 101 77C98 82 92 80 94 75' },
];
function mascot(size = 72, cls = '', age = 2) {
  const A = AGES[age], k = 1 - A.body;
  const tusk = A.tusk ? `<path d="M95 54q${A.tusk * 0.4} ${A.tusk * 0.6} ${A.tusk} ${A.tusk * 0.05}" fill="none" stroke="#fffaf0" stroke-width="${A.tusk > 8 ? 3.8 : 3.2}" stroke-linecap="round"/>` : '<path d="M92 55q3 3 6 0" fill="none" stroke="#7d6a61" stroke-width="1.4" stroke-linecap="round"/>';
  const fuzz = A.fuzz ? '<path d="M78 23l-1-5M83 21v-6M88 23l2-5" stroke="#9a7b6b" stroke-width="1.6" stroke-linecap="round"/>' : '';
  const old = A.old ? `<path d="M102 60h5M101 67h5M58 42q4 4 0 8" fill="none" stroke="${A.shade}" stroke-width="1.3" stroke-linecap="round"/>` : '';
  const bird = A.old ? '<g class="e-bird"><path d="M44 26v4M48 26v4" stroke="#6b6878" stroke-width="1"/><ellipse cx="46" cy="23" rx="5.5" ry="3.6" fill="#fff"/><circle cx="51.5" cy="18.5" r="2.4" fill="#fff"/><path d="M53.5 18l4.5 1-4.5 1z" fill="#f2a33a"/><circle cx="52" cy="18" r=".6" fill="#2b2a33"/></g>' : '';
  return `<svg class="mascot ${cls}" width="${Math.round(size * 1.2)}" height="${size}" viewBox="0 0 120 100" aria-hidden="true">
    <ellipse cx="58" cy="92" rx="${36 * A.body}" ry="4" fill="#000" opacity=".08"/>
    <g transform="translate(52 90) scale(${A.body}) translate(-52 -90)">
      <rect x="39" y="62" width="12" height="26" rx="5" fill="${A.shade}"/><rect x="71" y="62" width="12" height="26" rx="5" fill="${A.shade}"/>
      <path class="e-tail" d="M20 44C12 48 12 58 15 64" fill="none" stroke="${A.shade}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="52" cy="52" rx="34" ry="24" fill="${A.skin}"/>
      <rect x="29" y="64" width="13" height="27" rx="6" fill="${A.skin}"/><rect x="61" y="64" width="13" height="27" rx="6" fill="${A.skin}"/>
      <path d="M31.500 89.500h2.500M36 89.500h2.500M63.500 89.500h2.500M68 89.500h2.500" stroke="#f6efe6" stroke-width="2" stroke-linecap="round"/>
      ${A.fuzz ? '<path d="M40 30l-1-4M47 29v-4" stroke="#9a7b6b" stroke-width="1.5" stroke-linecap="round"/>' : ''}${bird}
    </g>
    <g transform="translate(${-k * 30} ${k * 40}) translate(78 50) scale(${A.head}) translate(-78 -50)">
      <circle cx="84" cy="42" r="20" fill="${A.skin}"/>${fuzz}
      <g class="e-trunk"><path d="${A.trunk}" fill="none" stroke="${A.skin}" stroke-width="9" stroke-linecap="round"/>${old}</g>${tusk}
      <circle cx="96" cy="48" r="3" fill="#f0a08c" opacity=".4"/>
      <g class="e-eye"><circle cx="91" cy="38" r="${age === 1 ? 3.3 : 2.8}" fill="#2b2a33"/><circle cx="92" cy="37" r="1" fill="#fff"/></g>
      <g class="e-ear"><path d="M80 22C62 14 50 32 55 48C59 62 75 64 82 50C85 42 85 30 80 22Z" fill="${A.ear}" stroke="${A.shade}" stroke-width="1.2" transform="translate(81 38) scale(${A.earS}) translate(-81 -38)"/></g>
      <text class="e-zz" x="100" y="22" font-size="13" font-weight="700" fill="#8d939e">z</text><text class="e-zz z2" x="108" y="12" font-size="9" font-weight="700" fill="#8d939e">z</text>
    </g>
  </svg>`;
}
// Tête de profil : pendant la session, la barre de progression est sa trompe, qui s'allonge vers la cacahuète.
const head = (cls = '') => `<svg class="head ${cls}" width="46" height="44" viewBox="52 18 54 50" aria-hidden="true"><circle cx="84" cy="42" r="20" fill="#a4aab4"/><path d="M95 54q4 6 10 .500" fill="none" stroke="#fffaf0" stroke-width="3.6" stroke-linecap="round"/><circle cx="96" cy="48" r="3" fill="#f0a08c" opacity=".4"/><g class="e-eye"><circle cx="91" cy="38" r="2.8" fill="#2b2a33"/><circle cx="92" cy="37" r="1" fill="#fff"/></g><g class="e-ear"><path d="M80 22C62 14 50 32 55 48C59 62 75 64 82 50C85 42 85 30 80 22Z" fill="#babac2" stroke="#8d939e" stroke-width="1.2"/></g></svg>`;

// Une seule cacahuète, dessinée pour Éléfiches : elle marque l'arrivée, au bout de la trompe.
const NUT = '<svg class="nut" width="32" height="20" viewBox="0 0 40 24" aria-hidden="true"><path d="M11 2C5 2 1 6.500 1 12s4 10 10 10c3 0 5-1.500 9-1.500s6 1.500 9 1.500c6 0 10-4.500 10-10S35 2 29 2c-3 0-5 1.500-9 1.500S14 2 11 2z" fill="#e6bf82" stroke="#a8782f" stroke-width="1.5"/><path d="M8 8l4 8M14 7l3 9M24 8l3 8M30 7l3 8" stroke="#bf9150" stroke-width="1.2" stroke-linecap="round"/></svg>';
// Empreinte d'éléphant : bouton des règles du jeu.
// Paire de défenses : la récompense d'un défi d'étape réussi.
const tusks = (size = 30, on = true) => `<svg class="tusks${on ? '' : ' off'}" width="${size}" height="${Math.round(size * 0.8)}" viewBox="0 0 40 32" aria-hidden="true"><path d="M12 3c-7 3-10 12-6 19 3 5 9 7 13 6-5-2-8-6-8-11 0-5 1-9 4-13z"/><path d="M28 3c7 3 10 12 6 19-3 5-9 7-13 6 5-2 8-6 8-11 0-5-1-9-4-13z"/></svg>`;
const FOOT = '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><ellipse cx="13" cy="15" rx="9" ry="8.500" fill="currentColor"/><ellipse cx="5.500" cy="6.500" rx="2.300" ry="2.800" fill="currentColor"/><ellipse cx="10.500" cy="3.800" rx="2.300" ry="2.800" fill="currentColor"/><ellipse cx="15.800" cy="3.800" rx="2.300" ry="2.800" fill="currentColor"/><ellipse cx="20.700" cy="6.500" rx="2.300" ry="2.800" fill="currentColor"/></svg>';
// Barre de progression : la trompe s'allonge de la tête vers la cacahuète.
const trunkBar = (pct, cls, label) => `<div class="trunk" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">${head(cls)}<div class="track"><span style="width:${pct}%"></span></div>${NUT}</div>`;

// ---------- Sons ----------

let voices = [], audioCtx = null;
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch { voices = []; } };
try { loadVoices(); speechSynthesis.addEventListener('voiceschanged', () => { loadVoices(); if (S.view === 'home' && !S.session) render(); }); } catch { /* pas de synthèse vocale */ }

// Choix de la voix : la langue du paquet d'abord (variante attendue, sinon une autre variante de la même langue),
// puis les voix de bonne qualité ; les voix fantaisie de certains systèmes sont écartées.
const ODD = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|junior|ralph|fred|eddy|flo\b|grandma|grandpa|reed|rocko|sandy|shelley/i;
const FINE = /google|microsoft|natural|neural|enhanced|premium|siri|online/i;
const vlang = v => (v.lang || '').replace('_', '-').toLowerCase();
function voiceFor(lang) {
  const code = (VOICES[lang] || lang).toLowerCase();
  const score = v => (vlang(v) === code ? 8 : 0) + (FINE.test(v.name) ? 2 : 0) + (v.default ? 1 : 0) - (ODD.test(v.name) ? 6 : 0);
  return voices.filter(v => vlang(v) === code || vlang(v).startsWith(lang + '-') || vlang(v) === lang).sort((a, b) => score(b) - score(a))[0] || null;
}

function toast(text) { S.toast = text; render(); setTimeout(() => { if (S.toast === text) { S.toast = null; render(); } }, 4000); }

// Lit le mot : fichier audio de la fiche s'il existe, sinon voix de l'appareil dans la langue du paquet.
function speak(card, lang, { auto = false } = {}) {
  const say = text => { if (!auto) toast(text); };            // la lecture automatique reste discrète si la voix manque
  const tts = () => {
    try {
      if (!voices.length) loadVoices();
      const code = VOICES[lang] || lang, v = voiceFor(lang);
      const u = new SpeechSynthesisUtterance(spoken(card.word));
      if (v) u.voice = v;
      u.lang = v?.lang?.replace('_', '-') || code; u.rate = 0.9;
      let started = false;
      u.onstart = () => { started = true; };
      u.onerror = e => { started = true; if (e.error !== 'interrupted' && e.error !== 'canceled') say(t('ttsSilent')); };
      setTimeout(() => { if (!started) say(t('ttsSilent')); }, 2500);   // certains cadres bloquent la voix sans le dire
      speechSynthesis.resume?.();
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
        setTimeout(() => speechSynthesis.speak(u), 80);      // Chrome reste muet si « speak » suit « cancel » sans délai
      } else speechSynthesis.speak(u);                       // sans délai : iOS n'accepte la voix que dans le geste de l'utilisateur
      if (voices.length && !v) say(t('noVoice', LANG_NAMES[lang] || lang));
    } catch { say(t('noVoice', LANG_NAMES[lang] || lang)); }
  };
  if (card.audio) { try { new Audio(card.audio).play().catch(tts); } catch { tts(); } } else tts();
}
// Chaque mot s'entend sans rien demander : à sa découverte, puis après chaque réponse (réglage « Prononciation automatique »).
function autoSpeak() { const c = S.step?.card; if (!S.voice || !c || !S.session || S.spoke === S.step) return; S.spoke = S.step; speak(c, S.session.deck.lang, { auto: true }); }

function sfx(kind) {
  if (!S.sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume?.();
    const t0 = audioCtx.currentTime + 0.01;
    // Une note : type d'onde, fréquence de départ et d'arrivée, début, durée, volume.
    const note = (type, f1, f2, at, dur, vol, cut = 6000) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cut; o.type = type;
      o.frequency.setValueAtTime(f1, t0 + at); o.frequency.exponentialRampToValueAtTime(f2, t0 + at + dur);
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + Math.min(0.04, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(f); f.connect(g); g.connect(audioCtx.destination); o.start(t0 + at); o.stop(t0 + at + dur + 0.03);
    };
    if (kind === 'trumpet') { note('sawtooth', 196, 415, 0, 0.3, 0.15, 1500); note('sawtooth', 415, 330, 0.3, 0.42, 0.15, 1500); }   // barrissement
    else if (kind === 'steps') { note('triangle', 190, 95, 0, 0.14, 0.22, 900); note('triangle', 170, 85, 0.18, 0.16, 0.2, 900); }     // deux pas d'éléphant, doux
    else if (kind === 'birds') [[0, 2600, 3900, 0.09], [0.12, 3000, 4200, 0.08], [0.24, 2600, 3900, 0.09], [0.52, 3500, 2500, 0.12], [0.7, 3600, 4600, 0.07], [0.8, 3600, 4600, 0.07], [1.05, 2800, 4000, 0.1]]
      .forEach(([at, f1, f2, d]) => note('sine', f1, f2, at, d, 0.08));                                                               // chants d'oiseaux
    else note('sine', 620, 930, 0, 0.18, 0.1);
  } catch { /* son indisponible */ }
}

// ---------- Données ----------

async function load() {
  const set = (await store.get('settings')) || {};
  Object.assign(S, { lang: set.lang || 'auto', minutes: set.minutes || 5, maxNew: set.maxNew || 3, help: set.help || 'fr', sound: set.sound ?? true, voice: set.voice ?? true });
  const saved = (await store.get('decks')) || [];
  S.decks = saved.map(prepare);
  if (!S.decks.length) { S.decks = [demoDeck()]; await saveDecks(); }
  for (const d of S.decks) S.progress[d.id] = (await store.get('progress:' + d.id)) || {};
  // Lien de partage : « …/?paquet=logement-a2 » ouvre le fichier paquets/logement-a2.json rangé à côté de l'application
  // (ou une adresse complète). L'étudiant n'a rien d'autre à faire que d'ouvrir le lien.
  const ref = new URLSearchParams(location.search).get('paquet');
  if (ref) {
    try {
      const plain = ref.replace(/\.json$/i, '').replace(/[^\w.-]/g, '');
      let res = await fetch(/^https?:\/\//i.test(ref) ? ref : `paquets/${plain}.json`);
      if (!res.ok && slug(ref.replace(/\.json$/i, '')) !== plain) res = await fetch(`paquets/${slug(ref.replace(/\.json$/i, ''))}.json`);   // lien tapé avec des accents ou des majuscules
      if (!res.ok) throw new Error('link');
      const deck = deckFromJSON(await res.text());
      S.decks = [...S.decks.filter(d => d.id !== deck.id && !(d.demo && !Object.keys(S.progress[d.id] || {}).length)), deck];
      S.progress[deck.id] ??= (await store.get('progress:' + deck.id)) || {};
      await saveDecks(); S.notice = { text: t('opened', deck.name) };
      history.replaceState(null, '', location.pathname);
    } catch { S.notice = { bad: true, text: t('errLink') }; }
  }
  if (TEACHER && location.hash !== '#accueil') S.view = 'teacher';
}
const saveDecks = () => store.set('decks', S.decks.map(serialize));
const saveSettings = () => store.set('settings', { lang: S.lang, minutes: S.minutes, maxNew: S.maxNew, help: S.help, sound: S.sound, voice: S.voice });
const saveProgress = id => store.set('progress:' + id, S.progress[id]);

// Langue des traductions affichées pour un paquet, selon le réglage de l'étudiant et ce que le paquet contient.
function helpFor(deck) {
  if (S.help === 'none') return null;
  return deck.helpLangs.includes(S.help) ? S.help : deck.helpLangs.includes('*') ? '*' : null;
}

// ---------- Accueil ----------

// Le troupeau : un éléphanteau naît à chaque mot découvert et grandit de la boîte 1 à la boîte 5.
// La prairie montre les éléphants de l'étape en cours : dix au plus, assez grands pour qu'on voie leur âge.
function prairie(d, s, hop = [], sleeping = false) {
  const [from, to] = s.stage.bounds[s.stage.index - 1], ids = new Set(d.cards.slice(from, to).map(c => c.id));
  const sizes = [0, 46, 52, 58, 64, 70], mine = s.animals.filter(a => ids.has(a.id));
  const herd = mine.map(a => `<span class="ele${hop.includes(a.id) ? ' hop' : ''}">${mascot(sizes[a.box], sleeping ? 'sleep' : 'idle', a.box)}</span>`).join('');
  return `<div class="prairie" role="img" aria-label="${esc(t('stageAria', s.stage.index, s.stage.count, s.stage.seen, s.stage.size))}">${herd || `<span class="hintline">${t('emptyStage')}</span>`}</div>`;
}

// Défi d'étape : proposé quand tous les mots d'une étape ont été découverts un jour précédent.
// C'est une révision espacée : le jour même de la découverte, il serait trop facile pour servir la mémoire.
// Où en est le défi : ouvert, ou ce qu'il manque pour l'ouvrir. Le but reste toujours visible.
function challengeLine(d, P) {
  const st = stageOf(d, P), done = P._stages || {}, won = Object.keys(done).length, open = pendingStage(d, P);
  const next = Array.from({ length: st.count }, (_, i) => i + 1).find(i => !done[i]);
  let line = '';
  if (open) line = `<button class="secondary challenge" data-action="challenge" data-id="${d.id}" data-stage="${open}">${tusks(26)}<span>${t('challengeBtn', open)}</span></button>`;
  else if (next) {
    const [a, b] = st.bounds[next - 1], left = d.cards.slice(a, b).filter(c => isNew(P[c.id])).length;
    line = `<p class="chlock">${tusks(22, false)}<span>${left ? t('chLockedNew', next, left) : t('chLockedNight', next)}</span></p>`;
  }
  return `${line}${won ? `<p class="tuskrow" aria-label="${t('tusksLine', won, st.count)}">${Array.from({ length: Math.min(won, 12) }, () => tusks(20)).join('')}<span>${t('tusksLine', won, st.count)}</span></p>` : ''}`;
}
function pendingStage(d, P) {
  const st = stageOf(d, P), done = P._stages || {}, today = new Date(Date.now()).setHours(0, 0, 0, 0);
  for (let i = 0; i < st.count; i++) {
    if (done[i + 1]) continue;
    const [a, b] = st.bounds[i];
    return d.cards.slice(a, b).every(c => !isNew(P[c.id]) && (P[c.id].born || 0) < today) ? i + 1 : 0;
  }
  return 0;
}

function deckCard(d) {
  const P = S.progress[d.id], s = summary(d, P), canStart = s.due + pickNew(d, P, S.maxNew).length > 0;
  const nextDays = Math.min(...d.cards.map(c => dueInDays(P[c.id])).filter(n => n > 0), 999);
  const pct = Math.round(100 * s.stage.seen / s.stage.size);
  const held = pickNew(d, P, S.maxNew).length > roomFor(s.due, S.maxNew);
  const mute = voices.length && !voiceFor(d.lang) && d.cards.some(c => !c.audio);
  return `<article class="deck card" style="--th:${hue(d.cards[0].theme || d.name)}">
    <div><h2 lang="${d.lang}">${esc(d.name)}</h2><p class="meta">${LANG_NAMES[d.lang] || d.lang} · ${d.level}${d.demo ? ' · ' + t('demo') : ''}</p></div>
    ${prairie(d, s, [], !canStart)}
    <div class="stagebar"><span>${t('stageN', s.stage.index)}</span>${trunkBar(pct, 'idle', t('stageAria', s.stage.index, s.stage.count, s.stage.seen, s.stage.size))}</div>
    ${canStart ? `<button class="primary" data-action="start" data-id="${d.id}">${t('start', S.minutes)}</button>` : `<p class="rest">${t('nothing', nextDays)}</p>`}
    ${held ? `<p class="heldline">${t('heldHome')} <button class="link" data-action="start-force" data-id="${d.id}">${t('heldForce')}</button></p>` : ''}
    ${mute ? `<p class="banner warn">${t('noVoiceDeck', LANG_NAMES[d.lang] || d.lang)}</p>` : ''}
    ${challengeLine(d, P)}
    <button class="link" data-action="herd" data-id="${d.id}">${t('herdBtn', s.animals.length)}</button>
  </article>`;
}

// Tout le troupeau d'un paquet, étape par étape, avec le mot écrit sous chaque éléphant.
function herdView() {
  const d = S.decks.find(x => x.id === S.herdId), P = S.progress[d.id], s = summary(d, P), ages = t('ageNames');
  const stages = s.stage.bounds.map(([a, b], i) => {
    const cards = d.cards.slice(a, b), seen = cards.filter(c => boxOf(P[c.id]) > 0);
    if (!seen.length && i > s.stage.index - 1) return '';
    return `<section class="card"><h2>${t('stageN', i + 1)} ${(P._stages || {})[i + 1] ? tusks(26) : ''}</h2><ul class="herdlist">${seen.map(c => `<li>${mascot(54, 'idle', boxOf(P[c.id]))}<b lang="${d.lang}">${esc(c.bare)}</b><span class="vh">${ages[boxOf(P[c.id]) - 1]}</span></li>`).join('')}</ul>
      ${cards.length > seen.length ? `<p class="meta">${t('toDiscover', cards.length - seen.length)}</p>` : ''}</section>`;
  }).join('');
  return `<button class="link" data-action="home">← ${t('back')}</button>
    <h1>${t('herdView')}</h1><p class="lead" lang="${d.lang}">${esc(d.name)}</p>
    ${stages}
    ${S.confirmReset === d.id
      ? `<button class="link danger" data-action="reset-yes" data-id="${d.id}">${t('resetSure')}</button>`
      : `<button class="link" data-action="reset" data-id="${d.id}">${t('reset')}</button>`}`;
}

function rulesView() {
  const ages = t('ageNames');
  return `<button class="link" data-action="home">← ${t('back')}</button>
    <h1>${t('rules')}</h1>
    ${t('rulesText').map(([title, text], i) => `<section class="card"><h2>${title}</h2><p>${text}</p>
      ${i === 1 ? `<ol class="agelist">${ages.map((n, k) => `<li>${mascot(46, '', k + 1)}<span><b>${n}</b><br><span class="meta">${t('box', k + 1)}</span></span></li>`).join('')}</ol>` : ''}
      ${i === 2 ? trunkBar(60, '', t('rules')) : ''}</section>`).join('')}`;
}

const opt = (v, cur, label) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
const seg = (key, cur, items) => `<div class="seg" role="group">${items.map(([v, l]) => `<button type="button" data-action="set" data-key="${key}" data-value="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
const setrow = (label, control) => `<div class="setrow"><span>${t(label)}</span>${control}</div>`;
const langOpts = cur => Object.entries(LANG_NAMES).map(([k, n]) => opt(k, cur, n)).join('');
const banners = () => `${store.isPersistent() ? '' : `<p class="banner warn">${t('notSaved')}</p>`}
  ${S.notice ? `<p class="banner ${S.notice.bad ? 'warn' : 'good'}" role="status">${esc(S.notice.text)}</p>` : ''}`;

function home() {
  return `${TEACHER ? `<button class="link" data-action="teacher">← ${t('eBack')}</button>` : ''}<header class="top">${mascot(64, 'idle', 2)}<div class="brand"><h1>Éléfiches</h1><p>${t('tagline')}</p></div>
      <button class="rulesbtn" data-action="rules">${FOOT}<span>${t('rules')}</span></button></header>
    ${banners()}
    <div class="appetite"><span class="aplabel">${NUT}${t('appetite')}</span>${seg('maxNew', S.maxNew, [[3, t('ap1')], [5, t('ap2')], [8, t('ap3')]])}</div>
    <section class="decks">${S.decks.map(deckCard).join('')}</section>
    <details class="card settings"><summary><span aria-hidden="true">⚙️</span> ${t('settings')}</summary>
      ${setrow('appLang', seg('lang', S.lang, [['auto', t('auto')], ...Object.entries(LANG_NAMES)]))}
      <p class="sethint">${t('autoHint')}</p>
      ${setrow('help', seg('help', S.help, [['none', t('helpNone')], ...Object.entries(LANG_NAMES)]))}
      ${setrow('duration', seg('minutes', S.minutes, [3, 5, 10, 15].map(m => [m, t('min', m)])))}
      ${setrow('sound', seg('sound', S.sound ? '1' : '0', [['1', t('on')], ['0', t('off')]]))}
      ${setrow('voiceAuto', seg('voice', S.voice ? '1' : '0', [['1', t('onF')], ['0', t('offF')]]))}
      <p class="sethint">${t('voiceHint')}</p>
    </details>
    <label class="link filelabel">${t('openPacket')}<input type="file" class="vh" data-file="packet" accept=".json,.zip,.apkg,application/json,application/zip"></label>
    ${TEACHER ? `<button class="secondary" data-action="teacher">${t('teacher')}</button>` : ''}`;
}

// ---------- Espace enseignant ----------

const prompts = () => buildPrompts(S.builder);
const promptBox = (k, label) => `<div class="promptbox"><p class="label">${t(label)}</p><pre class="prompt" data-prompt="${k}" tabindex="0">${esc(S.builder.level ? prompts()[k] : t('pickLevel'))}</pre>
  <button type="button" class="secondary small" data-action="copy-prompt" data-k="${k}">${t('copyPrompt')}</button></div>`;
// Met à jour les prompts sans redessiner la page, pour ne pas effacer ce que l'enseignant est en train d'écrire.
function refreshPrompts() {
  const p = prompts();
  for (const el of app.querySelectorAll('[data-prompt]')) el.textContent = S.builder.level ? p[el.dataset.prompt] : t('pickLevel');
}

function teacherView() {
  const B = S.builder;
  const model = (k, title, sub) => `<li><b>${t(title)}</b><span class="meta">${t(sub)}</span>
    <span class="row"><button class="secondary small" data-action="dl" data-model="${k}">${t('download')}</button>
    <button class="secondary small" data-action="copy" data-model="${k}">${t('copy')}</button>
    <button class="secondary small" data-action="try" data-model="${k}">${t('tryIt')}</button></span></li>`;
  const row = (name, need, what) => `<tr><th scope="row">${name}</th><td>${t(need)}</td><td>${t(what)}</td></tr>`;
  const levels = cur => `<option value="">${t('choose')}</option>${LEVELS.map(l => opt(l, cur, l)).join('')}`;
  return `<button class="link" data-action="home">${t('asStudent')} →</button>
    <h1>${t('tTitle')}</h1><p class="lead">${t('tIntro')}</p>
    <p class="studenturl">${t('studentUrl')} <b>${esc(siteBase())}</b></p>
    ${banners()}
    <section class="card"><h2>${t('myDecks')}</h2><ul class="decklist">${S.decks.map(d => `<li>
      <span><b lang="${d.lang}">${esc(d.name)}</b><br><span class="meta">${t('nCards', d.cards.length)} · ${LANG_NAMES[d.lang] || d.lang} · ${d.level}</span></span>
      <span class="row"><button class="secondary small" data-action="tour" data-id="${d.id}">${t('tourBtn')}</button>
      <button class="secondary small" data-action="edit" data-id="${d.id}">${t('edit')}</button>
      <button class="secondary small" data-action="images" data-id="${d.id}">${t('imgBtn')}</button>
      <button class="secondary small" data-action="export" data-id="${d.id}">${t('exportBtn')}</button>
      ${S.confirmDel === d.id ? `<button class="link danger" data-action="del-yes" data-id="${d.id}">${t('delSure')}</button>` : `<button class="link" data-action="del" data-id="${d.id}">${t('del')}</button>`}</span></li>`).join('')}</ul></section>
    <h2 class="sec">${t('tNew')}</h2>
    <section class="card import"><h2>${t('b1')}</h2>
      <div class="fields">
        <label>${t('bLang')} <select data-b="lang">${langOpts(B.lang)}</select></label>
        <label>${t('bLevel')} <select data-b="level">${levels(B.level)}</select></label>
        <label>${t('bTopic')} <input data-b="topic" value="${esc(B.topic)}" placeholder="${t('bTopicPh')}" autocomplete="off"></label>
        <label>${t('bCount')} <input data-b="count" type="number" min="3" max="500" inputmode="numeric" value="${B.count}"><span class="sethint">${t('bCountHint')}</span></label>
        <details class="more"${B.words ? ' open' : ''}><summary>${t('bWordsSum')}</summary>
          <label>${t('bWords')} <textarea data-b="words" rows="4">${esc(B.words)}</textarea><span class="sethint">${t('bWordsHint')}</span></label></details>
      </div></section>
    <section class="card"><h2>${t('b2')}</h2><p>${t('b2Intro')}</p>
      ${promptBox('file', 'pFile')}
      <details class="more"><summary>${t('noFile')}</summary><p>${t('noFileHint')}</p>
        ${promptBox('cards', 'pCards')}
        <label class="inline">${t('bGrid')} <select data-b="grid">${GRIDS.map(g => opt(g, B.grid, t('gridOpt', gridOf(g).n, gridOf(g).cols, gridOf(g).rows))).join('')}</select></label>
        ${promptBox('sheet', 'pSheet')}${promptBox('next', 'pNext')}</details></section>
    <section class="card import"><h2>${t('b3')}</h2>
      <form data-submit="import">
        <label>${t('filesLabel')} <input name="files" type="file" multiple accept=".zip,.apkg,.json,.csv,.tsv,.txt,image/*,audio/*"><span class="sethint">${t('filesHint')}</span></label>
        <details class="more"><summary>${t('pasteSum')}</summary>
          <label>${t('pasteLabel')} <textarea name="text" rows="4" spellcheck="false"></textarea></label></details>
        <details class="more"><summary>${t('csvOpts')}</summary>
          <label>${t('deckName')} <input name="name" autocomplete="off"></label>
          <label>${t('deckLang')} <select name="lang">${langOpts('fr')}</select></label>
          <label>${t('level')} <select name="level">${levels('')}</select></label></details>
        <button class="primary">${t('importBtn')}</button>
      </form></section>
    <details class="card more"><summary>${t('manual')}</summary>
      <ol class="steps">${t('tSteps').map(s => `<li>${s}</li>`).join('')}</ol>
      <h2>${t('tModels')}</h2><ul class="models">
      ${model('fr', 'tModelFr', 'tModelFrSub')}${model('en', 'tModelEn', 'tModelEnSub')}${model('es', 'tModelEs', 'tModelEsSub')}</ul>
      <h2>${t('tCols')}</h2><div class="scroll"><table>
      <thead><tr><th>${t('colName')}</th><th>${t('colNeed')}</th><th>${t('colWhat')}</th></tr></thead><tbody>
      ${row('Word', 'yes', 'cWord')}${row('Definition', 'oneOf', 'cDef')}${row('Traduction FR<br>Traduction EN', 'oneOf', 'cTr')}
      ${row('Example 1<br>Example 2<br>Example 3', 'advised', 'cEx')}${row('Situation', 'advised', 'cSit')}${row('Distracteurs', 'advised', 'cTraps')}
      ${row('Category', 'advised', 'cCat')}${row('Famille', 'optional', 'cFam')}
      ${row('Image', 'optional', 'cImg')}${row('Audio', 'optional', 'cAudio')}${row('IPA', 'optional', 'cIpa')}
      </tbody></table></div></details>`;
}

async function addDeck(text, name, lang, json = false, level) {
  try {
    const deck = json ? deckFromJSON(text, name, level) : deckFromCSV(text, name, lang, level);
    S.decks = [...S.decks.filter(d => d.id !== deck.id), deck];
    S.progress[deck.id] ??= (await store.get('progress:' + deck.id)) || {};
    await saveDecks();
    S.notice = { text: t('imported', deck.name, deck.cards.length, deck.skipped) };
    S.view = 'home';
  } catch (e) {
    S.notice = { bad: true, text: t(ERR[e.message] || 'errEmpty') };
  }
  render();
}
const ERR = { 'anki-new': 'errAnki', sqlite: 'errAnki', 'no-word-column': 'errNoWord', 'too-few': 'errFew', 'bad-json': 'errJson', 'no-level': 'errLevel', 'no-name': 'errName', nothing: 'errNothing' };

// Import : un texte collé ou un fichier de paquet (.json, .csv), accompagné ou non d'images, de sons et de planches,
// le tout éventuellement réuni dans une archive .zip. Rien n'est envoyé nulle part : tout est lu sur l'appareil.
async function importPacket({ files = [], text = '', name = '', lang = 'fr', level = '', home = false }) {
  try {
    files = files.map(f => ({ name: f.name, blob: f }));
    for (const z of files.filter(f => /\.zip$/i.test(f.name))) files.push(...await unzip(await z.blob.arrayBuffer()));
    files = files.filter(f => !/\.zip$/i.test(f.name));
    // Paquet Anki (.apkg) : une archive qui contient une base de notes et des médias numérotés.
    let anki = null; const ankis = [];
    for (const a of files.filter(f => /\.(apkg|colpkg)$/i.test(f.name))) {
      const inside = await unzip(await a.blob.arrayBuffer()), get = n => inside.find(f => f.name === n);
      const base = get('collection.anki21') || get('collection.anki2');
      if (!base) throw new Error('anki-new');
      let names = {}; try { names = JSON.parse(await get('media').blob.text()); } catch { /* table des médias absente ou d'un autre format */ }
      for (const f of inside) if (names[f.name]) files.push({ name: names[f.name], blob: new Blob([f.blob], { type: typeOf(names[f.name]) }) });
      anki = { db: openSqlite(await base.blob.arrayBuffer()), file: a.name }; ankis.push(anki);
    }
    files = files.filter(f => !/\.(apkg|colpkg)$/i.test(f.name));
    const packet = files.find(f => /\.json$/i.test(f.name)) || files.find(f => /\.(csv|tsv|txt)$/i.test(f.name));
    text = anki ? '' : text.trim() || (packet ? await packet.blob.text() : '');
    if (!text && !anki) throw new Error('nothing');
    if (!anki && !looksJSON(text) && !name) throw new Error('no-name');
    // Plusieurs paquets Anki choisis ensemble : ils sont réunis en un seul paquet.
    const fromAnki = k => { const d = deckFromAnki(k.db, ankis.length > 1 ? '' : name, lang, level || levelIn(name) || levelIn(k.file)); if (d.levelGuessed && levelIn(d.name)) d.levelGuessed = false; return d; };
    const deck = ankis.length > 1 ? mergeDecks(ankis.map(fromAnki), name) : anki ? fromAnki(anki)
      : looksJSON(text) ? deckFromJSON(text, name, level) : deckFromCSV(text, name, lang, level || levelIn(name));
    if (deck.levelGuessed && !home) throw new Error('no-level');      // l'enseignant choisit le niveau ; un paquet reçu par un étudiant s'ouvre quand même
    const media = files.filter(f => f !== packet), kind = f => (f.blob.type || typeOf(f.name)).split('/')[0];
    const base = n => n.split('/').pop().toLowerCase(), stem = n => base(n).replace(/\.\w+$/, '');
    const find = (k, ref) => media.find(f => kind(f) === k && base(f.name) === base(ref)) || media.find(f => kind(f) === k && stem(f.name) === stem(ref));
    const used = new Set(), local = u => u && !/^(https?:|data:)/i.test(u);
    for (const c of deck.cards) {          // images et sons désignés par leur nom de fichier
      if (local(c.image)) { const f = find('image', c.image); if (f) { c.image = await imageToDataURL(f.blob); used.add(f); } else delete c.image; }
      if (local(c.audio)) { const f = find('audio', c.audio); if (f && f.blob.size <= 600 * 1024) { c.audio = await blobToDataURL(f.blob); used.add(f); } else delete c.audio; }
    }
    let images = media.filter(f => kind(f) === 'image' && !used.has(f));
    S.sheets = []; S.loose = []; S.perm = 0;
    if (deck.cards.some(c => c.sheet)) { S.sheets = sortSheets(images); await cutSheets(deck, S.sheets); }
    else {                                  // images sans référence : rangées d'après leur nom, sinon à ranger à la main
      const squash = x => noAcc(norm(x)).replace(/[^a-z0-9]/g, '');
      for (const f of images) {
        const c = deck.cards.find(c => !c.image && [c.key, noArt(c.key)].map(squash).includes(squash(stem(f.name))));
        if (c) { c.image = await imageToDataURL(f.blob); used.add(f); }
      }
      for (const f of images.filter(f => !used.has(f))) S.loose.push(await imageToDataURL(f.blob));
    }
    S.decks = [...S.decks.filter(d => d.id !== deck.id), deck];
    S.progress[deck.id] ??= (await store.get('progress:' + deck.id)) || {};
    await saveDecks();
    S.notice = { text: t('imported', deck.name, deck.cards.length, deck.skipped) };
    const toCheck = S.sheets.length || S.loose.length || deck.cards.some(c => c.image || c.sheet);   // toute image se vérifie d'un coup d'œil
    S.imgId = deck.id; S.view = toCheck && !home ? 'images' : 'home';
  } catch (e) {
    S.notice = { bad: true, text: t(ERR[e.message] || 'errEmpty') };
  }
  window.scrollTo?.(0, 0); render();
}

// ---------- Images du paquet : planches découpées et images à ranger ----------

const naturally = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
// Une planche nommée « planche2.png » est la planche 2 ; sinon l'ordre des noms de fichiers décide.
function sortSheets(files) {
  const num = f => +(f.name.match(/(?:planche|sheet|l[aá]mina|page)[\s_-]*(\d+)/i) || [])[1] || 0;
  return [...files].sort((a, b) => (num(a) || 999) - (num(b) || 999) || naturally(a, b));
}
function nthPerm(arr, n) {
  const pool = [...arr], out = [];
  for (let i = pool.length; i > 0; i--) { let f = 1; for (let k = 2; k < i; k++) f *= k; out.push(pool.splice(Math.floor(n / f) % i, 1)[0]); n %= f; }
  return out;
}
// Découpe chaque planche selon la grille du paquet et pose chaque dessin sur la fiche qui le réclame (« P1-3 » : planche 1, case 3).
async function cutSheets(deck, sheets) {
  const bmps = await Promise.all(sheets.map(f => createImageBitmap(f.blob))), G = gridOf(deck.grid); let n = 0;
  for (const c of deck.cards) {
    const m = (c.sheet || '').match(/^P(\d+)-(\d+)$/i), bmp = m && bmps[m[1] - 1], cell = m ? +m[2] : 0;
    if (!bmp || cell < 1 || cell > G.n) continue;
    const w = bmp.width / G.cols, h = bmp.height / G.rows, edge = 0.04, k = Math.min(1, 480 / Math.max(w, h)), cv = document.createElement('canvas');
    cv.width = Math.round(w * (1 - 2 * edge) * k); cv.height = Math.round(h * (1 - 2 * edge) * k);
    cv.getContext('2d').drawImage(bmp, ((cell - 1) % G.cols + edge) * w, (Math.floor((cell - 1) / G.cols) + edge) * h, w * (1 - 2 * edge), h * (1 - 2 * edge), 0, 0, cv.width, cv.height);
    c.image = canvasToDataURL(cv); n++;
  }
  return n;
}

function imagesView() {
  const d = S.decks.find(x => x.id === S.imgId), waiting = d.cards.filter(c => c.sheet && !c.image).length, wantsSheets = d.cards.some(c => c.sheet);
  return `<button class="link" data-action="teacher">← ${t('eBack')}</button>
    <h1>${t('imgTitle')}</h1><p class="lead" lang="${d.lang}">${esc(d.name)}</p>
    ${banners()}
    ${wantsSheets ? `<section class="card import"><h2>${t('imgSheets')}</h2><p class="sethint">${t('imgSheetsHint')}</p>
      ${waiting ? `<p class="banner warn">${t('imgNone', waiting)}</p>` : ''}
      <input type="file" multiple accept="image/*" data-file="sheets" aria-label="${t('imgSheets')}">
      <div class="row"><span>${t('imgGrid')}</span>${['cols', 'rows'].map(k => `<label class="inline">${t(k === 'cols' ? 'cols' : 'rowsL')} <select data-grid="${k}">${Array.from({ length: 12 }, (_, i) => opt(i + 1, gridOf(d.grid)[k], i + 1)).join('')}</select></label>`).join('')}</div>
      ${S.sheets.length > 1 ? `<button type="button" class="secondary" data-action="swap-sheets">${t('imgSwap')}</button>` : ''}</section>` : ''}
    ${S.loose.length ? `<section class="card loose"><img class="illus" src="${esc(S.loose[0])}" alt=""><p><b>${t('imgLoose')}</b> <span class="meta">(${S.loose.length})</span></p>
      <button type="button" class="link" data-action="skip-image">${t('imgSkip')}</button></section>` : ''}
    <ul class="imggrid">${d.cards.map(c => `<li><button type="button" class="imgtile" data-action="assign-image" data-id="${c.id}" style="--th:${hue(c.theme)}" ${S.loose.length ? '' : 'disabled'}>
      ${c.image ? `<img src="${esc(c.image)}" alt="">` : '<span class="swatch"></span>'}<span lang="${d.lang}">${esc(c.bare)}</span></button></li>`).join('')}</ul>
    <button class="primary" data-action="teacher">${t('imgDone')}</button>`;
}

// ---------- Éditeur de paquet ----------

const editing = () => S.decks.find(d => d.id === S.editId);
const short = (x, n = 70) => (x.length > n ? x.slice(0, n - 1) + '…' : x);

function editView() {
  const d = editing();
  return `<button class="link" data-action="teacher">← ${t('eBack')}</button>
    <h1>${t('eTitle')}</h1>
    ${banners()}
    <section class="card import"><form data-submit="rename">
      <label>${t('deckName')} <input name="name" value="${esc(d.name)}" autocomplete="off"></label>
      <label>${t('deckLang')} <select name="lang">${langOpts(d.lang)}</select></label>
      <label>${t('level')} <select name="level">${LEVELS.map(l => opt(l, d.level, l)).join('')}</select></label>
      <button class="primary">${t('save')}</button></form></section>
    <section class="card">
      <div class="row tools"><button class="secondary" data-action="images" data-id="${d.id}">${t('imgBtn')}</button><input type="search" data-input="search" placeholder="${t('eSearch')}" aria-label="${t('eSearch')}">
      <button class="secondary" data-action="card" data-id="new">+ ${t('eAdd')}</button></div>
      <ul class="cardlist">${d.cards.map(c => `<li data-text="${esc((c.word + ' ' + meaning(c)).toLowerCase())}">
        <button class="cardrow" data-action="card" data-id="${c.id}" style="--th:${hue(c.theme)}">
        ${c.image ? `<img src="${esc(c.image)}" alt="">` : '<span class="swatch"></span>'}
        <span><b lang="${d.lang}">${esc(c.word)}</b><br><span class="meta">${esc(short(meaning(c)))}</span></span>
        <span class="marks">${c.audio ? '🔊' : ''}</span></button></li>`).join('')}</ul></section>`;
}

function cardView() {
  const d = editing(), c = d.byId[S.cardId] || { translations: {}, examples: [] }, isNew = !d.byId[S.cardId];
  const langs = [...new Set([...Object.keys(LANG_NAMES).filter(l => l !== d.lang), ...Object.keys(c.translations)])];
  const field = (name, label, value, attrs = '') => `<label>${label} <input name="${name}" value="${esc(value || '')}" autocomplete="off" ${attrs}></label>`;
  return `<button class="link" data-action="edit" data-id="${d.id}">← ${esc(d.name)}</button>
    <h1>${t(isNew ? 'cTitleNew' : 'cTitle')}</h1>
    ${banners()}
    <form class="card import" data-submit="card">
      ${field('word', t('fWord'), c.word, `lang="${d.lang}" required`)}
      <label>${t('fDef')} <textarea name="definition" rows="2" lang="${d.lang}">${esc(c.definition || '')}</textarea></label>
      ${langs.map(l => field('tr_' + l, t('fTr', LANG_NAMES[l] || (l === '*' ? '' : l)), c.translations[l])).join('')}
      <label>${t('fEx')} <textarea name="examples" rows="3" lang="${d.lang}">${esc(c.examples.map((e, i) => remark(e, c.marks?.[i])).join('\n'))}</textarea></label>
      ${field('situation', t('fSit'), c.situation)}${field('distractors', t('fTraps'), (c.distractors || []).join(' | '))}
      <div class="two">${field('theme', t('fTheme'), c.theme)}${field('register', t('fReg'), c.register)}</div>
      <div class="two">${field('family', t('fFam'), c.family)}${field('ipa', t('fIpa'), c.ipa)}</div>
      <fieldset><legend>${t('fImg')}</legend>
        <img class="illus" data-preview="image" src="${esc(S.draft.image || '')}" alt="" ${S.draft.image ? '' : 'hidden'}>
        <input type="file" data-file="image" accept="image/*" aria-label="${t('fImg')}">
        ${field('imageUrl', t('fImgUrl'), /^data:/.test(S.draft.image || '') ? '' : S.draft.image, 'placeholder="https://…"')}
        <button type="button" class="link" data-action="clear" data-key="image">${t('remove')}</button></fieldset>
      <fieldset><legend>${t('fAudio')}</legend>
        <p class="meta" data-preview="audio">${S.draft.audio ? '🔊 ✓' : '—'}</p>
        <input type="file" data-file="audio" accept="audio/*" aria-label="${t('fAudio')}">
        ${field('audioUrl', t('fAudioUrl'), /^data:/.test(S.draft.audio || '') ? '' : S.draft.audio, 'placeholder="https://…"')}
        <span class="row"><button type="button" class="secondary small" data-action="test-audio">${t('listen')}</button>
        <button type="button" class="link" data-action="clear" data-key="audio">${t('remove')}</button></span></fieldset>
      <div class="row"><button class="primary">${t('save')}</button><button type="button" class="link" data-action="edit" data-id="${d.id}">${t('cancel')}</button>
      ${isNew ? '' : `<button type="button" class="link danger" data-action="del-card">${t('delCard')}</button>`}</div>
    </form>`;
}

async function saveCard(form) {
  const d = editing(), v = n => form[n]?.value.trim() || '';
  const translations = {};
  for (const el of form.querySelectorAll('[name^="tr_"]')) if (el.value.trim()) translations[el.name.slice(3)] = el.value.trim();
  if (!v('word') || !(v('definition') || Object.keys(translations).length)) { S.notice = { bad: true, text: t('errCard') }; return toast(t('errCard')); }
  const data = { word: v('word'), definition: v('definition') || undefined, translations, examples: v('examples').split(/\n+/).map(x => x.trim()).filter(Boolean),
    situation: v('situation') || undefined, distractors: v('distractors').split('|').map(x => x.trim()).filter(Boolean),
    theme: v('theme') || undefined, register: v('register') || undefined, family: v('family') || undefined, ipa: v('ipa') || undefined,
    image: safeUrl(v('imageUrl')) || S.draft.image || undefined, audio: safeUrl(v('audioUrl')) || S.draft.audio || undefined };
  const old = d.byId[S.cardId];
  if (old) { delete old.marks; Object.assign(old, data); } else d.cards.push({ id: 'c' + hash(data.word + Date.now()), extra: {}, ...data });
  prepare(d); await saveDecks();
  S.notice = { text: t('saved') }; S.view = 'edit'; window.scrollTo?.(0, 0); render();
}

// Réduit une image à 640 pixels de côté au plus, pour que les paquets restent légers.
const blobToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
const canvasToDataURL = cv => { const webp = cv.toDataURL('image/webp', 0.85); return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/jpeg', 0.85); };
async function imageToDataURL(file) {
  if ((file.type || '') === 'image/svg+xml') return blobToDataURL(file);
  const bmp = await createImageBitmap(file), k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return canvasToDataURL(cv);
}

async function attach(input) {
  const kind = input.dataset.file, file = input.files[0]; if (!file) return;
  if (kind === 'sheets') return addSheets([...input.files]);
  if (kind === 'packet') return importPacket({ files: [...input.files], home: true });
  try {
    if (kind === 'image') S.draft.image = await imageToDataURL(file);
    else {
      if (file.size > 600 * 1024) return toast(t('tooBig', 600));
      S.draft.audio = await blobToDataURL(file);
    }
    showDraft();
  } catch { toast(t('errEmpty')); }
}
async function addSheets(files) {
  const d = S.decks.find(x => x.id === S.imgId);
  try {
    S.sheets = sortSheets(files.map(f => ({ name: f.name, blob: f }))); S.perm = 0;
    const n = await cutSheets(d, S.sheets);
    await saveDecks(); S.notice = { text: t('imgCut', n) };
  } catch { S.notice = { bad: true, text: t('errEmpty') }; }
  render();
}
// Met à jour l'aperçu sans redessiner le formulaire, pour ne pas effacer ce qui vient d'être saisi.
function showDraft() {
  const img = app.querySelector('[data-preview=image]'), au = app.querySelector('[data-preview=audio]');
  if (img) { img.hidden = !S.draft.image; img.src = S.draft.image || ''; }
  if (au) au.textContent = S.draft.audio ? '🔊 ✓' : '—';
}

function download(name, text, bom = true) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([(bom ? '\uFEFF' : '') + text], { type: bom ? 'text/csv;charset=utf-8' : 'application/json' }));
    a.download = name; document.body.append(a); a.click(); a.remove();
  } catch { toast(t('downloadFail')); }
}
// ---------- Session ----------

function startSession(id, force = false) {
  const deck = S.decks.find(d => d.id === id);
  deck.help = helpFor(deck);
  S.stageBefore = summary(deck, S.progress[id]).stage;
  S.session = new Session(deck, S.progress[id], { minutes: S.minutes, maxNew: S.maxNew, force });
  S.view = 'session'; S.notice = null;
  advance();
  if (S.session?.held) toast(t('heldNew'));
}

function startChallenge(id, stage) {
  const deck = S.decks.find(d => d.id === id), P = S.progress[id];
  deck.help = helpFor(deck);
  const [a, b] = stageOf(deck, P).bounds[stage - 1];
  S.session = new Challenge(deck, P, deck.cards.slice(a, b));
  S.chStage = stage; S.view = 'session'; S.notice = null;
  advance();
}

// Aperçu : un exemple de chaque exercice, tout de suite. Sans lui, les exercices des boîtes 2 à 5 ne se voient qu'après plusieurs jours.
function startTour(id) {
  const deck = S.decks.find(d => d.id === id);
  deck.help = helpFor(deck);
  S.session = new Tour(deck, S.progress[id]);
  S.view = 'session'; S.notice = null;
  advance();
}

function advance() {
  S.feedback = null; S.local = null; S.gate = false;
  S.step = S.session.next();
  if (!S.step) {
    const id = S.session.deck.id;
    if (S.session.challenge && !S.session.tour) { S.chWon = S.session.stats.answered - S.session.stats.ok <= 1; if (S.chWon) (S.progress[id]._stages ??= {})[S.chStage] = Date.now(); }
    S.view = 'done'; saveProgress(id); sfx(S.session.challenge ? 'trumpet' : 'birds');
  } else if (S.step.intro) { saveProgress(S.session.deck.id); autoSpeak(); }
  render();
}

function sentence(cl, lang, reveal) {
  return `<p class="sentence" lang="${lang}">${clozeParts(cl).map(p => (p.blank
    ? (reveal ? `<mark>${esc(p.text)}</mark>` : `<span class="gap" aria-label="…">${'&nbsp;'.repeat(Math.max(6, p.text.length + 2))}</span>`)
    : esc(p.text))).join('')}</p>`;
}

const listenBtn = card => `<button class="icon" data-action="speak" data-id="${card.id}" aria-label="${t('listen')}" title="${t('listen')}">🔊</button>`;
const chips = c => `<p class="chips">${c.theme ? `<span class="chip theme">${esc(c.theme)}</span>` : ''}${c.register ? `<span class="chip">${esc(c.register)}</span>` : ''}</p>`;
const illus = c => (c.image ? `<img class="illus" src="${esc(c.image)}" alt="">` : '');

// Sens de la fiche : définition en langue apprise, puis traduction dans la langue d'aide si elle existe.
function sense(card, lang, cls = 'def') {
  const h = S.session.deck.help, g = card.definition ? gloss(card, h) : '';
  return `<p class="${cls}" lang="${card.definition ? lang : (h && h !== '*' ? h : '')}">${esc(meaning(card, h))}</p>${g ? `<p class="gloss"${h !== '*' ? ` lang="${h}"` : ''}>${esc(g)}</p>` : ''}`;
}

function introView(card, lang) {
  return `<div class="card study intro" style="--th:${hue(card.theme)}">
    <p class="kicker">${t('newCard')}</p>
    ${illus(card)}
    <h2 class="word" lang="${lang}">${esc(card.word)} ${listenBtn(card)}</h2>
    ${card.ipa ? `<p class="ipa">${esc(card.ipa)}</p>` : ''}
    ${chips(card)}
    ${sense(card, lang)}
    ${card.examples[0] ? `<p class="example" lang="${lang}">${esc(card.examples[0])}</p>` : ''}
    <button class="primary" data-action="next" autofocus>${t('gotIt')}</button>
  </div>`;
}

function activityView(step, lang) {
  const { card, activity: a } = step, fb = S.feedback, L = S.local || {};
  if (a.type === 'match') return matchView(step, lang);
  if (a.type === 'bank') return bankView(step, lang);
  const skip = `<button type="button" class="link" data-action="skip">${t('dontKnow')}</button>`;
  // Après la réponse, l'exercice d'orthographe ne laisse à l'écran que la bonne forme : une faute qu'on relit s'imprime.
  const options = () => `<div class="options">${a.options.map((o, i) => {
    const cls = fb ? (o === a.answer ? 'right' : o === fb.chosen ? 'wrong' : '') : '';
    return `<button class="option ${cls}" data-action="choose" data-i="${i}" ${fb ? 'disabled' : ''} lang="${lang}"><kbd>${i + 1}</kbd> ${esc(o)}${cls === 'right' ? ' <span class="mark">✓</span>' : cls === 'wrong' ? ' <span class="mark">✗</span>' : ''}</button>`;
  }).join('')}</div>${fb ? '' : skip}`;
  // Rappel de tête : l'étudiant cherche d'abord sa réponse, les choix n'arrivent qu'ensuite pour la vérifier.
  const gate = () => `<div class="gate"><p>${t('gateWord')}</p>
    <div class="row"><button class="primary" data-action="reveal" autofocus>${t('reveal')}</button>${skip}</div></div>`;
  const choice = () => (a.gated && !S.gate && !fb ? gate() : options());
  const hint = `<div class="hint"><span class="tag">${t('hint')}</span>${sense(card, lang, 'hintdef')}</div>`;
  let body;
  if (a.type === 'qcm') body = `<p class="question">${t('qMeaning')}</p><h2 class="word" lang="${lang}">${esc(card.bare)} ${listenBtn(card)}</h2>${options()}`;
  else if (a.type === 'qcm-rev') body = `<p class="question">${t('qWord')}</p>${illus(card)}${sense(card, lang, 'def big')}${choice()}`;
  else if (a.type === 'cloze-choice') body = `<p class="question">${t('qCloze')}</p>${sentence(a.cloze, lang, !!fb)}${hint}${choice()}`;
  else if (a.type === 'situation') body = `<p class="question">${t('qSituation')}</p><p class="situation">${esc(a.situation)}</p>${options()}`;
  else if (a.type === 'order') {
    const picked = L.picked || [], lock = L.lock || 0, by = k => a.chunks.find(c => c.k === k);
    const chip = (c, fixed) => `<button type="button" class="chunk${fixed ? ' locked' : ''}" data-action="chunk" data-k="${c.k}" lang="${lang}" ${fb || fixed ? 'disabled' : ''}>${esc(c.text)}</button>`;
    body = `<p class="question">${t('qOrder')}</p>
      <div class="line" data-zone="line" role="group" aria-label="${t('yourSentence')}">${fb ? `<span lang="${lang}">${esc(a.answer)}</span>` : picked.map((k, i) => chip(by(k), i < lock)).join('') || `<span class="placeholder">${t('tapWords')}</span>`}</div>
      ${fb ? '' : `<div class="bank" data-zone="bank">${a.chunks.filter(c => !picked.includes(c.k)).map(c => chip(c)).join('')}</div>
      ${L.again ? `<p class="again" role="status">${t('orderAgain')}</p>` : ''}
      <div class="row"><button class="primary" data-action="check-order" ${picked.length === a.chunks.length ? '' : 'disabled'}>${t('validate')}</button>${skip}</div>`}`;
  } else {
    // Réponse courte écrite : un mot ou une expression. L'aide et la tolérance d'orthographe dépendent du niveau du paquet.
    const typed = `<form class="typed" data-submit="typed">
      <label>${t('answerLabel')} <input name="answer" lang="${lang}" ${a.type === 'number' ? 'inputmode="numeric"' : ''} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${fb ? `disabled value="${esc(fb.typed ?? '')}"` : `autofocus value="${esc(L.value || '')}"`}></label>
      ${a.hint && !fb ? `<p class="helpline"><span class="tag">${t('hintLabel')}</span> <span class="letters" lang="${lang}">${esc(a.hint)}</span></p>` : ''}
      ${L.again && !fb ? `<p class="again" role="status">${t(L.accent ? 'tryAccent' : 'tryAgain')}</p>` : ''}
      ${fb ? '' : `<div class="row"><button class="primary">${t('validate')}</button>${skip}</div>`}</form>`;
    if (a.type === 'cloze-type') body = `<p class="question">${t('qClozeType')}</p>${sentence(a.cloze, lang, !!fb)}${hint}${typed}`;
    else if (a.type === 'situation-type') body = `<p class="question">${t('qSitType')}</p><p class="situation">${esc(a.situation)}</p>${sentence(a.cloze, lang, !!fb)}${typed}`;
    else if (a.type === 'type') body = `<p class="question">${t('qType')}</p>${illus(card)}${sense(card, lang, 'def big')}${typed}`;
    else body = `<p class="question">${t('qNumber')}</p><h2 class="word" lang="${lang}">${esc(card.bare)} ${listenBtn(card)}</h2>${typed}`;
  }
  return `<div class="card study" style="--th:${hue(card.theme)}">${body}</div>${fb ? feedbackView(step, lang) : ''}`;
}

// Défi d'étape : associer chaque mot à son sens. Sans chronomètre : la vitesse pousserait à deviner.
function matchView(step, lang) {
  const a = step.activity, L = S.local || {}, done = L.done || [];
  const tile = (p, side) => {
    const ok = done.includes(p.id), sel = L.sel?.side === side && L.sel.id === p.id, bad = (L.bad || []).includes(side + p.id);
    return `<button type="button" class="tile${ok ? ' ok' : ''}${sel ? ' sel' : ''}${bad ? ' bad' : ''}" data-action="match" data-side="${side}" data-id="${p.id}" aria-pressed="${sel}" ${ok ? 'disabled' : ''} ${side === 'l' ? `lang="${lang}"` : ''}>${esc(side === 'l' ? p.word : p.meaning)}${ok ? ' <span class="mark">✓</span>' : bad ? ' <span class="mark">✗</span>' : ''}</button>`;
  };
  return `<div class="card study" style="--th:${hue(step.card.theme)}"><p class="question">${t('qMatch')}</p>
    <div class="matchgrid"><div>${a.left.map(p => tile(p, 'l')).join('')}</div><div>${a.right.map(p => tile(p, 'r')).join('')}</div></div></div>${S.feedback ? feedbackView(step, lang) : ''}`;
}

// Défi d'étape : compléter plusieurs phrases avec une banque de mots commune (deux mots sont en trop).
function bankView(step, lang) {
  const a = step.activity, fb = S.feedback, L = S.local || {}, fill = L.fill || a.items.map(() => null), cur = L.cur ?? 0;
  const rows = a.items.map((it, i) => `<li>${clozeParts(it.cloze).map(p => (!p.blank ? esc(p.text)
    : fb ? `<mark>${esc(p.text)}</mark> <span class="mark">${(L.missed || []).includes(it.id) ? '✗' : '✓'}</span>`
      : `<button type="button" class="slot${i === cur ? ' cur' : ''}" data-action="bank-gap" data-i="${i}" aria-label="${t('gapN', i + 1)}">${fill[i] === null ? '&nbsp;'.repeat(9) : esc(a.bank[fill[i]])}</button>`)).join('')}</li>`).join('');
  return `<div class="card study" style="--th:${hue(step.card.theme)}"><p class="question">${t('qBank')}</p>
    <ol class="banklist" lang="${lang}">${rows}</ol>
    ${fb ? '' : `<div class="bank">${a.bank.map((w, k) => `<button type="button" class="chunk" data-action="bank-word" data-k="${k}" lang="${lang}" ${fill.includes(k) ? 'disabled' : ''}>${esc(w)}</button>`).join('')}</div>
    <div class="row"><button class="primary" data-action="check-bank" ${fill.includes(null) ? 'disabled' : ''}>${t('validate')}</button></div>`}</div>${fb ? feedbackView(step, lang) : ''}`;
}

function feedbackView(step, lang) {
  const { card, activity: a } = step, fb = S.feedback, s = S.session, help = s.deck.help;
  const title = fb.ok ? t(['ok1', 'ok2', 'ok3'][fb.n % 3]) : a.multi ? t('almost') : t('no');
  if (a.multi) {
    const missed = (S.local?.missed || S.local?.errors || []).map(id => s.deck.byId[id]);
    return `<div class="card feedback ${fb.ok ? 'good' : 'soft'}" role="status" aria-live="polite"><h3>${title}</h3>
      ${missed.length ? `<p>${t('toReview')}</p><ul class="missed">${missed.map(c => `<li><b lang="${lang}">${esc(c.bare)}</b> : ${esc(meaning(c, help))}</li>`).join('')}</ul>` : ''}
      <button class="primary" data-action="next" autofocus>${t('next')}</button></div>`;
  }
  // Un retour qui explique : ce que voulait dire la réponse choisie, ou les lettres sur lesquelles on s'est trompé.
  const other = !fb.ok && fb.chosen && a.from?.[fb.chosen] ? s.deck.byId[a.from[fb.chosen]] : null;
  const explain = !other ? '' : a.type === 'qcm' ? t('exMeaning', other.bare) : a.type === 'situation' ? t('exSituation', other.bare) : t('exWord', fb.chosen, meaning(other, help));
  const note = fb.note === 'accent' ? t('noteAccent', fb.shown) : fb.note === 'article' ? t('noteArticle', fb.shown) : fb.note === 'form' ? t('noteForm', fb.shown) : fb.note === 'near' ? t('noteNear', fb.shown) : '';
  // Réponse écrite à une lettre près : on montre l'endroit de l'écart dans la bonne orthographe.
  let sp = null;
  if (a.cloze && fb.typed && (fb.note === 'near' || fb.near)) { const d = diffParts(a.answer.toLowerCase(), fb.typed.trim().toLowerCase()), i = d[0].length, j = i + d[1].length; sp = [a.answer.slice(0, i), a.answer.slice(i, j), a.answer.slice(j)]; }
  const ex = a.type === 'order' ? '' : card.examples.find(e => !a.cloze || e.replace(/[’`´]/g, "'") !== a.cloze.text) || card.examples[0];
  const move = fb.retry ? '' : fb.boxAfter > fb.boxBefore ? t('boxUp', fb.boxAfter) : fb.boxAfter < fb.boxBefore ? t('boxDown', fb.boxAfter) : '';
  const when = s.challenge || fb.ask ? '' : fb.ok && !fb.retry ? t('nextIn', Math.max(1, fb.days)) : fb.ok ? '' : t('nextSoon');
  const wins = [fb.joined ? t('joined') : '', fb.tamed ? t('tamed', card.word, s.tamed.length, s.today.length) : '',
    fb.ok && [3, 5, 10].includes(s.stats.streak) ? t('streak', s.stats.streak) : ''].filter(Boolean);
  return `<div class="card feedback ${fb.ok ? 'good' : 'soft'}" role="status" aria-live="polite">
    <h3>${title}</h3>
    ${wins.length ? `<p class="win">${mascot(44, 'joy', Math.max(1, fb.boxAfter))}<span>${wins.map(esc).join('<br>')}</span></p>` : ''}
    ${fb.ok ? '' : `<p class="oopsrow">${mascot(46, 'oops', Math.max(1, fb.boxAfter))}<span>${fb.pun ? esc(t('puns')[fb.n % t('puns').length]) : ''}</span></p>`}
    ${explain ? `<p class="explain">${esc(explain)}</p>` : ''}
    ${note ? `<p class="explain">${esc(note)}</p>` : ''}
    ${sp ? `<p class="spelling" lang="${lang}">${esc(sp[0])}<mark>${esc(sp[1])}</mark>${esc(sp[2])}</p>` : ''}
    <p class="recap"><b lang="${lang}">${esc(card.word)}</b> ${listenBtn(card)}</p>
    ${sense(card, lang, 'recapdef')}
    ${ex ? `<p class="example" lang="${lang}"><span class="meta">${t('example')} :</span> ${esc(ex)}</p>` : ''}
    <p class="meta">${[move, when].filter(Boolean).join(' ')}</p>
    ${fb.ask ? `<p class="askline">${t('askFelt')}</p><div class="row felt"><button class="primary" data-action="felt" data-v="easy" autofocus>${t('easy')}</button>
      <button class="secondary" data-action="felt" data-v="hard">${t('hesitated')}</button>${a.options ? `<button class="secondary" data-action="felt" data-v="lucky">${t('lucky')}</button>` : ''}</div>`
      : `<button class="primary" data-action="next" autofocus>${t('next')}</button>`}
  </div>`;
}

// Une bonne réponse n'est enregistrée qu'après que l'étudiant a dit comment elle est venue : « Facile », « J'ai hésité »
// ou, pour un choix, « Coup de chance ». Ces boutons remplacent « Continuer » : ils ne coûtent aucun appui de plus.
// Dans un défi ou un aperçu, rien n'est enregistré : la question n'est pas posée.
function ask(result, extra = {}) {
  if (S.session.challenge) { cheer(commit(result, extra)); return render(); }
  const box = boxOf(S.session.progress[S.step.card.id]);
  S.feedback = { ...result, ...extra, ask: true, retry: true, boxBefore: box, boxAfter: box, days: 0, n: S.session.served };
  sfx('pop'); autoSpeak(); render();
}

function commit(result, extra = {}) {
  const step = S.step, s = S.session, before = boxOf(s.progress[step.card.id]);
  const st = s.answer(step, result.ok, undefined, { assisted: extra.assisted, hesitated: extra.hesitated, chosen: result.ok || extra.lucky ? null : extra.chosen, missed: extra.missed });
  const after = boxOf(st), retry = !!s.challenge || (!!step.item.retry && after === before);
  S.feedback = { ...result, ...extra, retry, boxBefore: before, boxAfter: after, days: dueInDays(st), n: s.served,
    tamed: s.lastTamed, joined: before < HERD_BOX && after >= HERD_BOX, pun: !result.ok && !step.activity.multi && (S.errors = (S.errors || 0) + 1) % 3 === 1 };
  saveProgress(s.deck.id); autoSpeak();
  return S.feedback;
}
const cheer = fb => sfx(!fb.ok ? 'steps' : fb.tamed || fb.joined ? 'trumpet' : 'pop');

// Réponse courte écrite. Un écart d'une lettre donne droit à un second essai (ou est accepté et corrigé, aux niveaux A1 et A2).
function submitTyped(value) {
  const a = S.step.activity, L = S.local || {}, r = judge(value, a, S.session.deck, !!L.again);
  if (r.empty) return;
  if (r.retry) { S.local = { again: true, accent: r.accent, value }; sfx('steps'); return render(); }
  const extra = { typed: value, shown: a.cloze ? a.answer : S.step.card.word };
  if (r.ok && !L.again) return ask({ ok: true, note: r.note }, extra);
  cheer(commit({ ok: !!r.ok, note: r.note, near: r.near }, { ...extra, assisted: !!L.again })); render();
}

// Phrase à reconstruire : deux essais. Au second, ce qui était bien placé reste en place.
function checkOrder() {
  const a = S.step.activity, L = S.local, text = k => a.chunks.find(c => c.k === k).text;
  if (L.picked.map(text).join(' ') === a.solution.join(' ')) { if (!L.again) return ask({ ok: true }); cheer(commit({ ok: true }, { assisted: true })); }
  else if (!L.again) {
    let lock = 0; while (lock < L.picked.length && text(L.picked[lock]) === a.solution[lock]) lock++;
    S.local = { picked: L.picked.slice(0, lock), lock, again: true }; sfx('steps');
  } else cheer(commit({ ok: false }));
  render();
}
// Dépose un morceau glissé : sur la ligne (à l'endroit visé) ou de retour dans la réserve.
function dropChunk(k, x, y) {
  const L = S.local ??= { picked: [], lock: 0 }, under = document.elementFromPoint(x, y), zone = under?.closest('[data-zone]');
  const from = L.picked.indexOf(k);
  if (!zone || (from >= 0 && from < L.lock)) return;
  if (from >= 0) L.picked.splice(from, 1);
  if (zone.dataset.zone === 'line') {
    const over = under.closest('.chunk'), at = over ? L.picked.indexOf(+over.dataset.k) : -1;
    L.picked.splice(at >= L.lock ? at : L.picked.length, 0, k);
  }
  render();
}

function sessionView() {
  const { session: s, step } = S, lang = s.deck.lang;
  const done = s.served - (S.feedback || step.intro ? 0 : 1) - (step.intro ? 1 : 0);
  const pct = Math.min(100, Math.round(100 * Math.max(0, done) / Math.max(1, s.served + s.remaining)));
  const box = S.feedback ? S.feedback.boxBefore : boxOf(s.progress[step.card.id]);
  const dots = s.today.length ? `<span class="dots" role="img" aria-label="${esc(t('wordsToday', s.tamed.length, s.today.length))}">${s.today.map(id => `<i class="${s.tamed.includes(id) ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="bar">
      <button class="icon" data-action="quit" aria-label="${t('quit')}" title="${t('quit')}">✕</button>
      ${trunkBar(pct, S.feedback ? (S.feedback.ok ? 'joy' : 'oops') : 'idle', t('sessionBar'))}
      ${dots}
    </div>
    <p class="where"><span class="chip box">${s.tour ? (s.box ? t('tourN', s.box) : t('tourAll')) : s.challenge ? t('challengeN', S.chStage) : step.intro ? t('newCard') : step.activity.multi ? t('recap') : t('box', box)}</span></p>
    ${step.intro ? introView(step.card, lang) : activityView(step, lang)}`;
}

function doneView() {
  if (S.session.tour) return `<div class="card done">${mascot(104, 'joy', 3)}<h2>${t('tourDone')}</h2><p>${t('tourNote')}</p>
    <div class="row"><button class="primary" data-action="teacher" autofocus>${t('eBack')}</button><button class="secondary" data-action="home">${t('home')}</button></div></div>`;
  if (S.session.challenge) {
    const { stats, deck } = S.session;
    return `<div class="card done">
      <div class="rain" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 11) % 96}%;animation-delay:${(i * 0.13).toFixed(2)}s;font-size:${1 + (i % 3) * 0.3}rem">🥜</i>`).join('')}</div>
      ${mascot(104, S.chWon ? 'joy' : 'idle', 5)}
      <h2>${t(S.chWon ? 'chDone' : 'chTried', S.chStage)}</h2>
      <p class="win tuskwin">${tusks(44, S.chWon)}<span>${t(S.chWon ? 'chWon' : 'chAlmost')}</span></p>
      <p>${t('chStats', stats.ok, stats.answered)}</p>
      ${stats.missed.length ? `<p><span class="label">${t('doneAgain')}</span><br>${stats.missed.map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ')}</p>` : ''}
      <p class="quip">${t('chNote')}</p>
      <div class="row">${S.chWon ? '' : `<button class="secondary" data-action="challenge" data-id="${deck.id}" data-stage="${S.chStage}">${t('chRetry')}</button>`}<button class="primary" data-action="home" autofocus>${t('home')}</button></div>
    </div>`;
  }
  const { stats, deck, tamed, today } = S.session, P = S.progress[deck.id];
  const words = ids => [...new Set(ids)].map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ');
  const s = summary(deck, P), more = s.due + pickNew(deck, P, S.maxNew).length > 0;
  const stageDone = s.stage.count > 1 && (s.stage.index > S.stageBefore.index || (s.stage.allSeen && !S.stageBefore.allSeen));
  const line = (label, ids) => (ids.length ? `<p><span class="label">${t(label)}</span><br>${words(ids)}</p>` : '');
  return `<div class="card done">
    <div class="rain" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 11) % 96}%;animation-delay:${(i * 0.13).toFixed(2)}s;font-size:${1 + (i % 3) * 0.3}rem">🥜</i>`).join('')}</div>
    ${mascot(104, 'joy', Math.min(5, 1 + Math.floor(summary(deck, P).memory * 5)))}
    <h2>${t('doneTitle')}</h2>
    ${tamed.length ? `<p class="big">${t('doneTamed', tamed.length)}</p>` : ''}
    <p>${stats.answered ? t('doneStats', stats.ok, stats.answered) : t('doneNone')}${stats.best >= 3 ? ' ' + t('doneBest', stats.best) : ''}</p>
    ${stageDone ? `<p class="win">${mascot(44, 'joy', 3)}<span>${t('stageDone', S.stageBefore.index)}</span></p>` : ''}
    <p class="label">${t('herdCount', s.animals.length)}</p>
    ${prairie(deck, s, [...today, ...stats.up])}
    <p class="quip">${t('quips')[(stats.answered + s.animals.length) % t('quips').length]}</p>
    ${line('doneHerd', stats.herd)}${line('doneUp', stats.up)}${line('doneAgain', stats.again)}
    ${S.session.held ? `<p class="heldline">${t('heldDone')} <button class="link" data-action="start-force" data-id="${deck.id}">${t('heldForce')}</button></p>` : ''}
    <div class="row">${more ? `<button class="secondary" data-action="start" data-id="${deck.id}">${t('again')}</button>` : ''}<button class="primary" data-action="home" autofocus>${t('home')}</button></div>
    <button class="link" data-action="share">${t('share')}</button>
  </div>`;
}

// ---------- Rendu et événements ----------

function render() {
  document.documentElement.lang = uiLang();
  const open = app.querySelector('details.settings')?.open;
  app.innerHTML = (S.view === 'session' ? sessionView() : S.view === 'done' ? doneView() : S.view === 'teacher' ? teacherView() : S.view === 'rules' ? rulesView() : S.view === 'herd' ? herdView() : S.view === 'images' ? imagesView() : S.view === 'edit' ? editView() : S.view === 'card' ? cardView() : home())
    + (S.toast ? `<p class="toast" role="alert">${esc(S.toast)}</p>` : '');
  if (open && app.querySelector('details.settings')) app.querySelector('details.settings').open = true;
  if (S.view === 'session' || S.view === 'done') {
    app.querySelector('[autofocus]')?.focus({ preventScroll: true });
    app.querySelector('.feedback')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
}

app.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  const { action, id, model } = b.dataset;
  if (action === 'start') startSession(id);
  else if (action === 'start-force') startSession(id, true);
  else if (action === 'next') advance();
  else if (action === 'home' || action === 'quit') { if (S.session) saveProgress(S.session.deck.id); S.view = 'home'; S.session = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'teacher') { if (!TEACHER) return; if (S.session) S.session = null; S.view = 'teacher'; S.notice = null; S.confirmDel = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'set') applySetting(b.dataset.key, b.dataset.value);
  else if (action === 'rules') { S.view = 'rules'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'herd') { S.herdId = id; S.view = 'herd'; S.confirmReset = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'share') { const st = S.session.stats; navigator.clipboard?.writeText(t('shareText', S.session.deck.name, S.session.tamed.length, st.ok, st.answered)).then(() => toast(t('copied')), () => toast(t('downloadFail'))); }
  else if (action === 'edit') { S.editId = id; S.view = 'edit'; if (b.closest('form')) S.notice = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'card') { const c = editing().byId[id]; S.cardId = id; S.draft = { image: c?.image, audio: c?.audio }; S.notice = null; S.view = 'card'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'clear') { S.draft[b.dataset.key] = undefined; const u = b.closest('form')[b.dataset.key + 'Url']; if (u) u.value = ''; showDraft(); }
  else if (action === 'test-audio') { const f = b.closest('form'), src = safeUrl(f.audioUrl.value) || S.draft.audio; speak({ word: f.word.value, audio: src }, editing().lang); }
  else if (action === 'del-card') { const d = editing(); d.cards = d.cards.filter(c => c.id !== S.cardId); prepare(d); saveDecks(); S.view = 'edit'; render(); }
  else if (action === 'export') {
    const d = S.decks.find(x => x.id === id), lv = (d.level || '').toLowerCase(), base = slug(d.name), name = lv && !base.split('-').includes(lv) ? `${base}-${lv}` : base;
    download(name + '.json', deckToJSON(d), false);
    S.notice = { text: t('exported', name + '.json', siteBase() + '?paquet=' + name) }; render();
  }
  else if (action === 'del') { S.confirmDel = id; render(); }
  else if (action === 'del-yes') { S.decks = S.decks.filter(d => d.id !== id); S.confirmDel = null; saveDecks(); render(); }
  else if (action === 'speak') speak(S.session.deck.byId[id], S.session.deck.lang);
  else if (action === 'choose' && !S.feedback) {
    const o = S.step.activity.options[+b.dataset.i];
    if (o === S.step.activity.answer) ask({ ok: true }, { chosen: o }); else { cheer(commit({ ok: false }, { chosen: o })); render(); }
  }
  else if (action === 'skip' && !S.feedback) { commit({ ok: false }, { typed: '', chosen: null }); sfx('steps'); render(); }
  else if (action === 'reveal') { S.gate = true; render(); }
  else if (action === 'felt' && S.feedback?.ask) {
    const v = b.dataset.v, was = S.feedback;
    const fb = commit({ ok: v !== 'lucky', note: was.note }, { chosen: was.chosen, typed: was.typed, shown: was.shown, hesitated: v === 'hard', lucky: v === 'lucky' });
    if (v === 'lucky') { toast(t('luckyNote')); advance(); }
    else if (fb.tamed || fb.joined) { sfx('trumpet'); render(); } else advance();
  }
  else if (action === 'tour') startTour(id);
  else if (action === 'chunk' && !S.feedback && !S.dragged) {
    const L = S.local ??= { picked: [], lock: 0 }, k = +b.dataset.k, i = L.picked.indexOf(k);
    if (i < 0) L.picked.push(k); else if (i >= L.lock) L.picked.splice(i, 1);
    render();
  }
  else if (action === 'check-order' && !S.feedback) checkOrder();
  else if (action === 'match' && !S.feedback) {
    const a = S.step.activity, L = S.local ??= { done: [], errors: [] }, side = b.dataset.side;
    L.bad = null;
    if (!L.sel || L.sel.side === side) L.sel = { side, id };
    else {
      const word = side === 'l' ? id : L.sel.id, sense = side === 'r' ? id : L.sel.id;
      if (word === sense) { L.done.push(id); sfx('pop'); }
      else { if (!L.errors.includes(word)) L.errors.push(word); L.bad = ['l' + word, 'r' + sense]; sfx('steps'); }
      L.sel = null;
      if (L.done.length === a.left.length) commit({ ok: !L.errors.length }, { missed: L.errors });
    }
    render();
  }
  else if ((action === 'bank-word' || action === 'bank-gap') && !S.feedback) {
    const L = S.local ??= { fill: S.step.activity.items.map(() => null), cur: 0 };
    if (action === 'bank-gap') { L.cur = +b.dataset.i; L.fill[L.cur] = null; }
    else if (L.cur >= 0) { L.fill[L.cur] = +b.dataset.k; L.cur = L.fill.indexOf(null); }
    render();
  }
  else if (action === 'check-bank' && !S.feedback) {
    const a = S.step.activity, L = S.local;
    L.missed = a.items.filter((it, i) => a.bank[L.fill[i]] !== it.answer).map(it => it.id);
    cheer(commit({ ok: !L.missed.length }, { missed: L.missed })); render();
  }
  else if (action === 'challenge') startChallenge(id, +b.dataset.stage);
  else if (action === 'copy-prompt') {
    if (!S.builder.level) return toast(t('pickLevel'));
    const pre = b.parentElement.querySelector('pre'), manual = () => { getSelection().selectAllChildren(pre); toast(t('copyManual')); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(prompts()[b.dataset.k]).then(() => toast(t('copied')), manual); else manual();
  }
  else if (action === 'images') { S.imgId = id; if (S.view !== 'images') { S.sheets = []; S.loose = []; } S.notice = null; S.view = 'images'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'swap-sheets') {
    const d = S.decks.find(x => x.id === S.imgId), n = S.sheets.length, total = [1, 1, 2, 6, 24, 120][Math.min(n, 5)];
    S.perm = (S.perm + 1) % total;
    cutSheets(d, nthPerm(S.sheets, S.perm)).then(() => saveDecks()).then(render);
  }
  else if (action === 'assign-image' && S.loose.length) { const d = S.decks.find(x => x.id === S.imgId); d.byId[id].image = S.loose.shift(); saveDecks(); render(); }
  else if (action === 'skip-image') { S.loose.shift(); render(); }
  else if (action === 'reset') { S.confirmReset = id; render(); }
  else if (action === 'reset-yes') { S.progress[id] = {}; S.confirmReset = null; saveProgress(id); render(); }
  else if (action === 'dl') download(MODELS[model].file, MODELS[model].csv);
  else if (action === 'copy') navigator.clipboard?.writeText(MODELS[model].csv).then(() => toast(t('copied')), () => toast(t('downloadFail')));
  else if (action === 'try') addDeck(MODELS[model].csv, MODELS[model].name, MODELS[model].lang, false, MODELS[model].level || 'A2');
});
app.addEventListener('submit', e => {
  e.preventDefault();
  const kind = e.target.dataset.submit;
  if (kind === 'import') { const f = e.target; importPacket({ files: [...f.files.files], text: f.text.value, name: f.name.value.trim(), lang: f.lang.value, level: f.level.value }); }
  else if (kind === 'card') saveCard(e.target);
  else if (kind === 'rename') { const d = editing(), n = e.target.name.value.trim(); if (n) { d.name = n; d.lang = e.target.lang.value; d.level = e.target.level.value; d.demo = false; saveDecks(); S.notice = { text: t('saved') }; render(); } }
  else if (kind === 'typed' && !S.feedback) submitTyped(e.target.answer.value);
});
function applySetting(k, v) {
  S[k] = k === 'minutes' || k === 'maxNew' ? +v : k === 'sound' || k === 'voice' ? v === '1' : v;
  saveSettings(); render();
  if (k === 'sound' && S.sound) sfx('pop');
}
app.addEventListener('change', e => {
  if (e.target.dataset.file) return attach(e.target);
  if (e.target.dataset.grid) {                 // grille des planches : colonnes ou rangées
    const d = S.decks.find(x => x.id === S.imgId), G = gridOf(d.grid);
    G[e.target.dataset.grid] = +e.target.value; d.grid = `${G.cols}x${G.rows}`;
    (S.sheets.length ? cutSheets(d, nthPerm(S.sheets, S.perm)) : Promise.resolve()).then(() => saveDecks()).then(render);
  }
});
app.addEventListener('input', e => {
  const k = e.target.dataset?.b;
  if (k) { S.builder[k] = k === 'count' ? Math.min(500, Math.max(3, Math.round(+e.target.value) || 20)) : e.target.value; return refreshPrompts(); }
  if (e.target.dataset.input !== 'search') return;
  const q = e.target.value.trim().toLowerCase();
  for (const li of app.querySelectorAll('.cardlist li')) li.hidden = !!q && !li.dataset.text.includes(q);
});
document.addEventListener('keydown', e => {
  if (S.view !== 'session' || S.feedback || !S.step?.activity?.options) return;
  const i = ['1', '2', '3', '4'].indexOf(e.key);
  if (i >= 0) app.querySelector(`.option[data-i="${i}"]`)?.click();
});

// Glisser-déposer des morceaux de phrase (souris, doigt ou stylet). Toucher un morceau fait la même chose :
// le glisser n'est jamais obligatoire, pour le clavier et les personnes qui ne peuvent pas maintenir un appui.
let drag = null;
app.addEventListener('pointerdown', e => {
  const c = e.target.closest?.('.chunk[data-action="chunk"]:not(:disabled)');
  if (c && !S.feedback) drag = { k: +c.dataset.k, x: e.clientX, y: e.clientY, el: c, ghost: null };
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('ghost'); document.body.append(drag.ghost); drag.el.classList.add('lifted');
  }
  drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
});
const endDrag = e => {
  const d = drag; drag = null;
  if (!d?.ghost) return;
  d.ghost.remove(); S.dragged = true; setTimeout(() => { S.dragged = false; }, 0);
  if (e.type === 'pointerup') dropChunk(d.k, e.clientX, e.clientY); else render();
};
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

load().then(render).catch(err => { app.innerHTML = `<p class="banner warn">${esc(err.message)}</p>`; });

// Accès réservé aux tests automatiques (tests/browser_test.py).
window.__elefiches = { get step() { return S.step; }, get state() { return S; }, rerender: render };
