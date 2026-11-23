// Éléfiches — interface : accueil, espace enseignant, session, bilan.
import * as store from './store.js';
import { deckFromCSV, deckFromJSON, deckToJSON, prepare, serialize, hash, demoDeck, MODELS, safeUrl, LEVELS } from './deck.js';
import { summary, boxOf, dueInDays, HERD_BOX } from './scheduler.js';
import { Session, meaning, gloss, pickNew } from './session.js';
import { check, clozeParts } from './match.js';
import { STR, LANG_NAMES } from './i18n.js';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { lang: 'auto', minutes: 5, maxNew: 3, help: 'fr', sound: true, decks: [], progress: {}, view: 'home', notice: null, toast: null, confirmReset: null, confirmDel: null, editId: null, cardId: null, draft: {} };
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
const head = (cls = '') => `<svg class="head ${cls}" width="46" height="44" viewBox="52 18 54 50" aria-hidden="true"><circle cx="84" cy="42" r="20" fill="#a4aab4"/><circle cx="96" cy="48" r="3" fill="#f0a08c" opacity=".4"/><g class="e-eye"><circle cx="91" cy="38" r="2.8" fill="#2b2a33"/><circle cx="92" cy="37" r="1" fill="#fff"/></g><g class="e-ear"><path d="M80 22C62 14 50 32 55 48C59 62 75 64 82 50C85 42 85 30 80 22Z" fill="#babac2" stroke="#8d939e" stroke-width="1.2"/></g></svg>`;

// ---------- Sons ----------

let voices = [], audioCtx = null;
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch { voices = []; } };
try { loadVoices(); speechSynthesis.addEventListener('voiceschanged', loadVoices); } catch { /* pas de synthèse vocale */ }

function toast(text) { S.toast = text; render(); setTimeout(() => { if (S.toast === text) { S.toast = null; render(); } }, 4000); }

// Lit le mot : fichier audio de la fiche s'il existe, sinon voix de l'appareil dans la langue du paquet.
function speak(card, lang) {
  const tts = () => {
    try {
      if (!voices.length) loadVoices();
      const code = VOICES[lang] || lang;
      const u = new SpeechSynthesisUtterance(card.word.replace(/\s*\([^)]*\)/g, '').replace(/\(([^)\s]+)\)/g, '').replace(/…/g, ' ').replace(/\s\/\s/g, ', '));
      const v = voices.find(x => x.lang === code) || voices.find(x => x.lang?.toLowerCase().startsWith(lang));
      if (v) u.voice = v;
      u.lang = v?.lang || code; u.rate = 0.9;
      let started = false;
      u.onstart = () => { started = true; };
      u.onerror = e => { started = true; if (e.error !== 'interrupted' && e.error !== 'canceled') toast(t('ttsSilent')); };
      setTimeout(() => { if (!started) toast(t('ttsSilent')); }, 2500);   // certains cadres bloquent la voix sans le dire
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.resume?.();
      setTimeout(() => speechSynthesis.speak(u), 80);      // Chrome reste muet si « speak » suit « cancel » sans délai
      if (voices.length && !v) toast(t('noVoice', LANG_NAMES[lang] || lang));
    } catch { toast(t('noVoice', LANG_NAMES[lang] || lang)); }
  };
  if (card.audio) { try { new Audio(card.audio).play().catch(tts); } catch { tts(); } } else tts();
}

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
  Object.assign(S, { lang: set.lang || 'auto', minutes: set.minutes || 5, maxNew: set.maxNew || 3, help: set.help || 'fr', sound: set.sound ?? true });
  const saved = (await store.get('decks')) || [];
  S.decks = saved.map(prepare);
  if (!S.decks.length) { S.decks = [demoDeck()]; await saveDecks(); }
  for (const d of S.decks) S.progress[d.id] = (await store.get('progress:' + d.id)) || {};
}
const saveDecks = () => store.set('decks', S.decks.map(serialize));
const saveSettings = () => store.set('settings', { lang: S.lang, minutes: S.minutes, maxNew: S.maxNew, help: S.help, sound: S.sound });
const saveProgress = id => store.set('progress:' + id, S.progress[id]);

// Langue des traductions affichées pour un paquet, selon le réglage de l'étudiant et ce que le paquet contient.
function helpFor(deck) {
  if (S.help === 'none') return null;
  return deck.helpLangs.includes(S.help) ? S.help : deck.helpLangs.includes('*') ? '*' : null;
}

// ---------- Accueil ----------

// Le troupeau : un éléphanteau naît à chaque mot découvert et grandit de la boîte 1 à la boîte 5.
function prairie(s, hop = [], sleeping = false) {
  const sizes = [0, 26, 30, 34, 39, 44];
  const herd = s.animals.map(a => `<span class="ele${hop.includes(a.id) ? ' hop' : ''}" title="${esc(a.word)} · ${t('box', a.box)}">${mascot(sizes[a.box], sleeping ? 'sleep' : 'idle', a.box)}</span>`).join('');
  const seeds = '<i>🥜</i>'.repeat(s.stage.allSeen ? 0 : s.stage.size - s.stage.seen);     // une cacahuète par mot restant dans l'étape
  return `<div class="prairie" role="img" aria-label="${esc(t('herdCount', s.animals.length))}">${herd}<span class="seeds">${seeds}</span></div>`;
}

function deckCard(d) {
  const P = S.progress[d.id], s = summary(d, P), fresh = pickNew(d, P, S.maxNew).length;
  const nextDays = Math.min(...d.cards.map(c => dueInDays(P[c.id])).filter(n => n > 0), 999);
  const mission = [fresh ? t('todayNew', fresh) : '', s.due ? t('todayDue', s.due) : ''].filter(Boolean).join(' · ');
  return `<article class="deck card" style="--th:${hue(d.cards[0].theme || d.name)}">
    <div class="deckhead">${mascot(64 + Math.round(40 * s.memory), '', Math.min(5, 1 + Math.floor(s.memory * 5)))}
      <div><h2 lang="${d.lang}">${esc(d.name)}</h2><p class="meta">${LANG_NAMES[d.lang] || d.lang} · ${d.level}${d.demo ? ' · ' + t('demo') : ''}</p></div></div>
    <p class="label">${t('herdCount', s.animals.length)}</p>
    ${prairie(s, [], !mission)}
    <p class="stage"><b>${s.stage.count > 1 ? t('stage', s.stage.index, s.stage.count) : t('stageOne')}</b> ${s.stage.allSeen ? t('allSeen') : t('stageWords', s.stage.seen, s.stage.size)}</p>
    <p class="meta ages">${[1, 2, 3, 4, 5].map(a => mascot(20 + a * 3, '', a)).join('<span aria-hidden="true">›</span>')}<span>${t('ages')}</span></p>
    ${mission ? `<p class="mission"><b>${t('today')}</b> ${mission}</p><button class="primary" data-action="start" data-id="${d.id}">${t('start', S.minutes)}</button>`
      : `<p class="rest">${t('nothing', nextDays)}</p>`}
    ${S.confirmReset === d.id
      ? `<button class="link danger" data-action="reset-yes" data-id="${d.id}">${t('resetSure')}</button>`
      : `<button class="link" data-action="reset" data-id="${d.id}">${t('reset')}</button>`}
  </article>`;
}

const opt = (v, cur, label) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${label}</option>`;
const seg = (key, cur, items) => `<div class="seg" role="group">${items.map(([v, l]) => `<button type="button" data-action="set" data-key="${key}" data-value="${v}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join('')}</div>`;
const setrow = (label, control) => `<div class="setrow"><span>${t(label)}</span>${control}</div>`;
const langOpts = cur => Object.entries(LANG_NAMES).map(([k, n]) => opt(k, cur, n)).join('');
const banners = () => `${store.isPersistent() ? '' : `<p class="banner warn">${t('notSaved')}</p>`}
  ${S.notice ? `<p class="banner ${S.notice.bad ? 'warn' : 'good'}" role="status">${esc(S.notice.text)}</p>` : ''}`;

function home() {
  return `<header class="top">${mascot(68, 'idle', 2)}<div class="brand"><h1>Éléfiches</h1><p>${t('tagline')}</p></div></header>
    ${banners()}
    <div class="appetite"><span>${t('appetite')}</span>${seg('maxNew', S.maxNew, [[3, '🥜 ' + t('ap1')], [5, '🥜🥜 ' + t('ap2')], [8, '🥜🥜🥜 ' + t('ap3')]])}</div>
    <section class="decks">${S.decks.map(deckCard).join('')}</section>
    <details class="card settings"><summary><span aria-hidden="true">⚙️</span> ${t('settings')}</summary>
      ${setrow('appLang', seg('lang', S.lang, [['auto', t('auto')], ...Object.entries(LANG_NAMES)]))}
      <p class="sethint">${t('autoHint')}</p>
      ${setrow('help', seg('help', S.help, [['none', t('helpNone')], ...Object.entries(LANG_NAMES)]))}
      ${setrow('duration', seg('minutes', S.minutes, [3, 5, 10, 15].map(m => [m, t('min', m)])))}
      ${setrow('sound', seg('sound', S.sound ? '1' : '0', [['1', '🔔 ' + t('on')], ['0', '🔕 ' + t('off')]]))}
    </details>
    <button class="secondary" data-action="teacher">${t('teacher')}</button>`;
}

// ---------- Espace enseignant ----------

function teacherView() {
  const model = (k, title, sub) => `<li><b>${t(title)}</b><span class="meta">${t(sub)}</span>
    <span class="row"><button class="secondary small" data-action="dl" data-model="${k}">${t('download')}</button>
    <button class="secondary small" data-action="copy" data-model="${k}">${t('copy')}</button>
    <button class="secondary small" data-action="try" data-model="${k}">${t('tryIt')}</button></span></li>`;
  const row = (name, need, what) => `<tr><th scope="row">${name}</th><td>${t(need)}</td><td>${t(what)}</td></tr>`;
  return `<button class="link" data-action="home">← ${t('back')}</button>
    <h1>${t('tTitle')}</h1><p class="lead">${t('tIntro')}</p>
    ${banners()}
    <section class="card"><h2>${t('myDecks')}</h2><ul class="decklist">${S.decks.map(d => `<li>
      <span><b lang="${d.lang}">${esc(d.name)}</b><br><span class="meta">${t('nCards', d.cards.length)} · ${LANG_NAMES[d.lang] || d.lang} · ${d.level}</span></span>
      <span class="row"><button class="secondary small" data-action="edit" data-id="${d.id}">${t('edit')}</button>
      <button class="secondary small" data-action="export" data-id="${d.id}">${t('exportBtn')}</button>
      ${S.confirmDel === d.id ? `<button class="link danger" data-action="del-yes" data-id="${d.id}">${t('delSure')}</button>` : `<button class="link" data-action="del" data-id="${d.id}">${t('del')}</button>`}</span></li>`).join('')}</ul></section>
    <h2 class="sec">${t('tNew')}</h2>
    <section class="card"><ol class="steps">${t('tSteps').map(s => `<li>${s}</li>`).join('')}</ol></section>
    <section class="card"><h2>${t('tModels')}</h2><ul class="models">
      ${model('fr', 'tModelFr', 'tModelFrSub')}${model('en', 'tModelEn', 'tModelEnSub')}${model('es', 'tModelEs', 'tModelEsSub')}</ul></section>
    <section class="card"><h2>${t('tCols')}</h2><div class="scroll"><table>
      <thead><tr><th>${t('colName')}</th><th>${t('colNeed')}</th><th>${t('colWhat')}</th></tr></thead><tbody>
      ${row('Word', 'yes', 'cWord')}${row('Definition', 'oneOf', 'cDef')}${row('Traduction FR<br>Traduction EN', 'oneOf', 'cTr')}
      ${row('Example 1<br>Example 2<br>Example 3', 'advised', 'cEx')}${row('Category', 'advised', 'cCat')}${row('Famille', 'optional', 'cFam')}
      ${row('Image', 'optional', 'cImg')}${row('Audio', 'optional', 'cAudio')}${row('IPA', 'optional', 'cIpa')}
      </tbody></table></div></section>
    <section class="card import"><h2>${t('importTitle')}</h2>
      <form data-submit="import">
        <label>${t('deckName')} <input name="name" autocomplete="off"></label>
        <label>${t('deckLang')} <select name="lang">${langOpts('fr')}</select></label>
        <label>${t('level')} <select name="level">${LEVELS.map(l => opt(l, 'A2', l)).join('')}</select></label>
        <label>${t('fileJson')} <input name="file" type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json"></label>
        <button class="primary">${t('importBtn')}</button>
      </form></section>`;
}

async function addDeck(text, name, lang, json = false, level) {
  try {
    const deck = json ? deckFromJSON(text, name) : deckFromCSV(text, name, lang, level);
    S.decks = [...S.decks.filter(d => d.id !== deck.id), deck];
    S.progress[deck.id] ??= (await store.get('progress:' + deck.id)) || {};
    await saveDecks();
    S.notice = { text: t('imported', deck.name, deck.cards.length, deck.skipped, deck.cards.filter(c => c.clozes.length).length) };
    S.view = 'home';
  } catch (e) {
    S.notice = { bad: true, text: t({ 'no-word-column': 'errNoWord', 'too-few': 'errFew' }[e.message] || 'errEmpty') };
  }
  render();
}

async function importDeck(form) {
  const name = form.name.value.trim(), file = form.file.files[0], json = /\.json$/i.test(file?.name || '');
  if (!file || (!name && !json)) { S.notice = { bad: true, text: t('errName') }; return render(); }
  addDeck(await file.text(), name, form.lang.value, json, form.level.value);
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
      <div class="row tools"><input type="search" data-input="search" placeholder="${t('eSearch')}" aria-label="${t('eSearch')}">
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
      <label>${t('fEx')} <textarea name="examples" rows="3" lang="${d.lang}">${esc(c.examples.join('\n'))}</textarea></label>
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
    theme: v('theme') || undefined, register: v('register') || undefined, family: v('family') || undefined, ipa: v('ipa') || undefined,
    image: safeUrl(v('imageUrl')) || S.draft.image || undefined, audio: safeUrl(v('audioUrl')) || S.draft.audio || undefined };
  const old = d.byId[S.cardId];
  if (old) Object.assign(old, data); else d.cards.push({ id: 'c' + hash(data.word + Date.now()), extra: {}, ...data });
  prepare(d); await saveDecks();
  S.notice = { text: t('saved') }; S.view = 'edit'; window.scrollTo?.(0, 0); render();
}

// Réduit une image à 640 pixels de côté au plus, pour que les paquets restent légers.
async function imageToDataURL(file) {
  const asData = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  if (file.type === 'image/svg+xml') return asData(file);
  const bmp = await createImageBitmap(file), k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const webp = cv.toDataURL('image/webp', 0.85);
  return webp.startsWith('data:image/webp') ? webp : cv.toDataURL('image/jpeg', 0.85);
}

async function attach(input) {
  const kind = input.dataset.file, file = input.files[0]; if (!file) return;
  try {
    if (kind === 'image') S.draft.image = await imageToDataURL(file);
    else {
      if (file.size > 600 * 1024) return toast(t('tooBig', 600));
      S.draft.audio = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    }
    showDraft();
  } catch { toast(t('errEmpty')); }
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

function startSession(id) {
  const deck = S.decks.find(d => d.id === id);
  deck.help = helpFor(deck);
  S.stageBefore = summary(deck, S.progress[id]).stage;
  S.session = new Session(deck, S.progress[id], { minutes: S.minutes, maxNew: S.maxNew });
  S.view = 'session'; S.notice = null;
  advance();
}

function advance() {
  S.feedback = null;
  S.step = S.session.next();
  if (!S.step) { S.view = 'done'; saveProgress(S.session.deck.id); sfx('birds'); }
  else if (S.step.intro) saveProgress(S.session.deck.id);
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
  const { card, activity: a } = step, fb = S.feedback;
  const options = () => `<div class="options">${a.options.map((o, i) => {
    const cls = fb ? (o === a.answer ? 'right' : o === fb.chosen ? 'wrong' : '') : '';
    return `<button class="option ${cls}" data-action="choose" data-i="${i}" ${fb ? 'disabled' : ''} lang="${lang}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`;
  }).join('')}</div>`;
  const input = () => `<form class="typed" data-submit="typed">
      <label>${t('answerLabel')} <input name="answer" lang="${lang}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${fb ? `disabled value="${esc(fb.typed)}"` : 'autofocus'}></label>
      ${fb ? '' : `<div class="row"><button class="primary">${t('validate')}</button><button type="button" class="link" data-action="skip">${t('dontKnow')}</button></div>`}
    </form>`;
  const hint = `<div class="hint"><span class="tag">${t('hint')}</span>${sense(card, lang, 'hintdef')}</div>`;
  let body;
  if (a.type === 'qcm') body = `<p class="question">${t('qMeaning')}</p><h2 class="word" lang="${lang}">${esc(card.bare)} ${listenBtn(card)}</h2>${options()}`;
  else if (a.type === 'qcm-rev') body = `<p class="question">${t('qWord')}</p>${illus(card)}${sense(card, lang, 'def big')}${options()}`;
  else if (a.type === 'cloze-choice') body = `<p class="question">${t('qCloze')}</p>${sentence(a.cloze, lang, !!fb)}${hint}${options()}`;
  else if (a.type === 'cloze-type') body = `<p class="question">${t('qClozeType')}</p>${sentence(a.cloze, lang, !!fb)}${hint}${input()}`;
  else body = `<p class="question">${t('qType')}</p>${illus(card)}${sense(card, lang, 'def big')}${input()}`;
  return `<div class="card study" style="--th:${hue(card.theme)}">${body}</div>${fb ? feedbackView(step, lang) : ''}`;
}

function feedbackView(step, lang) {
  const { card } = step, fb = S.feedback, s = S.session;
  const title = fb.ok ? t(['ok1', 'ok2', 'ok3'][fb.n % 3]) : fb.near ? t('near') : t('no');
  const note = fb.note === 'accent' ? t('noteAccent', fb.shown) : fb.note === 'article' ? t('noteArticle', fb.shown) : fb.note === 'form' ? t('noteForm', fb.shown) : '';
  const ex = card.examples.find(e => !step.activity.cloze || e.replace(/[’`´]/g, "'") !== step.activity.cloze.text) || card.examples[0];
  const move = fb.retry ? '' : fb.boxAfter > fb.boxBefore ? t('boxUp', fb.boxAfter) : fb.boxAfter < fb.boxBefore ? t('boxDown', fb.boxAfter) : '';
  const when = fb.ok && !fb.retry ? t('nextIn', Math.max(1, fb.days)) : fb.ok ? '' : t('nextSoon');
  const wins = [fb.joined ? t('joined') : '', fb.tamed ? t('tamed', card.word, s.tamed.length, s.today.length) : '',
    fb.ok && [3, 5, 10].includes(s.stats.streak) ? t('streak', s.stats.streak) : ''].filter(Boolean);
  return `<div class="card feedback ${fb.ok ? 'good' : 'soft'}" role="status" aria-live="polite">
    <h3>${title}</h3>
    ${wins.length ? `<p class="win">${mascot(44, 'joy', Math.max(1, fb.boxAfter))}<span>${wins.map(esc).join('<br>')}</span></p>` : ''}
    ${fb.ok ? '' : `<p class="oopsrow">${mascot(46, 'oops', Math.max(1, fb.boxAfter))}<span>${fb.pun ? esc(t('puns')[fb.n % t('puns').length]) : ''}</span></p>`}
    ${note ? `<p>${esc(note)}</p>` : ''}
    <p class="recap"><b lang="${lang}">${esc(card.word)}</b> ${listenBtn(card)}</p>
    ${sense(card, lang, 'recapdef')}
    ${ex ? `<p class="example" lang="${lang}"><span class="meta">${t('example')} :</span> ${esc(ex)}</p>` : ''}
    <p class="meta">${[move, when].filter(Boolean).join(' ')}</p>
    <button class="primary" data-action="next" autofocus>${t('next')}</button>
  </div>`;
}

function grade(result, extra = {}) {
  const step = S.step, s = S.session, before = boxOf(s.progress[step.card.id]);
  const st = s.answer(step, result.ok);
  const after = boxOf(st), retry = !!step.item.retry;
  S.feedback = { ...result, ...extra, retry, boxBefore: before, boxAfter: after, days: dueInDays(st), n: s.served,
    tamed: s.lastTamed, joined: !retry && before < HERD_BOX && after >= HERD_BOX, pun: !result.ok && (S.errors = (S.errors || 0) + 1) % 3 === 1 };
  sfx(!result.ok ? 'steps' : S.feedback.tamed || S.feedback.joined ? 'trumpet' : 'pop');
  saveProgress(s.deck.id);
  render();
}

function submitTyped(value) {
  const a = S.step.activity;
  let r = check(value, a.accepted);
  if (r.empty) return;
  if (!r.ok && a.lemmas) {                         // l'étudiant a écrit la forme de base au lieu de la forme conjuguée
    const l = check(value, a.lemmas);
    if (l.ok) r = { ok: true, note: 'form' };
  }
  grade(r, { typed: value, shown: a.type === 'cloze-type' ? a.answer : S.step.card.word });
}

function sessionView() {
  const { session: s, step } = S, lang = s.deck.lang;
  const done = s.served - (S.feedback || step.intro ? 0 : 1) - (step.intro ? 1 : 0);
  const pct = Math.min(100, Math.round(100 * Math.max(0, done) / Math.max(1, s.served + s.remaining)));
  const box = S.feedback ? S.feedback.boxBefore : boxOf(s.progress[step.card.id]);
  const dots = s.today.length ? `<span class="dots" role="img" aria-label="${esc(t('wordsToday', s.tamed.length, s.today.length))}">${s.today.map(id => `<i class="${s.tamed.includes(id) ? 'on' : ''}"></i>`).join('')}</span>` : '';
  return `<div class="bar">
      <button class="icon" data-action="quit" aria-label="${t('quit')}" title="${t('quit')}">✕</button>
      <div class="trunk" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">${head(S.feedback ? (S.feedback.ok ? 'joy' : 'oops') : 'idle')}<div class="track"><span style="width:${pct}%"></span></div><span class="nut" aria-hidden="true">🥜</span></div>
      ${dots}
    </div>
    <p class="where"><span class="chip box">${step.intro ? t('newCard') : t('box', box)}</span></p>
    ${step.intro ? introView(step.card, lang) : activityView(step, lang)}`;
}

function doneView() {
  const { stats, deck, tamed, today } = S.session, P = S.progress[deck.id];
  const words = ids => [...new Set(ids)].map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ');
  const s = summary(deck, P), more = s.due + pickNew(deck, P, S.maxNew).length > 0;
  const stageDone = s.stage.count > 1 && (s.stage.index > S.stageBefore.index || (s.stage.allSeen && !S.stageBefore.allSeen));
  const line = (label, ids) => (ids.length ? `<p><span class="label">${t(label)}</span><br>${words(ids)}</p>` : '');
  return `<div class="card done">
    <div class="rain" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 11) % 96}%;animation-delay:${(i * 0.13).toFixed(2)}s;font-size:${1 + (i % 3) * 0.3}rem">🥜</i>`).join('')}</div>
    ${mascot(104, 'joy', Math.min(5, 1 + Math.floor(summary(deck, P).memory * 5)))}
    <h2>${t('doneTitle')}</h2>
    ${today.length ? `<p class="big">${t('doneTamed', tamed.length)}</p>` : ''}
    <p>${stats.answered ? t('doneStats', stats.ok, stats.answered) : t('doneNone')}${stats.best >= 3 ? ' ' + t('doneBest', stats.best) : ''}</p>
    ${stageDone ? `<p class="win">${mascot(44, 'joy', 3)}<span>${t('stageDone', S.stageBefore.index)}</span></p>` : ''}
    <p class="label">${t('herdCount', s.animals.length)}</p>
    ${prairie(s, [...today, ...stats.up])}
    <p class="quip">${t('quips')[(stats.answered + s.animals.length) % t('quips').length]}</p>
    ${line('doneHerd', stats.herd)}${line('doneUp', stats.up)}${line('doneAgain', stats.again)}
    <div class="row">${more ? `<button class="secondary" data-action="start" data-id="${deck.id}">${t('again')}</button>` : ''}<button class="primary" data-action="home" autofocus>${t('home')}</button></div>
    <button class="link" data-action="share">${t('share')}</button>
  </div>`;
}

// ---------- Rendu et événements ----------

function render() {
  document.documentElement.lang = uiLang();
  const open = app.querySelector('details.settings')?.open;
  app.innerHTML = (S.view === 'session' ? sessionView() : S.view === 'done' ? doneView() : S.view === 'teacher' ? teacherView() : S.view === 'edit' ? editView() : S.view === 'card' ? cardView() : home())
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
  else if (action === 'next') advance();
  else if (action === 'home' || action === 'quit') { if (S.session) saveProgress(S.session.deck.id); S.view = 'home'; S.session = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'teacher') { S.view = 'teacher'; S.notice = null; S.confirmDel = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'set') applySetting(b.dataset.key, b.dataset.value);
  else if (action === 'share') { const st = S.session.stats; navigator.clipboard?.writeText(t('shareText', S.session.deck.name, S.session.tamed.length, st.ok, st.answered)).then(() => toast(t('copied')), () => toast(t('downloadFail'))); }
  else if (action === 'edit') { S.editId = id; S.view = 'edit'; if (b.closest('form')) S.notice = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'card') { const c = editing().byId[id]; S.cardId = id; S.draft = { image: c?.image, audio: c?.audio }; S.notice = null; S.view = 'card'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'clear') { S.draft[b.dataset.key] = undefined; const u = b.closest('form')[b.dataset.key + 'Url']; if (u) u.value = ''; showDraft(); }
  else if (action === 'test-audio') { const f = b.closest('form'), src = safeUrl(f.audioUrl.value) || S.draft.audio; speak({ word: f.word.value, audio: src }, editing().lang); }
  else if (action === 'del-card') { const d = editing(); d.cards = d.cards.filter(c => c.id !== S.cardId); prepare(d); saveDecks(); S.view = 'edit'; render(); }
  else if (action === 'export') { const d = S.decks.find(x => x.id === id); download(d.name.replace(/[^\p{L}\p{N}]+/gu, '-') + '.json', deckToJSON(d), false); }
  else if (action === 'del') { S.confirmDel = id; render(); }
  else if (action === 'del-yes') { S.decks = S.decks.filter(d => d.id !== id); S.confirmDel = null; saveDecks(); render(); }
  else if (action === 'speak') speak(S.session.deck.byId[id], S.session.deck.lang);
  else if (action === 'choose' && !S.feedback) { const o = S.step.activity.options[+b.dataset.i]; grade({ ok: o === S.step.activity.answer }, { chosen: o }); }
  else if (action === 'skip') grade({ ok: false }, { typed: '' });
  else if (action === 'reset') { S.confirmReset = id; render(); }
  else if (action === 'reset-yes') { S.progress[id] = {}; S.confirmReset = null; saveProgress(id); render(); }
  else if (action === 'dl') download(MODELS[model].file, MODELS[model].csv);
  else if (action === 'copy') navigator.clipboard?.writeText(MODELS[model].csv).then(() => toast(t('copied')), () => toast(t('downloadFail')));
  else if (action === 'try') addDeck(MODELS[model].csv, MODELS[model].name, MODELS[model].lang, false, MODELS[model].level);
});
app.addEventListener('submit', e => {
  e.preventDefault();
  const kind = e.target.dataset.submit;
  if (kind === 'import') importDeck(e.target);
  else if (kind === 'card') saveCard(e.target);
  else if (kind === 'rename') { const d = editing(), n = e.target.name.value.trim(); if (n) { d.name = n; d.lang = e.target.lang.value; d.level = e.target.level.value; d.demo = false; saveDecks(); S.notice = { text: t('saved') }; render(); } }
  else if (kind === 'typed' && !S.feedback) submitTyped(e.target.answer.value);
});
function applySetting(k, v) {
  S[k] = k === 'minutes' || k === 'maxNew' ? +v : k === 'sound' ? v === '1' : v;
  saveSettings(); render();
  if (k === 'sound' && S.sound) sfx('pop');
}
app.addEventListener('change', e => { if (e.target.dataset.file) attach(e.target); });
app.addEventListener('input', e => {
  if (e.target.dataset.input !== 'search') return;
  const q = e.target.value.trim().toLowerCase();
  for (const li of app.querySelectorAll('.cardlist li')) li.hidden = !!q && !li.dataset.text.includes(q);
});
document.addEventListener('keydown', e => {
  if (S.view !== 'session' || S.feedback || !S.step?.activity?.options) return;
  const i = ['1', '2', '3'].indexOf(e.key);
  if (i >= 0) app.querySelector(`.option[data-i="${i}"]`)?.click();
});

load().then(render).catch(err => { app.innerHTML = `<p class="banner warn">${esc(err.message)}</p>`; });

// Accès réservé aux tests automatiques (tests/browser_test.py).
window.__elefiches = { get step() { return S.step; }, get state() { return S; }, rerender: render };
