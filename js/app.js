// Éléfiches — interface : accueil, espace enseignant, session, bilan.
import * as store from './store.js';
import { deckFromCSV, deckFromJSON, deckFromAnki, mergeDecks, audit, REGISTERS, safeKey, deckToJSON, looksJSON, levelIn, prepare, serialize, hash, demoDeck, MODELS, safeUrl, LEVELS, PLAN_DAYS, adviseDays } from './deck.js';
import { summary, boxOf, dueInDays, isNew, isDue, stageOf, HERD_BOX, shiftProgress, nextDueIn } from './scheduler.js';
import { Session, Challenge, Tour, Placement, meaning, gloss, pickNew, judge, roomFor, buildActivity, SELF, kindOf, suggestKind, genderOf, needsGender, GENDERED_LANGS } from './session.js';
import { clozeParts, norm, noAcc, noArt, diffParts, remark, spoken, slug } from './match.js';
import { unzip, typeOf } from './zip.js';
import { buildPrompts, GRIDS, gridOf } from './prompts.js';
import { openSqlite } from './sqlite.js';
import { buildICS } from './remind.js';
import { makeBackup, readBackup, mergeProgress, cleanProgress, countReplaced, countAdded, countLate } from './backup.js';
import { ACCESS, MIN_CODE, validAccess, makeAccess, checkAccess } from './acces.js';
import { STR, LANG_NAMES } from './i18n.js';
import { PACES, DAY, EXTRA_MIN, paceDays, simulate, today as planToday, outlook, startPlan, cleanMeasure, emptyMeasure, addTime, addTry, rates, minutes, missedNow, markWorked, stepsLeft, milestone, dayEnd, dayIndex, OWN, SMALL, OFFER, staleIds, weakIds } from './plan.js';

const app = document.getElementById('app');
// En ligne, l'application ne s'affiche pas à l'intérieur de la page d'un autre site (protection contre le détournement de clics).
if (window.top !== window.self && /\.github\.io$/i.test(location.hostname)) { document.body.textContent = ''; throw new Error('cadre'); }
// Deux interfaces sur le même code : index.html pour les étudiants (jouer), enseignant.html pour créer et modifier les paquets.
const TEACHER = document.body.dataset.mode === 'teacher';
// Version de l'application : Éléfiches VOC' (vocabulaire). Une version GRAM' (grammaire) est prévue, avec sa propre méthode.
const EDITION = 'voc’';
// Espace enseignant sur code d'accès (voir js/acces.js). Sur un poste de développement, le verrou ne s'applique que si
// l'adresse le demande (?verrou), pour que les tests automatiques puissent parcourir l'éditeur.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const GATED = TEACHER && validAccess(ACCESS) && (!LOCAL || new URLSearchParams(location.search).has('verrou'));
const siteBase = () => location.origin + location.pathname.replace(/[^/]*\.html$/, '');
const plainSp = s => String(s).replace(/\u00a0/g, ' ');      // espaces insécables de l'interface ramenées à des espaces simples
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { locked: GATED, lang: 'auto', minutes: 5, maxNew: 3, help: 'fr', sound: true, voice: true, remind: { time: '18:00', days: 'daily' }, savedAt: 0, decks: [], progress: {}, view: 'home', notice: null, toast: null, confirmReset: null, confirmDel: null, editId: null, cardId: null, draft: {}, local: null, gate: false, builder: { lang: 'fr', level: '', topic: '', count: 20, words: '', grid: '3x3', examples: 4 }, sheets: [], loose: [], perm: 0, sandbox: false, sbDays: 0, confirmSb: false, measure: emptyMeasure(), planId: null, stepAt: 0 };
// Langue des consignes et du feedback. En mode automatique : français jusqu'au niveau B1,
// langue apprise à partir de B2 (règle fixée par la responsable du projet). L'étudiant peut toujours choisir lui-même.
function uiLang() {
  if (S.lang !== 'auto') return S.lang;
  const d = (S.view === 'session' || S.view === 'done') && S.session?.deck;
  return d && ['B2', 'C1', 'C2'].includes(d.level) && STR[d.lang] ? d.lang : 'fr';
}
const t = (k, ...a) => { let s = (STR[uiLang()] || STR.fr)[k] ?? STR.fr[k] ?? k; if (typeof s !== 'string') return s; return s.replace(/\{(\d)\}/g, (m, i) => (i < a.length ? String(a[i]) : m)); };      // une seule passe : un argument qui contient « {0} » ou « $& » reste du texte
const tn = (k, n, ...a) => t(k + (n === 1 ? '_1' : '_n'), n, ...a);      // libellé qui s'accorde : « 1 nouveau », « 12 nouveaux »
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
  const A = AGES[age] || AGES[1], k = 1 - A.body;
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
// L'éléphanteau de la barre de séance : le même dessin que celui de l'en-tête (âge 2), recadré, la trompe baissée jusqu'au sol. Sa trompe
// est la barre de progression : elle sort du dessin par la droite et se prolonge dans la piste (voir trunkBar et mealBar).
const calf = (cls = '') => { const A = AGES[2], T = 'translate(-3.6 4.8) translate(78 50) scale(1.06) translate(-78 -50)';
  return `<svg class="mascot calf ${cls}" width="73" height="52" viewBox="12 15.4 118 84" aria-hidden="true">
    <ellipse cx="58" cy="92" rx="31.7" ry="4" fill="#000" opacity=".08"/>
    <g transform="translate(52 90) scale(.88) translate(-52 -90)">
      <rect x="39" y="62" width="12" height="26" rx="5" fill="${A.shade}"/><rect x="71" y="62" width="12" height="26" rx="5" fill="${A.shade}"/>
      <path class="e-tail" d="M20 44C12 48 12 58 15 64" fill="none" stroke="${A.shade}" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="52" cy="52" rx="34" ry="24" fill="${A.skin}"/>
      <rect x="29" y="64" width="13" height="27" rx="6" fill="${A.skin}"/><rect x="61" y="64" width="13" height="27" rx="6" fill="${A.skin}"/>
      <path d="M31.500 89.500h2.500M36 89.500h2.500M63.500 89.500h2.500M68 89.500h2.500" stroke="#f6efe6" stroke-width="2" stroke-linecap="round"/>
      <path d="M40 30l-1-4M47 29v-4" stroke="#9a7b6b" stroke-width="1.5" stroke-linecap="round"/>
    </g>
    <g transform="${T}"><circle cx="84" cy="42" r="20" fill="${A.skin}"/><path d="M78 23l-1-5M83 21v-6M88 23l2-5" stroke="#9a7b6b" stroke-width="1.6" stroke-linecap="round"/></g>
    <path d="M95.600 50.600C106 53 108 64 111 72C113 78 119 80 128 80H130" fill="none" stroke="${A.skin}" stroke-width="9.700" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="under" d="M126 82.450H131V84.850H126Z"/>
    <g transform="${T}"><path d="M92 55q3 3 6 0" fill="none" stroke="#7d6a61" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="96" cy="48" r="3" fill="#f0a08c" opacity=".4"/>
      <g class="e-eye"><circle cx="91" cy="38" r="2.8" fill="#2b2a33"/><circle cx="92" cy="37" r="1" fill="#fff"/></g>
      <g class="e-ear"><path d="M80 22C62 14 50 32 55 48C59 62 75 64 82 50C85 42 85 30 80 22Z" fill="${A.ear}" stroke="${A.shade}" stroke-width="1.2" transform="translate(81 38) scale(${A.earS}) translate(-81 -38)"/></g></g>
  </svg>`; };
// Sur l'accueil, l'éléphanteau entier est déjà dans l'en-tête : les cartes ne montrent donc que sa tête, la même, d'où sort la trompe.
const head = (cls = '') => { const A = AGES[2];
  return `<svg class="mascot face ${cls}" width="50" height="44" viewBox="54 13.330 66 58.670" aria-hidden="true"><circle cx="84" cy="42" r="20" fill="${A.skin}"/><path d="M78 23l-1-5M83 21v-6M88 23l2-5" stroke="#9a7b6b" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M97 42C103 42.800 110 43.900 118 44H121V52H118C110 52.300 103 52.800 96 52.600Z" fill="${A.skin}"/><path class="under" d="M103 52.600C108 52.500 113 52.200 118 52H121V50H118C113 50.300 108 50.600 103 50.800Z"/>
    <path d="M92 55q3 3 6 0" fill="none" stroke="#7d6a61" stroke-width="1.4" stroke-linecap="round"/><circle cx="96" cy="48" r="3" fill="#f0a08c" opacity=".4"/>
    <g class="e-eye"><circle cx="91" cy="38" r="2.8" fill="#2b2a33"/><circle cx="92" cy="37" r="1" fill="#fff"/></g>
    <g class="e-ear"><path d="M80 22C62 14 50 32 55 48C59 62 75 64 82 50C85 42 85 30 80 22Z" fill="${A.ear}" stroke="${A.shade}" stroke-width="1.2" transform="translate(81 38) scale(${A.earS}) translate(-81 -38)"/></g></svg>`; };
// Le bout de la trompe : deux « doigts », celui du haut plus long, comme chez l'éléphant d'Afrique, et trois plis juste avant.
const TIP = '<svg class="tip" width="25" height="10" viewBox="-17 -8 33 13.500" aria-hidden="true"><path d="M0 -4C4 -4 7 -4.600 10 -6.200C12.500 -7.600 15.800 -6.600 15.200 -4.200C14.700 -2.200 12 -1 9.200 -.300C11 .400 12.600 1.600 12.300 3.200C12 4.800 9.800 4.900 7.500 4.600C5 4.300 2.500 4 0 4Z" fill="#c8bdae"/><path class="under" d="M0 4C2.500 4 5 4.300 7.500 4.600C9.800 4.900 12 4.800 12.300 3.200C11.400 3.600 9.600 3.400 7.500 3C5 2.500 2.500 2.200 0 2.200Z"/><path d="M9.200 -.300C11 -.800 13 -1.700 14.300 -3C13.500 -1 12.200 .100 11 .500Z" fill="#b0a596" opacity=".7"/><path d="M-3 -3.200q1.300 3.200 0 6.400M-8.500 -3.200q1.300 3.200 0 6.400M-15.500 -3.200q1.300 3.200 0 6.400" fill="none" stroke="#b0a596" stroke-width="1" stroke-linecap="round" opacity=".85"/></svg>';

// La friandise au bout de la trompe : une touffe d'herbe tendre, dessinée avec les brins et le vert de la savane de l'en-tête,
// posée sur un petit monticule de la couleur de son sol. Le brin du milieu, plus foncé, garde la touffe repérable (contraste 3,2).
const GRASS = '<svg class="grass" width="29" height="21" viewBox="-17 -22 34 25" aria-hidden="true"><ellipse class="mound" cx="0" cy="0" rx="14" ry="2.400"/><path d="M-3 0q-6-10-13-12q4 8 9 12zM3 0q6-10 13-12q-4 8-9 12zM-1 0q-1-13-7-18q0 10 3 18zM1 0q1-13 7-18q0 10-3 18z" fill="#aebb8c"/><path d="M-2 0q0-14 2-21q2 7 2 21z" fill="#7f9152"/></svg>';
const BLADE = '<svg class="blade" width="8" height="18" viewBox="-1 -19 9 20" aria-hidden="true"><path d="M0 0q1-13 7-18q0 10-3 18z" fill="#7f9152"/></svg>';
// Bouton des règles du jeu : la trompe en point d'interrogation, fuselée et plissée (contour calculé, voir les planches).
const TROMPE = '<svg width="25" height="26" viewBox="0 0 32 34" aria-hidden="true"><path d="M11.06 12.03L11.02 12.19L10.98 12.27L10.94 12.34L10.9 12.4L10.87 12.44L10.83 12.47L10.8 12.48L10.78 12.49L10.76 12.49L10.75 12.49L10.75 12.48L10.76 12.47L10.77 12.46L10.8 12.45L10.83 12.44L10.88 12.44L10.92 12.45L10.96 12.46L11 12.48L11.03 12.49L11.05 12.5L11.06 12.5L11.06 12.48L11.05 12.44L11.05 12.37L11.04 12.28L11.04 12.15L11.04 12L11.07 11.6L11.12 11.21L11.19 10.84L11.27 10.49L11.37 10.15L11.48 9.82L11.6 9.52L11.74 9.22L11.89 8.95L12.05 8.68L12.22 8.44L12.4 8.21L12.59 7.99L12.79 7.79L12.99 7.6L13.21 7.43L13.43 7.27L13.66 7.13L13.9 7L14.14 6.88L14.39 6.78L14.64 6.7L14.9 6.63L15.17 6.57L15.44 6.53L15.72 6.51L16.01 6.5L16.3 6.5L16.61 6.53L16.91 6.57L17.2 6.62L17.48 6.68L17.76 6.76L18.02 6.86L18.27 6.96L18.51 7.07L18.74 7.2L18.96 7.33L19.16 7.48L19.36 7.63L19.54 7.79L19.72 7.96L19.88 8.13L20.03 8.32L20.16 8.5L20.29 8.7L20.4 8.9L20.5 9.1L20.58 9.31L20.66 9.52L20.72 9.74L20.77 9.96L20.8 10.19L20.83 10.42L20.83 10.66L20.83 10.91L20.81 11.12L20.79 11.31L20.76 11.5L20.72 11.67L20.67 11.83L20.62 11.98L20.56 12.12L20.5 12.26L20.43 12.39L20.36 12.52L20.28 12.64L20.19 12.76L20.1 12.89L20 13.01L19.89 13.13L19.77 13.25L19.65 13.38L19.51 13.5L19.37 13.63L19.22 13.76L19.07 13.88L18.9 14.01L18.73 14.15L18.56 14.28L18.37 14.41L18.19 14.55L17.99 14.69L17.8 14.84L17.6 14.98L17.39 15.13L17.19 15.3L16.98 15.46L16.78 15.64L16.57 15.81L16.37 16L16.18 16.2L15.98 16.4L15.79 16.61L15.61 16.84L15.43 17.07L15.26 17.31L15.09 17.56L14.93 17.83L14.79 18.1L14.65 18.38L14.52 18.67L14.41 18.97L14.31 19.27L14.22 19.58L14.14 19.9L14.07 20.22L14.01 20.55L13.97 20.88L13.94 21.21L13.91 21.55L13.9 21.86L14.1 22.93L14.69 23.85L15.59 24.47L16.66 24.7L17.73 24.5L18.65 23.91L19.27 23.01L19.5 21.94L19.49 21.72L19.49 21.55L19.5 21.4L19.51 21.26L19.52 21.13L19.53 21.02L19.55 20.91L19.57 20.81L19.59 20.72L19.61 20.64L19.64 20.56L19.67 20.48L19.7 20.41L19.74 20.34L19.77 20.26L19.82 20.18L19.87 20.11L19.93 20.02L19.99 19.94L20.07 19.85L20.15 19.75L20.24 19.66L20.34 19.55L20.45 19.45L20.57 19.34L20.7 19.22L20.84 19.1L21 18.96L21.19 18.81L21.39 18.64L21.59 18.47L21.8 18.3L22.01 18.12L22.22 17.93L22.44 17.73L22.66 17.52L22.88 17.31L23.1 17.08L23.32 16.85L23.53 16.6L23.75 16.34L23.95 16.07L24.16 15.78L24.35 15.48L24.54 15.17L24.71 14.84L24.87 14.5L25.02 14.14L25.16 13.77L25.27 13.39L25.37 13L25.45 12.6L25.51 12.19L25.55 11.77L25.57 11.34L25.57 10.89L25.54 10.38L25.48 9.86L25.4 9.36L25.28 8.86L25.13 8.38L24.96 7.91L24.76 7.45L24.53 7.01L24.28 6.59L24.01 6.18L23.71 5.79L23.4 5.42L23.06 5.07L22.71 4.74L22.34 4.43L21.95 4.14L21.54 3.87L21.12 3.63L20.69 3.4L20.24 3.2L19.78 3.03L19.31 2.88L18.83 2.75L18.34 2.65L17.84 2.57L17.33 2.52L16.82 2.49L16.3 2.5L15.78 2.53L15.27 2.58L14.77 2.67L14.28 2.79L13.8 2.93L13.34 3.1L12.88 3.29L12.44 3.51L12.02 3.76L11.61 4.03L11.22 4.32L10.85 4.64L10.49 4.98L10.16 5.34L9.85 5.71L9.56 6.11L9.29 6.53L9.05 6.96L8.82 7.4L8.63 7.87L8.45 8.34L8.3 8.83L8.18 9.33L8.08 9.85L8.01 10.37L7.97 10.91L7.95 11.45L7.96 12L7.98 12.38L8.04 12.75L8.12 13.1L8.23 13.44L8.38 13.76L8.56 14.07L8.77 14.35L9.01 14.6L9.28 14.81L9.57 14.99L9.88 15.13L10.2 15.22L10.53 15.27L10.85 15.28L11.17 15.24L11.47 15.17L11.76 15.07L12.04 14.93L12.3 14.77L12.54 14.57L12.75 14.36L12.95 14.12L13.12 13.86L13.26 13.58L13.38 13.28L13.47 12.97L13.52 12.65L13.54 12.37L13.51 11.89L13.3 11.45L12.93 11.12L12.47 10.96L11.99 10.99L11.55 11.2L11.22 11.57z" fill="currentColor"/><path d="M19.36 7.63 L20.98 5.45M20.83 10.66 L23.78 10.48M19.22 13.76 L21.37 16.11" fill="none" class="plis" stroke-width=".9" stroke-linecap="round"/><circle cx="16.7" cy="29.6" r="2.6" fill="currentColor"/></svg>';
// Empreinte d'éléphant : elle ne sert qu'aux jours du plan et aux trois pas.
// Pictogrammes et personnages dessinés dans le même style que les éléphants : formes pleines, contours ronds, mêmes teintes.
const ic = body => `<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  sound: ic('<path d="M4 9.5v5h3.500l4.500 4v-13l-4.500 4z" fill="currentColor"/><path d="M15.500 9a4 4 0 0 1 0 6M18 6.500a7.500 7.500 0 0 1 0 11"/>'),
  mic: ic('<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/>'),
  play: ic('<path d="M8 5.500v13l10-6.500z" fill="currentColor"/>'),
  stop: ic('<rect x="6.500" y="6.500" width="11" height="11" rx="2" fill="currentColor"/>'),
  bell: ic('<path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15zM10 20.500a2 2 0 0 0 4 0"/>'),
  cal: ic('<rect x="4" y="5.500" width="16" height="14.500" rx="3"/><path d="M4 10h16M8.500 3.500v4M15.500 3.500v4"/>'),
  gear: ic('<circle cx="12" cy="12" r="3.200"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100"/>'),
  save: ic('<path d="M5 4h11l3 3v13H5z"/><path d="M8.500 4v5h6V4M8 20v-6h8v6"/>'),
  open: ic('<path d="M3.500 7.500a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2v7.500a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>'),
};
// La souris : elle court au rythme du record de l'étudiant.
const mouse = (size = 34) => `<svg class="mouse" width="${Math.round(size * 1.3)}" height="${size}" viewBox="0 0 52 40" aria-hidden="true">
  <path d="M10 31C2 31 0 23 5 18" fill="none" stroke="#b79f92" stroke-width="2.200" stroke-linecap="round"/>
  <path d="M17 35v3M30 35v3" stroke="#b0a596" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="24" cy="27" rx="15" ry="10" fill="#c8bdae"/><circle cx="38" cy="22" r="9.500" fill="#c8bdae"/>
  <circle cx="34" cy="11.500" r="6.500" fill="#d9cec1" stroke="#b0a596" stroke-width="1.200"/><circle cx="34" cy="11.500" r="3.200" fill="#f0c4b8"/>
  <circle cx="41" cy="27" r="2.400" fill="#f0a08c" opacity=".4"/><circle cx="47.500" cy="23.500" r="1.800" fill="#e58f7c"/>
  <circle cx="42" cy="20" r="2" fill="#2b2a33"/><circle cx="42.700" cy="19.300" r=".7" fill="#fff"/></svg>`;
// Le crocodile : l'adversaire du match amical. Souriant, jamais menaçant.
const croc = (size = 60) => `<svg class="croc" width="${Math.round(size * 1.7)}" height="${size}" viewBox="0 0 120 70" aria-hidden="true">
  <ellipse cx="56" cy="65" rx="40" ry="4" fill="#000" opacity=".08"/>
  <path d="M16 46C4 44 3 31 10 27" fill="none" stroke="#7fb98a" stroke-width="9" stroke-linecap="round"/>
  <rect x="30" y="50" width="11" height="14" rx="5" fill="#6fae7a"/><rect x="60" y="50" width="11" height="14" rx="5" fill="#6fae7a"/>
  <path d="M30 32l5-6 5 6M43 30l5-6 5 6M56 31l5-6 5 6" fill="#6fae7a"/>
  <ellipse cx="50" cy="44" rx="34" ry="15" fill="#8cc497"/><ellipse cx="50" cy="51" rx="25" ry="7" fill="#dcefd0"/>
  <rect x="68" y="31" width="46" height="20" rx="10" fill="#8cc497"/><circle cx="79" cy="29" r="8.500" fill="#8cc497"/>
  <path d="M84 44q14 7 27 0" fill="none" stroke="#4f8a5b" stroke-width="1.800" stroke-linecap="round"/>
  <path d="M91 47l2.200 3.200 2.200-2.600M100 48l2.200 3 2.200-3.200" fill="#fffaf0" stroke="#fffaf0" stroke-width=".6" stroke-linejoin="round"/>
  <circle cx="109" cy="36" r="1.100" fill="#4f8a5b"/><circle cx="90" cy="40" r="3" fill="#f0a08c" opacity=".4"/>
  <circle cx="81" cy="28" r="2.800" fill="#2b2a33"/><circle cx="82" cy="27" r="1" fill="#fff"/></svg>`;
// Le petit oiseau blanc qui accompagne les éléphants : il « souffle » le mot dans les exercices d'écoute.
const bird = (size = 26) => `<svg class="birdy" width="${Math.round(size * 1.2)}" height="${size}" viewBox="38 12 22 20" aria-hidden="true"><path d="M44 26v4M48 26v4" stroke="#6b6878" stroke-width="1"/><ellipse cx="46" cy="23" rx="5.500" ry="3.600" fill="#fff" stroke="#d8d2c8" stroke-width=".5"/><circle cx="51.500" cy="18.500" r="2.400" fill="#fff" stroke="#d8d2c8" stroke-width=".5"/><path d="M53.500 18l4.500 1-4.500 1z" fill="#f2a33a"/><circle cx="52" cy="18" r=".6" fill="#2b2a33"/></svg>`;
// Décor de l'accueil : un coin de savane, discret, derrière l'éléphanteau.
// Bandeau de savane : une bande d'herbe réservée tout en bas de l'en-tête. Rien ne passe derrière le titre, la phrase
// d'accroche, l'éléphanteau ni le bouton des règles : le texte se lit sur un fond uni.
const SAVANNA = `<svg class="savanna" viewBox="0 0 800 34" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="524" cy="20" r="13" fill="#f3cf7c" opacity=".7"/>
  <path d="M0 20q100-9 200-3t200-2t200 3t200-4v20H0z" fill="#dfe3bd"/>
  <g fill="#aebb8c"><path d="M60 26q1-13 7-18q0 10-3 18zM70 26q6-10 13-12q-4 8-9 12zM236 24q2-12 7-16q0 9-3 16zM246 24q5-9 12-10q-4 7-8 10zM392 25q1-13 7-18q0 10-3 18zM402 25q6-10 13-12q-4 8-9 12zM486 24q2-11 6-15q0 9-2 15zM700 25q1-13 7-18q0 10-3 18zM710 25q6-10 13-12q-4 8-9 12z"/></g></svg>`;
// Paire de défenses : la récompense d'un défi d'étape réussi.
const tusks = (size = 30, on = true) => `<svg class="tusks${on ? '' : ' off'}" width="${size}" height="${Math.round(size * 0.8)}" viewBox="0 0 40 32" aria-hidden="true"><path d="M12 3c-7 3-10 12-6 19 3 5 9 7 13 6-5-2-8-6-8-11 0-5 1-9 4-13z"/><path d="M28 3c7 3 10 12 6 19-3 5-9 7-13 6 5-2 8-6 8-11 0-5-1-9-4-13z"/></svg>`;
const PRINT = '<ellipse cx="13" cy="15" rx="9" ry="8.500" fill="currentColor"/><ellipse cx="5.500" cy="6.500" rx="2.300" ry="2.800" fill="currentColor"/><ellipse cx="10.500" cy="3.800" rx="2.300" ry="2.800" fill="currentColor"/><ellipse cx="15.800" cy="3.800" rx="2.300" ry="2.800" fill="currentColor"/><ellipse cx="20.700" cy="6.500" rx="2.300" ry="2.800" fill="currentColor"/>';
// Pictogramme d'allure : la même patte pour les trois pas, avec deux points (velours), deux traits (trotteuse), ou trois
// traits et une patte penchée (pressée). Jamais seul : le nom du pas est toujours écrit à côté.
const PAW36 = `<g transform="translate(12 1) scale(.923)">${PRINT}</g>`, DASH = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"';
const ALLURE = { slow: `${PAW36}<circle cx="7" cy="20" r="1.6" fill="currentColor"/><circle cx="2.5" cy="16.5" r="1.2" fill="currentColor"/>`,
  mid: `${PAW36}<path d="M3 11h6M1 17h8" ${DASH}/>`, fast: `<g transform="rotate(16 24 13)">${PAW36}</g><path d="M2 7h8M0 13h10M3 19h7" ${DASH}/>` };
const allure = pace => `<svg class="allure" width="30" height="22" viewBox="0 0 36 26" aria-hidden="true">${ALLURE[pace] || ALLURE.mid}</svg>`;
// Piste d'empreintes : l'icône d'un pas du plan personnel. La même patte pour les trois pas, une empreinte par jour du
// plan : l'icône montre la vraie différence entre les pas (le nombre de jours), jamais une taille ni un rang.
// done : jours déjà passés, dessinés en plein ; au-delà de douze empreintes, le reste est écrit en chiffres.
const trail = (days, done = -1) => `<span class="trail" aria-hidden="true">${Array.from({ length: Math.min(days, 12) }, (_, i) => `<svg class="paw${done >= 0 && i >= done ? ' todo' : ''}" width="16" height="16" viewBox="0 0 26 26">${PRINT}</svg>`).join('')}${days > 12 ? `<span class="trailmore">+${days - 12}</span>` : ''}</span>`;
// Barre de progression : la trompe de l'éléphanteau s'allonge vers la touffe d'herbe. L'herbe frémit quand la trompe approche
// (classe near) et n'est plus là quand tout est fait (classe eaten).
const trunkBar = (pct, cls, label) => `<div class="trunk${pct >= 100 ? ' eaten' : pct >= 70 ? ' near' : ''}" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">${head(cls)}<div class="track"><span style="width:calc((100% - 12px) * ${pct / 100})">${TIP}</span></div>${GRASS}</div>`;
// Barre de séance : pas de zone claire. Le chemin qui reste est planté de touffes d'herbe (autant que de mots nouveaux du jour,
// une seule pour une séance de révisions, douze au plus), que la trompe avale en avançant ; la dernière est mangée à la fin.
const mealBar = (pct, cls, label, n) => {
  const k = Math.max(1, Math.min(n || 0, 12));
  const plants = Array.from({ length: k }, (_, i) => pct >= (i + 1 === k ? 100 : (i + 0.7) / k * 100) ? '' : GRASS.replace('class="grass"', `class="grass" style="left:${((i + 1) / k * 100).toFixed(1)}%"`)).join('');
  return `<div class="trunk meal${k > 8 ? ' many' : k > 5 ? ' some' : ''}" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">${calf(cls)}<div class="track"><span style="width:calc((100% - 12px) * ${pct / 100})">${TIP}</span>${plants}</div></div>`;
};

// ---------- Sons ----------

let voices = [], audioCtx = null;
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch { voices = []; } };
try { loadVoices(); speechSynthesis.addEventListener('voiceschanged', () => { loadVoices(); if (S.view === 'home' && !S.session && !S.locked) render(); /* porte fermée : pas de redessin, la saisie du code serait effacée */ }); } catch { /* pas de synthèse vocale */ }

// Choix de la voix : la langue du paquet d'abord (variante attendue, sinon une autre variante de la même langue),
// puis les voix de bonne qualité ; les voix fantaisie de certains systèmes sont écartées.
const ODD = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|junior|ralph|fred|eddy|flo\b|grandma|grandpa|reed|rocko|sandy|shelley/i;
const FINE = /natural|neural|enhanced|premium|siri/i;
const vlang = v => (v.lang || '').replace('_', '-').toLowerCase();
// Les voix installées sur l'appareil passent avant les voix « en ligne » du navigateur, qui restent parfois muettes.
function voicesFor(lang) {
  const code = (VOICES[lang] || lang).toLowerCase();
  const score = v => (vlang(v) === code ? 8 : 0) + (v.localService ? 3 : 0) + (FINE.test(v.name) ? 2 : 0) + (v.default ? 1 : 0) - (ODD.test(v.name) ? 6 : 0);
  // Confidentialité : l'application ne choisit jamais une voix « en ligne », qui enverrait le mot lu à un service extérieur.
  return voices.filter(v => v.localService !== false && (vlang(v) === code || vlang(v).startsWith(lang + '-') || vlang(v) === lang)).sort((a, b) => score(b) - score(a));
}
const voiceFor = lang => voicesFor(lang)[0] || null;

// Messages brefs : affichés dans leur propre zone, sans redessiner l'écran, pour ne jamais effacer une réponse en cours d'écriture.
const toastBox = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toasts' }));
function toast(text) { S.toast = text; toastBox.innerHTML = `<p class="toast" role="alert">${esc(text)}</p>`; setTimeout(() => { if (S.toast === text) { S.toast = null; toastBox.innerHTML = ''; } }, 5000); }

// Dit un texte dans la langue du paquet. Si la première voix ne démarre pas, on essaie la suivante, puis la voix
// par défaut de l'appareil : l'échec n'est annoncé qu'après ces essais.
function sayText(text, lang, { auto = false, rate = 0.9, onend = null } = {}) {
  const fail = () => { if (!auto) toast(t(voices.length && !voiceFor(lang) ? 'noVoice' : 'ttsSilent', LANG_NAMES[lang] || lang)); onend?.(); };
  try {
    if (!voices.length) loadVoices();
    const code = VOICES[lang] || lang, list = [...voicesFor(lang).slice(0, 2), null];
    let k = 0, settled = false;
    const attempt = () => {
      const v = list[k++], u = new SpeechSynthesisUtterance(text); let started = false;
      if (v) u.voice = v;
      u.lang = v?.lang?.replace('_', '-') || code; u.rate = rate;
      const next = () => {
        if (started || settled) return;
        if (k < list.length) { try { speechSynthesis.cancel(); } catch { /* rien à annuler */ } setTimeout(attempt, 80); } else { settled = true; fail(); }
      };
      u.onstart = () => { started = true; };
      u.onend = () => { if (started && !settled) { settled = true; onend?.(); } };
      u.onerror = e => { if (e.error === 'interrupted' || e.error === 'canceled') { if (started && !settled) { settled = true; onend?.(); } return; } next(); };
      setTimeout(next, 1800);                                  // certaines voix, ou certains cadres, restent muets sans le dire
      speechSynthesis.resume?.();
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(attempt, 80); }   // Chrome reste muet si « speak » suit « cancel » sans délai
    else attempt();                                            // sans délai : iOS n'accepte la voix que dans le geste de l'utilisateur
  } catch { fail(); }
}
// Lit le mot : fichier audio de la fiche s'il existe, sinon voix de l'appareil dans la langue du paquet.
function speak(card, lang, opts = {}) {
  // opts.say : une seule forme d'une fiche qui en a deux (« une serveuse ») ; le fichier audio de la fiche dit les deux.
  const tts = () => sayText(spoken(opts.say || card.word), lang, opts);
  if (card.audio && !opts.say) { try { new Audio(card.audio).play().catch(tts); } catch { tts(); } } else tts();
}
// Enregistrement de la voix de l'étudiant, pour qu'il se réécoute à côté du modèle. Rien n'est envoyé ni conservé :
// l'enregistrement vit dans la page et disparaît à l'étape suivante.
let rec = null, recBusy = false, recStream = null, recTimer = null;
const stopMic = () => { clearTimeout(recTimer); try { recStream?.getTracks().forEach(tr => tr.stop()); } catch { /* déjà arrêté */ } recStream = null; };
async function recStart() {
  if (rec || recBusy) return;                              // un double appui n'ouvre pas deux fois le micro
  recBusy = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), step = S.step;
    recStream = stream;
    if (!S.session || S.step !== step || S.view !== 'session') return stopMic();
    const r = new MediaRecorder(stream), chunks = [];
    r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      stopMic(); rec = null;
      if (S.step !== step || !S.session) return;
      S.local = { ...(S.local || {}), recording: false, phase: 1, rec: URL.createObjectURL(new Blob(chunks, { type: r.mimeType || 'audio/webm' })) };
      S.spoke = S.step; render(); sayText(S.step.activity.model, S.session.deck.lang, { auto: true });      // le modèle : la phrase entière
    };
    r.start(); rec = r; recTimer = setTimeout(() => { try { r.stop(); } catch { /* déjà arrêté */ } }, 30000);   // jamais plus de trente secondes
    S.local = { ...(S.local || {}), recording: true }; render();
  } catch { stopMic(); S.local = { ...(S.local || {}), noMic: true }; toast(t('micRefused')); }
  finally { recBusy = false; }
}
window.addEventListener('pagehide', () => { try { rec?.stop(); } catch { /* déjà arrêté */ } stopMic(); });
function dropRecording() { const r = rec; rec = null; try { r?.stop(); } catch { /* déjà arrêté */ } stopMic(); if (S.local?.rec) URL.revokeObjectURL(S.local.rec); }
// « Je ne peux pas écouter maintenant » : la session continue sans exercice d'écoute ni d'oral.
function cantListen() {
  const s = S.session, card = S.step.card; S.quiet = true; s.audio = false; dropRecording(); S.local = null;
  if (s.tour || s.challenge) return advance();
  S.step.activity = buildActivity(s.deck, card, boxOf(s.progress[card.id]) || 1, Math.random, { prefer: s.today, gate: true });
  toast(t('quietOn')); render();
}
// Ce que l'étudiant a commencé à écrire est gardé quand l'écran se redessine.
function keepInputs() { for (const el of app.querySelectorAll('[data-keep]')) S.local = { ...(S.local || {}), [el.dataset.keep]: el.value }; }
// L'appareil sait-il lire les mots de ce paquet ? (voix de la langue, ou un son joint à chaque fiche)
const canListen = deck => !S.quiet && (deck.cards.every(c => c.audio) || ('speechSynthesis' in window && !(voices.length && !voiceFor(deck.lang))));

// Chaque mot s'entend sans rien demander : à sa découverte, puis après chaque réponse (réglage « Prononciation automatique »).
function autoSpeak() { const c = S.step?.card; if (!S.voice || !c || !S.session || S.spoke === S.step || S.step.activity?.multi) return; S.spoke = S.step; speak(c, S.session.deck.lang, { auto: true }); }

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
  if (GATED && (await store.get('access')) === ACCESS) S.locked = false;      // cet appareil a déjà saisi le code en vigueur
  const set = (await store.get('settings')) || {};
  const sb = TEACHER ? await store.get('essai') : null;      // l'interface étudiant ignore toujours le mode essai
  S.sandbox = !!(sb && typeof sb === 'object' && sb.on === true); S.sbDays = S.sandbox && typeof sb.days === 'number' && Number.isFinite(sb.days) ? Math.max(0, Math.min(36500, sb.days)) : 0;
  S.measure = cleanMeasure(await store.get(mkey()));      // vitesse et réussite mesurées sur cet appareil (plan personnel)
  Object.assign(S, { lang: set.lang || 'auto', minutes: set.minutes || 5, maxNew: set.maxNew || 3, help: set.help || 'fr', sound: set.sound ?? true, voice: set.voice ?? true, remind: { time: '18:00', days: 'daily', ...(set.remind || {}) }, savedAt: set.savedAt || 0 });
  const saved = (await store.get('decks')) || [];
  // Un paquet abîmé dans le stockage ne doit pas empêcher les autres de s'ouvrir : il est laissé de côté.
  S.decks = (Array.isArray(saved) ? saved : []).flatMap(d => { try { return d && typeof d === 'object' ? [prepare(d)] : []; } catch (e) { console.error(e); return []; } });
  if (!S.decks.length) { S.decks = [demoDeck()]; await saveDecks(); }
  // Démonstration d'une ancienne version (aucune image, autre nombre de fiches) : remplacée par l'actuelle. Les mots
  // communs gardent leur progression ; un paquet de démonstration que l'enseignant a illustré, renommé ou modifié n'est pas touché.
  else {
    // Garde-fou (relecture de sécurité, 15a) : toutes les anciennes démonstrations n'avaient que des mots de l'actuelle. Un paquet où
    // un seul mot a été réécrit est donc un travail de l'enseignant, et il n'est jamais remplacé.
    const fresh = demoDeck(), words = new Set(fresh.cards.map(c => c.word));
    const i = S.decks.findIndex(d => d.demo === true && d.id === fresh.id && Array.isArray(d.cards) && !d.cards.some(c => c.image) && d.cards.length !== fresh.cards.length && d.cards.every(c => words.has(c?.word)));
    if (i >= 0) {
      // L'identifiant d'une fiche dépend de sa définition : la progression est reportée mot par mot, dans les deux rangements.
      const old = S.decks[i].cards, byWord = new Map(fresh.cards.map(c => [c.word, c.id]));
      for (const key of ['progress:', 'essai:']) {
        const P = cleanProgress(await store.get(key + fresh.id)); let moved = false;
        for (const c of Array.isArray(old) ? old : []) { const from = String(c?.id ?? ''), to = byWord.get(c?.word); if (to && to !== from && !from.startsWith('_') && Object.hasOwn(P, from) && !Object.hasOwn(P, to)) { P[to] = P[from]; delete P[from]; moved = true; } }
        if (moved) await store.set(key + fresh.id, P);
      }
      S.decks[i] = fresh; await saveDecks();
    }
  }
  for (const d of S.decks) S.progress[d.id] = cleanProgress(await store.get(pkey(d.id)));     // état reconstruit champ par champ : rien de forgé n'atteint l'écran
  // Lien de partage : « …/?paquet=logement-a2 » ouvre le fichier paquets/logement-a2.json rangé à côté de l'application
  // L'étudiant n'a rien d'autre à faire que d'ouvrir le lien. Seul le dossier paquets/ du site est lu, en JSON strict.
  const ref = new URLSearchParams(location.search).get('paquet');
  if (ref) {
    try {
      const plain = ref.replace(/\.json$/i, '').replace(/[^\w.-]/g, '');
      let res = await fetch(`paquets/${plain}.json`);                 // seulement le dossier du site : un lien ne peut pas charger un paquet venu d'ailleurs
      if (!res.ok && slug(ref.replace(/\.json$/i, '')) !== plain) res = await fetch(`paquets/${slug(ref.replace(/\.json$/i, ''))}.json`);   // lien tapé avec des accents ou des majuscules
      if (!res.ok) throw new Error('link');
      const deck = deckFromJSON(JSON.stringify(await res.json()));      // JSON strict : un fichier qui serait aussi lisible comme un script est refusé
      S.progress[deck.id] ??= cleanProgress(await store.get(pkey(deck.id)));      // la progression d'abord : un redessin entre les deux ne doit jamais trouver un paquet sans elle
      keepDoubts(deck);
      S.decks = [...S.decks.filter(d => d.id !== deck.id && !(pristineDemo(d) && !S.sandbox && !Object.keys(S.progress[d.id] || {}).filter(k => !k.startsWith('_')).length)), deck];
      await saveDecks(); S.notice = { text: t('opened', deck.name) };
    } catch { S.notice = { bad: true, text: t('errLink') }; }
  }
  if (TEACHER && location.hash !== '#accueil') S.view = 'teacher';
}
// Démonstration intacte : exactement les fiches livrées avec l'application. Seule celle-là peut être retirée d'office
// quand un autre paquet arrive ; une démonstration que l'enseignant a illustrée, classée ou modifiée est son travail.
let demoCards = null;
const pristineDemo = d => { if (!d?.demo) return false; try { demoCards ??= JSON.stringify(serialize(demoDeck()).cards); return JSON.stringify(serialize(d).cards) === demoCards; } catch { return false; } };
// Un paquet réimporté remplace le paquet de même identifiant. Les doutes notés par l'enseignant ne sont pas dans le
// fichier exporté : ils sont repris de l'ancienne fiche de même identifiant, pour ne pas disparaître en silence.
function keepDoubts(deck) {
  const old = S.decks.find(d => d.id === deck.id); if (!old?.byId) return;
  for (const c of deck.cards) if (!c.doubt && Object.hasOwn(old.byId, c.id) && typeof old.byId[c.id].doubt === 'string') c.doubt = old.byId[c.id].doubt;
}
const saveDecks = () => store.set('decks', S.decks.map(serialize));
const saveSettings = () => store.set('settings', { lang: S.lang, minutes: S.minutes, maxNew: S.maxNew, help: S.help, sound: S.sound, voice: S.voice, remind: S.remind, savedAt: S.savedAt });
// Mode essai (espace enseignant seulement) : la progression d'essai est rangée sous une autre clé que la vraie.
// Tant qu'il est actif, rien de ce que fait l'application ne lit ni n'écrit la vraie progression.
const pkey = id => (S.sandbox ? 'essai:' : 'progress:') + id;
const saveProgress = id => store.set(pkey(id), S.progress[id]);
const saveSandbox = () => store.set('essai', { on: S.sandbox, days: S.sbDays });
// Mesure locale du plan personnel (durée d'une étape, part de premières réponses justes). Comme la progression, celle du
// mode essai est rangée à part : un enseignant qui teste ne fausse pas sa propre mesure.
const mkey = () => (S.sandbox ? 'mesure-essai' : 'mesure');
const saveMeasure = () => store.set(mkey(), S.measure);
// Un seul changement à la fois : pendant un basculement, un saut dans le temps ou une remise à zéro, aucun autre geste
// n'est accepté (sbBusy). Sans ce verrou, deux gestes rapprochés pourraient écrire des essais sous la clé de la vraie progression.
let sbBusy = false;
// Progression d'un paquet qui arrive (import) : lue sous la clé du mode en cours, et seulement si le mode n'a pas changé pendant la lecture.
async function ensureProgress(id) {
  for (let i = 0; i < 50; i++) {
    while (sbBusy) await new Promise(r => setTimeout(r, 20));
    const mode = S.sandbox, P = cleanProgress(await store.get(pkey(id)));
    if (mode === S.sandbox && !sbBusy) { S.progress[id] ??= P; return; }
  }
  S.progress[id] ??= {};
}
async function setSandbox(on) {
  if (!TEACHER || S.locked || sbBusy || S.sandbox === !!on) return;
  sbBusy = true;
  try {
    stopRace(); dropRecording();
    if (S.session && !S.session.challenge) await saveProgress(S.session.deck.id);      // sous la clé du mode que l'on quitte
    await saveMeasure();                                                              // la mesure aussi, avant de changer de clé
    S.session = null;
    const P = {}, M = cleanMeasure(await store.get(on ? 'mesure-essai' : 'mesure'));
    for (const d of S.decks) P[d.id] = cleanProgress(await store.get((on ? 'essai:' : 'progress:') + d.id));
    // Le drapeau et la progression changent ensemble, sans attente entre les deux : pkey() ne voit jamais un état mixte.
    Object.assign(S, { sandbox: !!on, progress: P, measure: M, pendingBackup: null, confirmReset: null, confirmSb: false, notice: null, view: on ? 'home' : 'teacher' });
    // Un paquet importé pendant le basculement n'était pas dans la boucle : sa progression est lue maintenant.
    for (let again = true; again;) { again = false; for (const d of S.decks) if (!S.progress[d.id]) { S.progress[d.id] = cleanProgress(await store.get(pkey(d.id))); again = true; } }
    await saveSandbox();
  } finally { sbBusy = false; }
  window.scrollTo?.(0, 0); render();
}
// Avancer le temps : days = 1 ou 7 ; days = 0 : jusqu'à la prochaine révision, tous paquets confondus (un jour si rien n'attend).
async function sandboxSkip(days) {
  if (!TEACHER || !S.sandbox || sbBusy || ![0, 1, 7].includes(days)) return;
  if (S.sbDays >= 36500) return;      // cent ans d'avance : au-delà, les dates n'auraient plus de sens
  const DAY = 86400000, now = Date.now();
  let ms = days * DAY;
  sbBusy = true;
  try {
  if (!days) { const waits = S.decks.map(d => nextDueIn(S.progress[d.id], now)).filter(x => x > 0); ms = waits.length ? Math.min(...waits) + 60000 : DAY; }
  if (S.session && !S.session.challenge) S.session = null;
  for (const d of S.decks) { S.progress[d.id] = cleanProgress(shiftProgress(S.progress[d.id], ms)); await store.set('essai:' + d.id, S.progress[d.id]); }      // clé d'essai écrite en dur : jamais la vraie
  S.sbDays = Math.min(36500, Math.round((S.sbDays + ms / DAY) * 10) / 10); await saveSandbox();
  } finally { sbBusy = false; }
  S.confirmSb = false; S.notice = { text: t('sbSkipped', String(Math.round(ms / DAY * 10) / 10).replace('.', uiLang() === 'en' ? '.' : ',')) }; S.view = 'home'; render();
}
async function sandboxReset() {
  if (!TEACHER || !S.sandbox || sbBusy) return;
  sbBusy = true;
  try {
    S.session = null;
    for (const d of S.decks) { S.progress[d.id] = {}; await store.set('essai:' + d.id, {}); }      // clé d'essai écrite en dur : jamais la vraie
    S.sbDays = 0; S.confirmSb = false; await saveSandbox();
    S.measure = emptyMeasure(); await store.set('mesure-essai', S.measure);      // clé d'essai écrite en dur, comme la progression
  } finally { sbBusy = false; }
  S.notice = { text: t('sbResetDone') }; S.view = 'home'; render();
}
// Bandeau du mode essai : toujours visible, pour qu'on ne confonde jamais un essai avec la vraie progression.
function sandboxBar(full) {
  if (!full) return `<p class="sandbox mini" role="status"><b>${t('sbOn')}</b> <button type="button" class="link" data-action="sb-off">${t('sbQuit')}</button></p>`;
  return `<section class="sandbox" aria-label="${t('sbOn')}"><p><b>${t('sbOn')}</b> ${t('sbExplain')}${S.sbDays ? ` <span class="meta">${t('sbDays', esc(String(S.sbDays)).replace('.', uiLang() === 'en' ? '.' : ','))}</span>` : ''}</p>
    <p class="sblabel" id="sbskip">${t('sbSkip')}</p>
    <div class="row" role="group" aria-labelledby="sbskip"><button type="button" class="secondary small" data-action="sb-skip" data-days="0">${t('sbNext')}</button>
      <button type="button" class="secondary small" data-action="sb-skip" data-days="1">${t('sbDay')}</button>
      <button type="button" class="secondary small" data-action="sb-skip" data-days="7">${t('sbWeek')}</button></div>
    <div class="row">${S.confirmSb ? `<button type="button" class="link danger" data-action="sb-reset-yes">${t('sbResetSure')}</button>` : `<button type="button" class="link" data-action="sb-reset">${t('sbReset')}</button>`}
      <button type="button" class="link" data-action="sb-off">${t('sbQuit')}</button></div></section>`;
}

// Langue des traductions affichées pour un paquet, selon le réglage de l'étudiant et ce que le paquet contient.
function helpFor(deck) {
  if (S.help === 'none') return null;
  return deck.helpLangs.includes(S.help) ? S.help : deck.helpLangs.includes('*') ? '*' : null;
}

// ---------- Accueil ----------

// Le troupeau : un éléphanteau naît à chaque mot découvert et grandit de la boîte 1 à la boîte 5.
// La prairie montre les éléphants de l'étape en cours : dix au plus, assez grands pour qu'on voie leur âge.
function prairie(d, s, hop = [], sleeping = false, link = false) {
  const [from, to] = s.stage.bounds[s.stage.index - 1], ids = new Set(d.cards.slice(from, to).map(c => c.id));
  const sizes = link ? [0, 36, 40, 45, 50, 55] : [0, 46, 52, 58, 64, 70], mine = s.animals.filter(a => ids.has(a.id));
  const herd = mine.map(a => `<span class="ele${hop.includes(a.id) ? ' hop' : ''}">${mascot(sizes[a.box], sleeping ? 'sleep' : 'idle', a.box)}</span>`).join('');
  const inside = herd || `<span class="hintline">${t('emptyStage')}</span>`;
  if (link) return `<button type="button" class="prairie" data-action="herd" data-id="${d.id}" aria-label="${esc(t('herdBtn', s.animals.length) + '. ' + t('stageAria', s.stage.index, s.stage.count, s.stage.seen, s.stage.size))}">${inside}</button>`;
  return `<div class="prairie" role="img" aria-label="${esc(t('stageAria', s.stage.index, s.stage.count, s.stage.seen, s.stage.size))}">${inside}</div>`;
}

// Défi d'étape : proposé quand tous les mots d'une étape ont été découverts un jour précédent.
// C'est une révision espacée : le jour même de la découverte, il serait trop facile pour servir la mémoire.
// Où en est le défi : ouvert, ou ce qu'il manque pour l'ouvrir. Le but reste toujours visible.
function challengeLine(d, P, part = '') {
  const st = stageOf(d, P), done = P._stages || {}, won = Object.keys(done).length, open = pendingStage(d, P);
  const next = Array.from({ length: st.count }, (_, i) => i + 1).find(i => !done[i]);
  let line = '';
  if (open) line = `<button class="secondary challenge" data-action="challenge" data-id="${d.id}" data-stage="${open}">${tusks(26)}<span>${t('challengeBtn', open)}</span></button>`;
  else if (next) {
    const [a, b] = st.bounds[next - 1], left = d.cards.slice(a, b).filter(c => isNew(P[c.id])).length;
    line = `<p class="chlock" title="${esc(left ? t('chLockedNew', next, left) : t('chLockedNight', next))}">${tusks(22, false)}<span>${left ? tn('chShortNew', left) : t('chShortNight')}</span></p>`;
  }
  if (part === 'lock') return open ? '' : line;
  return `${part === 'rest' && !open ? '' : line}${won ? `<p class="tuskrow" aria-label="${t('tusksLine', won, st.count)}">${Array.from({ length: Math.min(won, 12) }, () => tusks(20)).join('')}<span>${t('tusksLine', won, st.count)}</span></p>` : ''}`;
}
// Le grand rendez-vous du paquet : un match amical contre les crocodiles, sur les mots de toutes les étapes.
// Il s'ouvre quand toutes les défenses sont gagnées ; le but lointain reste visible dès la première paire.
function matchLine(d, P) {
  const st = stageOf(d, P), won = Object.keys(P._stages || {}).length;
  if (!won) return '';
  if (won < st.count) return `<p class="chlock">${croc(20)}<span>${t('fmLocked', won, st.count)}</span></p>`;
  return `<button class="secondary challenge" data-action="friendly" data-id="${d.id}">${croc(22)}<span>${t('fmBtn')}${P._match?.best ? ` <span class="meta">${t('raceBest', +P._match.best || 0)}</span>` : ''}</span></button>`;
}
function startFriendly(id) {
  const deck = S.decks.find(d => d.id === id), P = S.progress[id]; deck.help = helpFor(deck);
  const pool = deck.cards.filter(c => !isNew(P[c.id])).map(c => [Math.random(), c]).sort((a, b) => a[0] - b[0]).slice(0, 12).map(x => x[1]);
  S.session = new Challenge(deck, P, pool); S.session.friendly = true;
  S.chStage = 0; S.view = 'session'; S.notice = null; S.stepAt = 0; advance();
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

// ---------- Plan personnel ----------
// Premier temps (version 15b) : le plan vaut pour les paquets auxquels l'enseignant a conseillé un nombre de jours.
// Les autres paquets gardent le frein, et les trois pattes y règlent le nombre de mots nouveaux par séance (3, 5 ou 8),
// jusqu'à l'extension du plan à toutes les listes. Ce réglage est rangé par paquet, sous « _new » dans sa progression :
// un pas posé sur une carte ne vaut que pour elle. L'ancien réglage commun (« Appétit du jour ») sert de valeur de départ.
const planned = d => !!d?.days;
const NEW_BY_PACE = { slow: 3, mid: 5, fast: 8 };
const newFor = id => { const n = Object.hasOwn(S.progress, id) ? S.progress[id]?._new?.n : 0; return [3, 5, 8].includes(n) ? n : [3, 5, 8].includes(S.maxNew) ? S.maxNew : 3; };
// Étapes d'un mot nouveau : 3 avec l'écran de découverte ; 1 quand les mots ont été vus en classe ; 2 au niveau A1, où
// l'étudiant choisit le mot avant de l'écrire.
const perNew = d => (d.seen === true ? (d.level === 'A1' ? 2 : 1) : 3);
// Une autre liste qui attend aujourd'hui (la plus chargée) : proposée quand le paquet en cours est fini pour la journée.
function nextList(id) {
  let best = null; const now = Date.now();
  for (const o of S.decks) {
    const P = S.progress[o.id]; if (o.id === id || !P) continue;
    let n = 0;
    if (planned(o)) { const T = P._plan ? ensureDay(o) : null; n = T && !T.complete ? T.revLeft + T.freshLeft : 0; } else n = o.cards.filter(c => isDue(P[c.id], now)).length;
    if (n > (best?.n || 0)) best = { deck: o, n };
  }
  return best;
}
// Arrête le programme du jour à la première visite de la journée, puis le relit : il ne bouge plus si l'étudiant
// travaille en deux fois.
function ensureDay(d) {
  const P = S.progress[d.id], plan = P?._plan; if (!planned(d) || !plan) return null;
  const T = planToday(d, P, plan);
  if (plan.day !== T.d) { Object.assign(plan, T.snap); saveProgress(d.id); }
  return T;
}
// Les trois pas d'un paquet : durée totale, jours qui restent, minutes par jour. Au premier choix, le calcul porte sur
// tous les mots ; ensuite, sur ce qu'il reste, à partir de la vraie progression.
// Version 15c : au premier choix, le calcul part de la progression réelle. Les mots prouvés « déjà sus » au test de
// positionnement ne sont donc plus des mots à découvrir : le plan se calcule sur les mots restants.
function planOption(d, P, pace, total, now = Date.now()) {
  const plan = P._plan || null, R = ratesFor(d), dNow = plan ? Math.max(0, dayIndex(plan.start, now)) : 0;
  const sim = outlook(d, P, plan || startPlan(pace, total, now), now, { ok: R.ok, perNew: perNew(d), days: total, mark: plan ? 0 : pace === OWN ? total : d.days });
  return { pace, total, left: plan ? Math.max(1, total - dNow) : total, min: minutes(sim.avg, R.sec), peak: minutes(sim.max, R.sec), seen: sim.seen, again: sim.again };
}
const planOptions = (d, P, now = Date.now()) => paceDays(d.days).map(([pace, total]) => planOption(d, P, pace, total, now));
// Vitesse de départ, tant que rien n'est mesuré sur l'appareil : écrire un mot prend plus de temps que le choisir. Vingt
// secondes par étape pour un paquet « mots déjà vus en classe » (première question écrite), quinze sinon. Choix de
// conception (aucune étude ne fixe ce chiffre) ; la mesure de l'appareil le remplace dès dix étapes.
const startSec = d => (d?.seen === true ? 20 : 15);
const ratesFor = d => { const R = rates(S.measure); return R.timed ? R : { ...R, sec: startSec(d) }; };
// Révisions que les autres paquets demanderont pendant ce plan, en minutes par jour : elles se font depuis leur carte.
function otherReviews(d, now = Date.now()) {
  const R = rates(S.measure), until = now + d.days * DAY; let n = 0;
  for (const o of S.decks) if (o.id !== d.id) for (const c of o.cards) { const st = S.progress[o.id]?.[c.id]; if (!isNew(st) && (!st.fsrs || st.fsrs.due <= until)) n++; }
  const m = n * (2 - R.ok) / d.days * R.sec / 60;
  return m >= 1 ? Math.round(m) : 0;
}
function openPlan(id, own = false) {
  const deck = S.decks.find(d => d.id === id && planned(d)); if (!deck || !S.progress[id]) return;
  S.planId = id; S.view = 'plan'; S.notice = null; S.ownDays = own ? Math.min(deck.days, 3) : 0; S.session = null;
  S.planOpts = { id, list: planOptions(deck, S.progress[id]) };      // les trois pas sont calculés une fois par ouverture de l'écran, pas à chaque geste
  window.scrollTo?.(0, 0); render();
}
// days : jours choisis par l'étudiant pour le pas « own » (« J'ai moins de jours »), comptés à partir d'aujourd'hui.
function choosePace(id, pace, days = 0, quiet = false) {
  const d = S.decks.find(x => x.id === id), P = S.progress[id]; if (!d || !planned(d) || !P || !(PACES.includes(pace) || pace === OWN)) return;
  const now = Date.now(), plan = P._plan, dNow = plan ? Math.max(0, dayIndex(plan.start, now)) : 0;
  const n = Math.round(Math.min(d.days, Math.max(0, +days || 0)));
  const o = pace === OWN ? (n >= 1 ? planOption(d, P, OWN, dNow + n, now) : null) : (one => one ? planOption(d, P, pace, one[1], now) : null)(paceDays(d.days).find(([x]) => x === pace)); if (!o) return;
  S.planOpts = null; S.ownDays = 0;
  if (!plan) { P._plan = startPlan(pace, o.total, now, o.min); saveProgress(id); return startSession(id); }      // premier choix : la première journée commence
  // Changement de pas : le premier jour ne bouge pas, la durée devient celle du nouveau pas. Le programme du jour est
  // refait, sauf si la journée est déjà faite : elle le reste, et le nouveau pas vaut à partir de demain.
  const T = ensureDay(d);
  Object.assign(plan, { pace, days: Math.min(PLAN_DAYS.long, o.total), est: o.min, ack: missedNow(plan, dNow) }); if (!T?.complete) plan.day = -1;
  if (o.total - 1 > dNow) plan.recap = -1;      // la fin du plan recule : la reprise générale aura lieu à la nouvelle fin
  saveProgress(id); S.view = 'home';
  // Depuis la carte (quiet) : aucune annonce de minutes. Un ancien message sur le plan serait faux et s'efface ; une alerte (import, fiches à compléter) reste.
  if (!quiet) { S.notice = { text: t('plNow', o.left, o.min) }; window.scrollTo?.(0, 0); } else if (S.notice && !S.notice.bad && !S.notice.sort) S.notice = null;
  render();
}

// ---------- « Déjà su » : test de positionnement avant le premier choix du pas (version 15c) ----------
// L'étudiant coche les mots qu'il pense déjà savoir écrire ; chacun reçoit aussitôt une question écrite (Placement).
// Rien n'est obligatoire : il peut passer, et le plan se calcule alors sur tous les mots.
function openPlace(id) {
  const d = S.decks.find(x => x.id === id), P = S.progress[id]; if (!d || !planned(d) || !P) return;
  if (P._plan || !d.cards.some(c => isNew(P[c.id]))) return openPlan(id);
  S.placeId = id; S.placePick = new Set(); S.view = 'place'; S.notice = null; S.session = null; window.scrollTo?.(0, 0); render();
}
const placeGo = n => `${n ? `<button class="primary" data-action="place-go">${t('plcGo', n)}</button>` : ''}<button class="${n ? 'secondary' : 'primary'}" data-action="place-skip">${t(n ? 'plcSkipSome' : 'plcSkip')}</button>`;
function placeView() {
  const d = S.decks.find(x => x.id === S.placeId), P = S.progress[d.id], fresh = d.cards.filter(c => isNew(P[c.id])), pick = S.placePick || new Set();
  return `<button class="link" data-action="home">← ${t('back')}</button>
    <div class="titlerow hasinfo"><h1>${t('plcTitle')}</h1>${infoNote(t('plcWhy'), t('plcTitle'))}</div><p class="lead" lang="${d.lang}">${esc(d.name)}</p>
    <p class="planlead">${t('plcLead')}</p>
    <ul class="placelist" aria-label="${esc(t('plcListAria', fresh.length))}">${fresh.map(c => `<li><button type="button" class="pick" data-action="place-pick" data-card="${esc(c.id)}" aria-pressed="${pick.has(c.id)}" lang="${d.lang}">${esc(c.word)}</button></li>`).join('')}</ul>
    <div class="stack placego" aria-live="polite">${placeGo(pick.size)}</div>`;
}
function startPlacement() {
  const d = S.decks.find(x => x.id === S.placeId), P = S.progress[S.placeId]; if (!d || !P || P._plan || !S.placePick?.size) return;
  d.help = helpFor(d);
  S.session = new Placement(d, P, [...S.placePick]); S.placePick = new Set();
  S.view = 'session'; S.notice = null; S.stepAt = 0; advance();
}
// « Tout revoir aujourd'hui » : la reprise générale à la demande, une fois par jour, quand le programme du jour est fait.
// Le nombre de mots nouveaux du jour ne change pas : seules les révisions du programme augmentent.
function recapNow(id) {
  const d = S.decks.find(x => x.id === id), plan = S.progress[id]?._plan; if (!d || !planned(d) || !plan) return;
  const T = ensureDay(d); if (!T.complete || T.recap || !T.stale) return;
  plan.ask = T.d; plan.rev = Math.min(2000, (plan.rev || 0) + T.stale); saveProgress(id); startSession(id);
}
// Parcours adapté : proposé une seule fois, après deux jours travaillés et des mesures suffisantes, quand moins de trois
// premières réponses sur quatre sont justes ou quand le programme du jour dépasse vingt minutes. L'appli ne nomme aucun
// profil : elle propose des séances plus courtes, et l'étudiant décide. Il peut revenir en arrière depuis le menu du pas.
function offerDue(d, P, T) {
  const plan = P._plan, R = rates(S.measure); if (!plan || plan.offer || plan.small || !R.measured || plan.last + 1 - plan.missed < 2) return false;
  return R.ok < OFFER.ok || minutes(T.rev * (2 - R.ok) + T.fresh * (perNew(d) + 1 - R.ok), R.sec) > OFFER.min;
}
function setSmall(id, on, offered = false) {
  const plan = S.progress[id]?._plan; if (!plan) return;
  plan.small = !!on; if (offered || plan.offer === 0) plan.offer = on ? 2 : 1;
  saveProgress(id); toast(t(on ? 'plSmallOk' : 'plSmallEnd')); render();
}
// Jour manqué, quand rattraper coûte plus de cinq minutes par jour : l'étudiant choisit de garder la fin ou ses minutes.
function keepPlan(id, v, k) {
  const d = S.decks.find(x => x.id === id), plan = S.progress[id]?._plan; if (!d || !planned(d) || !plan) return;
  const now = Date.now(), dNow = Math.max(0, dayIndex(plan.start, now)), miss = missedNow(plan, dNow) - plan.ack;
  if (miss <= 0) return;
  if (v === 'min') plan.days = Math.min(PLAN_DAYS.long, plan.days + Math.min(miss, Math.max(1, Math.round(k) || 1)));
  plan.ack = missedNow(plan, dNow); plan.day = -1;
  saveProgress(id); render();
}
function planView() {
  const d = S.decks.find(x => x.id === S.planId), P = S.progress[d.id], plan = P._plan || null, now = Date.now();
  const left = d.cards.filter(c => isNew(P[c.id])).length, others = otherReviews(d, now);
  const card = o => `<article class="pace card${plan?.pace === o.pace ? ' current' : ''}">
      <p class="pacetags">${o.pace === 'mid' ? `<span class="tag ok">${t('plAdvised')}</span>` : ''}${plan?.pace === o.pace ? `<span class="tag">${t('plCurrent')}</span>` : ''}</p>
      ${trail(o.total)}
      <h2>${t('pace_' + o.pace)}</h2>
      <p class="big">${t('plMin', o.min)}</p>
      <p>${plan ? t('plDaysLeft', o.left) : t('plDays', o.total)}${o.peak - o.min >= 3 ? ` <span class="meta">· ${t('plPeak', o.peak)}</span>` : ''}</p>
      <p class="pacenote">${t('plNote_' + o.pace)}</p>
      ${!plan && o.total > d.days ? `<p class="pacenote">${t('plReady', d.days, pctOf(o.seen), pctOf(o.again))}</p>` : ''}
      <button class="${o.pace === 'mid' ? 'primary' : 'secondary'}" data-action="pace" data-pace="${o.pace}">${t('plPick', t('pace_' + o.pace))}</button></article>`;
  // « Quand feras-tu ta séance ? » : décider à l'avance du moment aide à tenir un but (Gollwitzer et Sheeran 2006). Un
  // geste, facultatif, au premier choix seulement ; la réponse règle l'heure du rappel d'agenda déjà présent dans l'appli.
  const moment = plan ? '' : `<section class="moment card"><h2>${t('plMomQ')}</h2>
      <div class="seg" role="group" aria-label="${esc(t('plMomQ'))}">${MOMENTS.map(([v, k]) => `<button type="button" data-action="moment" data-v="${v}" aria-pressed="${!!S.momentSet && S.remind.time === v}">${t(k)}</button>`).join('')}</div>
      ${S.momentSet ? `<p class="pacenote">${t('plMomOk', esc(S.remind.time))} <button class="link" data-action="remind">${ICON.cal} ${t('remAdd')}</button></p>` : `<p class="pacenote">${t('plMomHint')}</p>`}</section>`;
  // « J'ai moins de jours » : l'étudiant dit ses jours, l'appli répond ce qui sera prêt, sans rien embellir.
  const dNow = plan ? Math.max(0, dayIndex(plan.start, now)) : 0, n = Math.round(Math.min(d.days, Math.max(0, S.ownDays || 0)));
  const own = !n ? `<p class="ownlink"><button class="link" data-action="own-open">${t('plOwnLink')}</button></p>` : (o => `<section class="card ownbox"><h2>${t('plOwnQ')}</h2>
      <div class="stepper"><button type="button" class="secondary" data-action="own-step" data-v="-1" aria-label="${esc(t('plOwnLess'))}"${n <= 1 ? ' disabled' : ''}>−</button><b class="ownn" aria-live="polite">${t('plOwnN', n)}</b><button type="button" class="secondary" data-action="own-step" data-v="1" aria-label="${esc(t('plOwnMore'))}"${n >= d.days ? ' disabled' : ''}>+</button></div>
      <p class="ownsays">${plan ? t('plOwnSaysLeft', n, o.min) : t('plOwnSays', n, pctOf(o.seen), pctOf(o.again), o.min)}</p>
      ${!plan && o.again < 0.9 ? `<p class="pacenote">${t('plOwnWarn')}</p>` : ''}
      <button class="secondary" data-action="pace" data-pace="${OWN}">${t('plOwnPick', n)}</button></section>`)(planOption(d, P, OWN, dNow + n, now));
  return `<button class="link" data-action="home">← ${t('back')}</button>
    <h1>${t('plTitle')}</h1><p class="lead" lang="${d.lang}">${esc(d.name)}</p>
    <p class="planlead">${plan ? t('plLeadChange', left) : t('plLead', left, d.days)}</p>
    <p class="planlead why">${t('plWhy', d.days)}</p>
    ${moment}
    <section class="paces">${(S.planOpts?.id === d.id ? S.planOpts.list : planOptions(d, P, now)).map(card).join('')}</section>
    ${own}
    <p class="pacenote">${t('plFoot')}</p>
    ${others ? `<p class="pacenote">${t('plOthers', others)}</p>` : ''}`;
}
const MOMENTS = [['08:00', 'plMomAM'], ['12:30', 'plMomNoon'], ['19:00', 'plMomPM']];
// Sur la carte (design du 27 novembre) : les trois pas restent visibles, chacun avec son pictogramme d'allure et son nom.
// Dessous, une seule piste d'empreintes, une par jour du plan : jours faits en plein, jour en cours plus gros, jours à
// venir en contour. Toucher un pas le choisit ; toucher la piste ouvre « Ton plan ». Aucune minute ici.
const paceTwo = pace => t('paceBoldFirst') ? `<b>${t('paceB_' + pace)}</b><span>${t('paceS')}</span>` : `<span>${t('paceS')}</span><b>${t('paceB_' + pace)}</b>`;
// Sur une carte sans jours conseillés : les trois mêmes pas, sans piste (il n'y a pas de jours à compter). Une ligne dit ce que le
// pas choisi règle, parce que le dessin ne le montre pas.
const newRow = d => { const n = newFor(d.id);
  return `<div class="pacegroup" role="group" aria-label="${esc(t('paceGroup'))}">${PACES.map(pace => `<button type="button" class="pacepick" data-action="pace-new" data-id="${d.id}" data-pace="${pace}" aria-pressed="${NEW_BY_PACE[pace] === n}">${allure(pace)}${paceTwo(pace)}</button>`).join('')}</div>
    <p class="planline"><span class="meta planday">${t('newPerSession', n)}</span>${S.paceSaid === d.id ? `<span class="vh" role="status">${t('paceChanged', t('pace_' + PACES.find(p => NEW_BY_PACE[p] === n)))} ${t('newPerSession', n)}</span>` : ''}</p>`; };
function paceRow(d, P, T) {
  const plan = P._plan, today = T.over ? plan.days : T.d, n = Math.min(plan.days, 12);
  const where = T.over ? t('plOverTag') : t('plDayCap', T.d + 1, plan.days), note = t('paceNote_' + (PACES.includes(plan.pace) ? plan.pace : 'own'));
  // Au-delà de douze jours, la fenêtre de douze empreintes suit le jour en cours ; le reste est écrit en chiffres, avant et après.
  const first = Math.max(0, Math.min(today - 6, plan.days - n)), rest = plan.days - first - n, more = k => k > 0 ? `<span class="trailmore">+${k}</span>` : '';
  const path = `<span class="path${n > 9 ? ' many' : ''}${S.paceAnim === d.id ? ' fresh' : ''}" aria-hidden="true">${more(first)}${Array.from({ length: n }, (_, i) => `<svg class="paw${first + i < today ? '' : first + i === today ? ' now' : ' todo'}" viewBox="0 0 26 26">${PRINT}</svg>`).join('')}${more(rest)}</span>`;
  const undo = S.paceUndo?.id === d.id ? `<span class="vh" role="status">${t('paceChanged', t(PACES.includes(plan.pace) ? 'pace_' + plan.pace : 'pace_own'))}</span><button type="button" class="link paceundo" data-action="pace-undo" data-id="${d.id}">${t('paceUndo')}</button>` : '';
  return `<div class="pacegroup" role="group" aria-label="${esc(t('paceGroup'))}">${PACES.map(pace => `<button type="button" class="pacepick" data-action="pace" data-id="${d.id}" data-pace="${pace}" aria-pressed="${plan.pace === pace}">${allure(pace)}${paceTwo(pace)}</button>`).join('')}</div>
    <div class="planline"><button type="button" class="pathbtn" data-action="plan" data-id="${d.id}" aria-label="${esc(t('plPathAria', where, note))}">${path}</button><span class="meta planday">${T.over ? where.charAt(0).toUpperCase() + where.slice(1) : `${where} · ${note}`}</span>${undo}${!T.over && (plan.offer || plan.small) ? `<button class="link" data-action="small" data-id="${d.id}" data-v="${plan.small ? 'off' : 'on'}">${t(plan.small ? 'plSmallOff' : 'plSmallOn')}</button>` : ''}</div>`;
}
// Sur la carte du paquet : une seule barre, la trompe, qui mesure le programme du jour ; les nombres du jour sont écrits
// dans le bouton (« + 3 nouveaux · 5 à revoir »). Aucune minute ici. Une fois la journée faite, l'herbe est mangée et la
// carte propose la seconde séance (mots ratés ou aidés du jour) et « Tout revoir » (reprise générale à la demande).
const AGAIN = '<svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.2-5.1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M17.6 2.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function planBlock(d, P, T, nextDays) {
  const plan = P._plan, R = ratesFor(d);
  if (!plan) return `<p class="planline">${t('plNone', d.cards.filter(c => isNew(P[c.id])).length, d.days)}</p><button class="primary" data-action="place" data-id="${d.id}">${t('plBegin')}</button>`;
  const now = Date.now(), miss = T.over ? 0 : missedNow(plan, T.d) - plan.ack; let missed = '';
  if (miss > 0 && !T.complete) {
    const opt = { ok: R.ok, perNew: perNew(d) }, a = minutes(outlook(d, P, plan, now, opt).avg, R.sec), b = minutes(outlook(d, P, plan, now, { ...opt, days: Math.min(PLAN_DAYS.long, plan.days + miss) }).avg, R.sec);
    missed = a - b > EXTRA_MIN ? `<div class="banner warn planmiss"><p>${t('plMissedAsk', miss)}</p><div class="stack"><button class="secondary" data-action="plan-keep" data-v="end" data-id="${d.id}">${t('plKeepEnd', a)}</button>
        <button class="secondary" data-action="plan-keep" data-v="min" data-k="${miss}" data-id="${d.id}">${t('plKeepMin', b, miss)}</button></div></div>`
      : `<p class="banner planmiss">${t('plMissed', miss, a)}</p>`;
  }
  const offer = offerDue(d, P, T) ? `<div class="banner planoffer"><p>${t('plOffer', SMALL.fresh)}</p><div class="stack"><button class="secondary" data-action="offer" data-v="yes" data-id="${d.id}">${t('plOfferYes')}</button><button class="link" data-action="offer" data-v="no" data-id="${d.id}">${t('plOfferNo')}</button></div></div>` : '';
  const pct = T.total ? Math.min(100, Math.round(100 * T.done / T.total)) : 100;
  const more = `${T.weak ? `<button class="secondary" data-action="second" data-id="${d.id}">${AGAIN} ${t('plSecond', T.weak)}</button>` : ''}${T.stale ? `<button class="secondary" data-action="recap" data-id="${d.id}">${t('plRecap', T.stale)}</button>` : ''}`;
  const sub = [T.freshLeft ? `+ ${tn('plNewN', T.freshLeft)}` : '', T.revLeft ? t(T.recap ? 'plRevAllN' : 'plRevN', T.revLeft) : ''].filter(Boolean).join(' · ');
  return `${paceRow(d, P, T)}${missed}${offer}
    ${T.over && T.complete ? '' : trunkBar(pct, 'idle', t('plDayAria', T.done, T.total))}
    ${T.complete ? `<p class="rest dayok">${T.over ? t('nothing', nextDays) : t('plDayDone')}</p>${more ? `<div class="stack daymore">${more}</div>` : ''}`
      : `<button class="primary go" data-action="start" data-id="${d.id}"><span class="golabel">${t(T.done ? 'plResume' : 'plGo')}</span>${sub ? `<span class="gosub">${sub}</span>` : ''}</button>`}`;
}
// Où en est l'étudiant par rapport aux jours conseillés, en un mot ; le détail n'apparaît qu'en cas de retard.
function planStatus(d, P) {
  const plan = P._plan, m = milestone(d, P, plan, Date.now());
  const ok = k => `<span class="status ok"><span aria-hidden="true">✓</span> ${t(k)}</span>`, warn = (k, n) => `<span class="status late">${t(k, n)}</span>`;
  return m.d >= d.days ? (m.unseen ? warn('plLateUnseen', m.unseen) : ok('plAllSeen')) : m.behind ? warn('plBehind', m.behind) : ok('plOnTime');
}

function deckCard(d) {
  if (!S.progress[d.id]) return '';      // paquet dont la progression n'est pas encore chargée : il s'affichera au prochain dessin
  const P = S.progress[d.id], s = summary(d, P), plan = planned(d), T = plan ? ensureDay(d) : null, canStart = plan ? !T?.complete : s.due + pickNew(d, P, newFor(d.id)).length > 0;
  const nextDays = Math.min(...d.cards.map(c => dueInDays(P[c.id])).filter(n => n > 0), 999);
  const pct = s.stage.size ? Math.round(100 * s.stage.seen / s.stage.size) : 0;
  const held = !plan && pickNew(d, P, newFor(d.id)).length > roomFor(s.due, newFor(d.id));
  const mute = voices.length && !voiceFor(d.lang) && d.cards.some(c => !c.audio);
  const lang = esc(Object.hasOwn(LANG_NAMES, d.lang) ? LANG_NAMES[d.lang] : d.lang);
  const foot = `${plan && P._plan ? planStatus(d, P) : ''}${challengeLine(d, P, 'lock')}`;
  // Une seule barre par carte : avec un plan, la trompe mesure le programme du jour ; sans plan, elle mesure l'étape.
  return `<article class="deck card" style="--th:${hue(d.cards[0].theme || d.name)}">
    <div class="deckhead"><h2 lang="${d.lang}">${esc(d.name)}</h2><p class="meta"><i class="dot" aria-hidden="true"></i>${lang} · ${d.level}${d.demo ? ' · ' + t('demo') : ''}</p></div>
    ${prairie(d, s, [], !canStart, true)}
    ${plan ? planBlock(d, P, T, nextDays) : `${newRow(d)}<div class="stagebar"><span>${t('stageN', s.stage.index)}</span>${trunkBar(pct, 'idle', t('stageAria', s.stage.index, s.stage.count, s.stage.seen, s.stage.size))}</div>
    ${canStart ? `<button class="primary" data-action="start" data-id="${d.id}">${S.sandbox ? t('sbGo') : t('start', S.minutes)}</button>` : `<p class="rest">${t('nothing', nextDays)}</p>`}`}
    ${held ? `<p class="heldline">${t('heldHome')} <button class="link" data-action="start-force" data-id="${d.id}">${t('heldForce')}</button></p>` : ''}
    ${mute ? `<p class="banner warn">${t('noVoiceDeck', lang)}</p>` : ''}
    ${challengeLine(d, P, 'rest')}
    ${matchLine(d, P)}
    ${d.cards.filter(c => !isNew(P[c.id])).length >= 6 ? `<button class="secondary race" data-action="race" data-id="${d.id}">${mouse(22)} ${t('raceBtn')}${P._race?.best ? ` <span class="meta">${t('raceBest', +P._race.best || 0)}</span>` : ''}</button>` : ''}
    ${foot ? `<div class="deckfoot">${foot}</div>` : ''}
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

// Confidentialité : ce qui est enregistré, où, ce qui sort de l'appareil, et le moyen de tout effacer.
function privacyView() {
  return `<button class="link" data-action="home">← ${t('back')}</button>
    <h1>${t('pvTitle')}</h1><p class="lead">${t('pvLead')}</p>
    <section class="card privacy"><dl>${t('pvItems').map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>
    <section class="card privacy"><h2>${t('pvRights')}</h2><p>${t('pvRightsText')}</p>
      <div class="stack"><button class="secondary" data-action="backup">${t('bkSave')}</button>
      ${S.confirmWipe ? `<button class="secondary danger" data-action="wipe-yes">${t('pvWipeSure')}</button><button class="secondary" data-action="wipe-no">${t('cancel')}</button>` : `<button class="secondary danger" data-action="wipe">${t('pvWipe')}</button>`}</div>
      <p class="sethint">${t('pvContact')}</p></section>`;
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
  ${S.notice ? `<p class="banner ${S.notice.bad ? 'warn' : 'good'}" role="status">${esc(S.notice.text)}</p>` : ''}
  ${S.notice?.sort && TEACHER && S.view !== 'sort' ? `<p class="banner warn" role="status">${t('sortAlert', +S.notice.sort.n || 0)} <button type="button" class="secondary small" data-action="sort" data-id="${esc(String(S.notice.sort.id))}">${t('sortBtn')}</button></p>` : ''}`;

// Catégories proposées à l'enseignant, dans l'éditeur de fiche et dans l'écran de classement.
const KINDS = ['nom', 'verbe', 'adjectif', 'adverbe', 'préposition', 'déterminant', 'pronom', 'conjonction', 'expression'];
const kindName = k => (Object.hasOwn(STR.fr, 'pos_' + k) ? t('pos_' + k) : esc(k));
// Ce qu'il reste à compléter à la main dans un paquet : fiches sans catégorie, noms sans genre (français, espagnol).
const unsorted = d => d.cards.filter(c => kindOf(c) === 'autre');
const ungendered = d => d.cards.filter(c => needsGender(c, d.lang));
const sortNotice = deck => { const n = unsorted(deck).length + ungendered(deck).length; return n ? { id: deck.id, n } : undefined; };

function home() {
  // « Le troupeau a commencé » : au moins un mot déjà travaillé, dans n'importe quel paquet.
  const begun = S.decks.some(d => { const P = S.progress[d.id]; return !!P && d.cards.some(c => !isNew(P[c.id])); });
  return `${TEACHER ? `<button class="link" data-action="teacher">← ${t('eBack')}</button>` : ''}<header class="top${begun ? ' short' : ''}">${mascot(147, 'idle', 2)}<h1>Éléfiches<span class="edition">${EDITION}</span></h1>
      ${begun ? '' : `<p class="tagline">${t('tagline')}</p>`}
      <button class="rulesbtn" data-action="rules" aria-label="${esc(t('rules'))}" title="${esc(t('rules'))}">${TROMPE}</button>${SAVANNA}</header>
    ${S.sandbox ? sandboxBar(true) : ''}${banners()}
    <section class="decks">${S.decks.map(deckCard).join('')}</section>
    <section class="tools" aria-label="${t('toolsLabel')}">
    <details class="card settings"><summary>${ICON.gear} ${t('settings')}</summary>
      ${setrow('appLang', seg('lang', S.lang, [['auto', t('auto')], ...Object.entries(LANG_NAMES)]))}
      <p class="sethint">${t('autoHint')}</p>
      ${setrow('help', seg('help', S.help, [['none', t('helpNone')], ...Object.entries(LANG_NAMES)]))}
      ${setrow('duration', seg('minutes', S.minutes, [3, 5, 10, 15].map(m => [m, t('min', m)])))}
      ${setrow('sound', seg('sound', S.sound ? '1' : '0', [['1', t('on')], ['0', t('off')]]))}
      ${setrow('voiceAuto', seg('voice', S.voice ? '1' : '0', [['1', t('onF')], ['0', t('offF')]]))}
      <p class="sethint">${t('voiceHint')}</p>
    </details>
    ${backupView()}
    <details class="card settings remind"><summary>${ICON.bell} ${t('remTitle')}</summary>
      <p class="sethint">${t('remIntro')}</p>
      <div class="setrow"><label for="remtime">${t('remTime')}</label><input id="remtime" type="time" data-remind="time" value="${esc(S.remind.time)}"></div>
      ${setrow('remDays', seg('remindDays', S.remind.days, [['daily', t('remDaily')], ['weekdays', t('remWeek')], ['three', t('remThree')]]))}
      <div class="stack"><button class="secondary" data-action="remind">${ICON.cal} ${t('remAdd')}</button></div>
      <p class="sethint">${t('remHint')}</p>
    </details>
    <label class="toolrow filelabel">${ICON.open} ${t('openPacket')}<input type="file" class="vh" data-file="packet" accept=".json,.zip,.apkg,application/json,application/zip"></label>
    </section>
    <p class="footlinks">${TEACHER ? `<button class="link" data-action="teacher">${t('teacher')}</button>` : ''}<button class="link" data-action="privacy">${t('pvLink')}</button></p>`;
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
  return `<header class="thead"><button class="link" data-action="home">${t('asStudent')} →</button>
    <h1>${t('tTitle')}</h1><p class="lead">${t('tIntro')}</p>
    <p class="studenturl"><span>${t('studentUrl')}</span> <b>${esc(siteBase())}</b></p></header>
    ${banners()}
    <section class="card sbcard hasinfo"><h2>${t('sbTitle')}</h2>${infoNote(t('sbMore'), t('sbTitle'))}<p class="sethint">${t('sbIntro')}</p>
      <div class="row"><button type="button" class="primary" data-action="sb-on">${t(S.sandbox ? 'sbResume' : 'sbStart')}</button>${S.sandbox ? `<button type="button" class="link" data-action="sb-off">${t('sbQuit')}</button>` : ''}</div></section>
    <section class="card"><h2>${t('myDecks')}</h2><ul class="decklist">${S.decks.map(d => `<li class="tdeck">
      <span><b lang="${d.lang}">${esc(d.name)}</b><br><span class="meta">${t('nCards', d.cards.length)} · ${esc(Object.hasOwn(LANG_NAMES, d.lang) ? LANG_NAMES[d.lang] : d.lang)} · ${d.level}${d.days ? ' · ' + t('tDaysMeta', d.days) : ''}${d.seen ? ' · ' + t('tSeenMeta') : ''}</span>${auditView(d)}</span>
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
        <label>${t('bEx')} <select data-b="examples">${[1, 2, 3, 4, 5].map(n => opt(n, B.examples, t(n === 1 ? 'bEx1' : 'bExN', n))).join('')}</select><span class="sethint">${t('bExHint')}</span></label>
        <p class="banner${+B.examples === 1 ? ' warn' : ''}" role="status" data-exwarn${+B.examples > 2 ? ' hidden' : ''}>${+B.examples === 1 ? t('bExWarn1') : +B.examples === 2 ? t('bExWarn2') : ''}</p>
        <details class="more"${B.words ? ' open' : ''}><summary>${t('bWordsSum')}</summary>
          <label>${t('bWords')} <textarea data-b="words" rows="4">${esc(B.words)}</textarea><span class="sethint">${t('bWordsHint')}</span></label></details>
      </div></section>
    <section class="card"><h2>${t('b2')}</h2><p>${t('b2Intro')}</p>
      ${promptBox('file', 'pFile')}
      <p class="sethint">${t('pGoHint')}</p>${promptBox('go', 'pGo')}
      <details class="more"><summary>${t('pReviewSum')}</summary><p class="sethint">${t('pReviewHint')}</p>${promptBox('review', 'pReview')}</details>
      <details class="more"><summary>${t('noFile')}</summary><p>${t('noFileHint')}</p>
        ${promptBox('cards', 'pCards')}
        <p class="sethint">${t('pGoHint')}</p>${promptBox('go', 'pGo')}
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
        <details class="more"><summary>${t('fRhythmSum')}</summary>
        <fieldset class="rhythm"><legend>${t('fRhythm')}</legend>
          <p class="sethint">${t('fRhythmHint')}</p>
          <label>${t('fDays')} <input name="days" type="number" min="${PLAN_DAYS.min}" max="${PLAN_DAYS.max}" step="1" inputmode="numeric" value="" autocomplete="off"><span class="sethint">${t('fDaysHint', PLAN_DAYS.min, PLAN_DAYS.max)}</span></label>
          <label class="pick"><input type="checkbox" name="seen"> <span>${t('fSeen')}</span></label><p class="sethint">${t('fSeenHint')}</p></fieldset>
        </details>
        <button class="primary">${t('importBtn')}</button>
      </form></section>
    <details class="card more"><summary>${t('manual')}</summary>
      <ol class="steps">${t('tSteps').map(s => `<li>${s}</li>`).join('')}</ol>
      <h2>${t('tModels')}</h2><ul class="models">
      ${model('fr', 'tModelFr', 'tModelFrSub')}${model('en', 'tModelEn', 'tModelEnSub')}${model('es', 'tModelEs', 'tModelEsSub')}</ul>
      <h2>${t('tCols')}</h2><div class="scroll"><table>
      <thead><tr><th>${t('colName')}</th><th>${t('colNeed')}</th><th>${t('colWhat')}</th></tr></thead><tbody>
      ${row('Word', 'yes', 'cWord')}${row('Definition', 'oneOf', 'cDef')}${row('Traduction FR<br>Traduction EN', 'oneOf', 'cTr')}
      ${row('Example 1', 'advised', 'cEx')}${row('Example 2<br>… Example 5', 'optional', 'cEx2')}${row('Situation', 'advised', 'cSit')}${row('Distracteurs', 'advised', 'cTraps')}
      ${row('Nature', 'advised', 'cPos')}${row('Genre', 'advised', 'cGender')}
      ${row('Category', 'advised', 'cCat')}${row('Famille', 'optional', 'cFam')}
      ${row('Image', 'optional', 'cImg')}${row('Audio', 'optional', 'cAudio')}${row('IPA', 'optional', 'cIpa')}
      </tbody></table></div></details>
    ${accessCard()}`;
}

async function addDeck(text, name, lang, json = false, level) {
  try {
    const deck = json ? deckFromJSON(text, name, level) : deckFromCSV(text, name, lang, level);
    await ensureProgress(deck.id); keepDoubts(deck);
    S.decks = [...S.decks.filter(d => d.id !== deck.id), deck];
    await saveDecks();
    S.notice = { text: t('imported', deck.name, deck.cards.length, deck.skipped), sort: sortNotice(deck) };
    S.view = 'home';
  } catch (e) {
    S.notice = { bad: true, text: t(ERR[e.message] || 'errEmpty') };
  }
  render();
}
const ERR = { 'too-many': 'errMany', 'zip-big': 'errBig', zip: 'errEmpty', 'anki-new': 'errAnki', sqlite: 'errAnki', 'no-word-column': 'errNoWord', 'too-few': 'errFew', 'bad-json': 'errJson', 'no-level': 'errLevel', 'no-name': 'errName', nothing: 'errNothing' };

// Import : un texte collé ou un fichier de paquet (.json, .csv), accompagné ou non d'images, de sons et de planches,
// le tout éventuellement réuni dans une archive .zip. Rien n'est envoyé nulle part : tout est lu sur l'appareil.
async function importPacket({ files = [], text = '', name = '', lang = 'fr', level = '', home = false, days = 0, seen = false }) {
  try {
    files = files.map(f => ({ name: f.name, blob: f }));
    const budget = { left: 250e6 };                 // place totale pour tout ce qui se décompresse pendant cet import
    if (files.length > 400 || files.reduce((n, f) => n + f.blob.size, 0) > 250e6) throw new Error('zip-big');
    for (const z of files.filter(f => /\.zip$/i.test(f.name))) files.push(...await unzip(await z.blob.arrayBuffer(), budget));
    files = files.filter(f => !/\.zip$/i.test(f.name));
    // Paquet Anki (.apkg) : une archive qui contient une base de notes et des médias numérotés.
    let anki = null; const ankis = [];
    for (const a of files.filter(f => /\.(apkg|colpkg)$/i.test(f.name))) {
      if (ankis.length >= 12) throw new Error('zip-big');
      const inside = await unzip(await a.blob.arrayBuffer(), budget), get = n => inside.find(f => f.name === n);
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
        const name = squash(stem(f.name)), c = name && deck.cards.find(c => !c.image && [c.key, noArt(c.key)].map(squash).includes(name));
        if (c) { const url = safeUrl(await imageToDataURL(f.blob)); if (url) c.image = url; used.add(f); }      // image trop lourde : écartée, comme au rechargement
      }
      for (const f of images.filter(f => !used.has(f)).slice(0, 200)) { const url = safeUrl(await imageToDataURL(f.blob)); if (url) S.loose.push(url); }
    }
    await ensureProgress(deck.id); keepDoubts(deck);
    // Rythme du paquet. Dans l'espace enseignant, ce qui est saisi au moment de l'import l'emporte ; sinon le fichier ; sinon
    // le réglage du paquet qu'on remplace (un fichier refait par une IA ne le contient jamais). Un paquet reçu par un
    // étudiant est pris tel quel : c'est le fichier de l'enseignant qui fait foi.
    let fromFile = '';
    if (!home) {
      const old = S.decks.find(d => d.id === deck.id), typed = adviseDays(days);
      // Un rythme écrit dans le fichier (par une IA, par un tiers) et non saisi ici est annoncé : l'enseignant doit le voir.
      if ((deck.days && !typed) || (deck.seen && !seen)) fromFile = ' ' + t('importedRhythm', deck.days && !typed ? deck.days : '–', t(deck.seen && !seen ? 'rhYes' : 'rhNo'));
      deck.days = typed || deck.days || old?.days; if (seen || (deck.seen === undefined && old?.seen)) deck.seen = true;
    }
    S.decks = [...S.decks.filter(d => d.id !== deck.id), deck];
    await saveDecks();
    S.notice = { text: t('imported', deck.name, deck.cards.length, deck.skipped) + fromFile, sort: sortNotice(deck) };
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

// Contrôle du paquet : ce que l'application peut vérifier seule (images, longueur des définitions, exemples).
function auditView(d) {
  const found = audit(d);
  // Catégories grammaticales : une fiche dont la catégorie reste inconnue, ou seule de sa catégorie, n'aura jamais de
  // question à choix (on ne mêle pas les catégories). L'enseignant le voit ici.
  const kinds = d.cards.map(c => kindOf(c, d.lang)), size = k => kinds.filter(x => x === k).length;
  const unknown = d.cards.filter((c, i) => kinds[i] === 'autre'), alone = d.cards.filter((c, i) => kinds[i] !== 'autre' && size(kinds[i]) < 3), nogender = ungendered(d);
  if (unknown.length) found.unshift({ key: 'auNoKind', cards: unknown, warn: true });
  if (nogender.length) found.push({ key: 'auNoGender', cards: nogender, warn: true });
  if (alone.length) found.push({ key: 'auAlone', cards: alone, warn: false });
  const warn = found.filter(f => f.warn), tips = found.filter(f => !f.warn);
  if (!found.length) return `<p class="audit ok">${t('auOk')}</p>`;
  // Chaque remarque dit quoi faire, et chaque mot est un bouton qui ouvre sa fiche : l'enseignant n'a rien à chercher.
  const word = c => `<button type="button" class="chipbtn" data-action="fix-card" data-deck="${esc(d.id)}" data-id="${esc(c.id)}" lang="${esc(d.lang)}">${esc(c.bare)}</button>`;
  const go = { auNoImage: ['images', 'imgBtn'], auNoKind: ['sort', 'sortBtn'], auNoGender: ['sort', 'sortBtn'] };
  const item = f => `<li><p class="autext">${t(f.key, f.cards.length, d.cards.length, d.level)}</p>
      <p class="audo"><b>${t('auDo')}</b> ${t(f.key + 'Do')}</p>
      ${f.lines?.length ? `<ul class="aulines" lang="${esc(d.lang)}">${f.lines.slice(0, 8).map(x => `<li>${esc(x)}</li>`).join('')}${f.lines.length > 8 ? '<li>…</li>' : ''}</ul>` : ''}
      <p class="aucards">${f.cards.slice(0, 10).map(word).join('')}${f.cards.length > 10 ? `<span class="meta">${t('auMore', f.cards.length - 10)}</span>` : ''}${go[f.key] ? `<button type="button" class="secondary small" data-action="${go[f.key][0]}" data-id="${esc(d.id)}">${t(go[f.key][1])}</button>` : ''}</p></li>`;
  return `<details class="audit${warn.length ? ' warn' : ''}"><summary>${warn.length ? t('auSum', warn.length, tips.length) : t('auSum0', tips.length)}</summary>
    <p class="sethint">${t('auHow')}</p>
    ${warn.length ? `<h3 class="auh w">${t('auFixH', warn.length)}</h3><ul class="aulist">${warn.map(item).join('')}</ul>` : ''}
    ${tips.length ? `<h3 class="auh">${t('auTipH', tips.length)}</h3><ul class="aulist">${tips.map(item).join('')}</ul>` : ''}
    <p class="sethint">${t('auNote')}</p></details>`;
}

function imagesView() {
  const d = S.decks.find(x => x.id === S.imgId), waiting = d.cards.filter(c => c.sheet && !c.image).length, wantsSheets = d.cards.some(c => c.sheet);
  return `<button class="link" data-action="teacher">← ${t('eBack')}</button>
    <h1>${t('imgTitle')}</h1><p class="lead" lang="${d.lang}">${esc(d.name)}</p>
    ${deckTabs(d, 'images')}
    ${banners()}
    ${auditView(d)}
    <section class="card import"><h2>${t('imgAddTitle')}</h2><p class="sethint">${t('imgAddHint')}</p>
      <input type="file" multiple accept="image/*" data-file="loose" aria-label="${t('imgAddTitle')}"></section>
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

// Les trois écrans d'un paquet (fiches, classement, images) se rejoignent d'un geste, sans repasser par la liste.
const deckTabs = (d, cur) => `<nav class="decktabs" aria-label="${esc(d.name)}">${[['edit', 'tabCards'], ['sort', 'sortBtn'], ['images', 'imgBtn']].map(([a, k]) => `<button type="button" class="${a === cur ? 'on' : ''}" data-action="${a}" data-id="${esc(d.id)}"${a === cur ? ' aria-current="page"' : ''}>${t(k)}</button>`).join('')}</nav>`;

// ---------- Classer les mots : catégorie grammaticale et genre, par lot ----------
// L'application ne devine pas la catégorie d'un mot. Quand le paquet ne la donne pas, l'enseignant la donne ici : les
// mots arrivent déjà rangés selon une suggestion, il déplace ceux qui sont mal rangés puis confirme chaque groupe.
function sortView() {
  const d = S.decks.find(x => x.id === S.sortId), gendered = GENDERED_LANGS.includes(d.lang);
  const item = (c, name, note = '') => `<li><label class="pick"><input type="checkbox" name="${name}" value="${esc(c.id)}"> <span><b lang="${esc(d.lang)}">${esc(c.word)}</b>${note ? ` <span class="tag">${note}</span>` : ''}<br><span class="meta">${esc(short(meaning(c), 60))}</span></span></label></li>`;
  const todo = unsorted(d), groups = new Map();
  for (const c of todo) { const k = suggestKind(c, d.lang); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const order = [...KINDS.filter(k => groups.has(k)), ...[...groups.keys()].filter(k => !KINDS.includes(k) && k !== 'autre'), ...(groups.has('autre') ? ['autre'] : [])];
  const done = d.cards.filter(c => kindOf(c) !== 'autre'), byKind = new Map();
  for (const c of done) { const k = kindOf(c); if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(c); }      // un seul passage, même avec des centaines de catégories
  const nouns = ungendered(d), known = d.cards.filter(c => kindOf(c) === 'nom' && genderOf(c));
  return `<button class="link" data-action="teacher">← ${t('eBack')}</button>
    <h1>${t('sortTitle')}</h1><p class="lead" lang="${esc(d.lang)}">${esc(d.name)}</p>
    ${deckTabs(d, 'sort')}
    ${banners()}
    <section class="card sort" data-sort="kind"><h2>${t('sortKinds')}</h2>
      ${todo.length ? `<p class="sethint">${t('sortHow')}</p>
      ${order.map(k => `<fieldset class="sortgroup"><legend>${k === 'autre' ? t('sortNoHint') : t('sortHint', kindName(k))} · ${t('nWords', groups.get(k).length)}</legend>
        <ul class="picks">${groups.get(k).map(c => item(c, 'pick')).join('')}</ul>
        <div class="row"><button type="button" class="link" data-action="sort-all">${t('sortAll')}</button>
        ${k === 'autre' ? '' : `<button type="button" class="primary small" data-action="sort-confirm" data-kind="${esc(k)}">${t('sortConfirm', kindName(k))}</button>`}</div></fieldset>`).join('')}` : `<p class="audit ok">${t('sortKindsOk')}</p>`}
      ${done.length ? `<details class="more"><summary>${t('sortDone', done.length)}</summary>
        ${[...byKind].map(([k, cs]) => `<fieldset class="sortgroup"><legend>${kindName(k)} · ${t('nWords', cs.length)}</legend><ul class="picks">${cs.map(c => item(c, 'pick')).join('')}</ul></fieldset>`).join('')}</details>` : ''}
      <div class="sortbar"><label>${t('sortMoveTo')} <select data-sortkind>${KINDS.map(k => `<option value="${esc(k)}">${kindName(k)}</option>`).join('')}</select></label>
        <button type="button" class="primary" data-action="sort-move">${t('sortMove')}</button></div>
    </section>
    ${gendered ? `<section class="card sort" data-sort="gender"><h2>${t('sortGenders')}</h2>
      ${nouns.length ? `<p class="sethint">${t('sortGenderHow')}</p><ul class="picks">${nouns.map(c => item(c, 'gpick')).join('')}</ul>` : `<p class="audit ok">${t(todo.length ? 'sortGendersLater' : 'sortGendersOk')}</p>`}
      ${known.length ? `<details class="more"><summary>${t('sortGenderDone', known.length)}</summary><ul class="picks">${known.map(c => item(c, 'gpick', t('gen_' + genderOf(c)))).join('')}</ul></details>` : ''}
      ${nouns.length || known.length ? `<div class="sortbar"><span>${t('sortGenderTo')}</span>${['m', 'f', 'mf'].map(g => `<button type="button" class="secondary small" data-action="sort-gender" data-g="${g}">${t('gen_' + g)}</button>`).join('')}</div>` : ''}
    </section>` : ''}
    <button class="primary" data-action="teacher">${t('imgDone')}</button>`;
}
// Applique une catégorie ou un genre à plusieurs fiches d'un coup, puis enregistre le paquet.
async function sortApply(cards, change, text) {
  const d = S.decks.find(x => x.id === S.sortId);
  if (!d || !cards.length) return toast(t('sortNone'));
  for (const c of cards) change(c);      // catégorie et genre ne touchent aucun champ calculé : inutile de repréparer tout le paquet
  S.notice = { text: t(text, cards.length) }; render();      // l'écran suit le geste tout de suite ; l'enregistrement suit
  await saveDecks();
}

// ---------- Éditeur de paquet ----------

const editing = () => S.decks.find(d => d.id === S.editId);
const short = (x, n = 70) => (x.length > n ? x.slice(0, n - 1) + '…' : x);

function editView() {
  const d = editing();
  return `<button class="link" data-action="teacher">← ${t('eBack')}</button>
    <h1>${t('eTitle')}</h1>
    ${deckTabs(d, 'edit')}
    ${banners()}
    <section class="card import"><form data-submit="rename">
      <label>${t('deckName')} <input name="name" value="${esc(d.name)}" autocomplete="off"></label>
      <label>${t('deckLang')} <select name="lang">${langOpts(d.lang)}</select></label>
      <label>${t('level')} <select name="level">${LEVELS.map(l => opt(l, d.level, l)).join('')}</select></label>
      <fieldset class="rhythm"><legend>${t('fRhythm')}</legend>
        <p class="sethint">${t('fRhythmHint')}</p>
        <label>${t('fDays')} <input name="days" type="number" min="${PLAN_DAYS.min}" max="${PLAN_DAYS.max}" step="1" inputmode="numeric" value="${d.days || ''}" autocomplete="off"><span class="sethint">${t('fDaysHint', PLAN_DAYS.min, PLAN_DAYS.max)}</span></label>
        <label class="pick"><input type="checkbox" name="seen"${d.seen ? ' checked' : ''}> <span>${t('fSeen')}</span></label><p class="sethint">${t('fSeenHint')}</p></fieldset>
      ${d.days ? (e => `<p class="banner" role="status">${t('fEstimate', d.cards.length, d.days, minutes(e.avg, startSec(d)), minutes(e.max, startSec(d)), startSec(d))}</p>`)(simulate({ fresh: d.cards.length, days: d.days, perNew: perNew(d), cap: d.days })) : ''}
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
  const raw = isNew ? 'autre' : suggestKind(c, d.lang), guessed = Object.hasOwn(STR.fr, 'pos_' + raw) ? t('pos_' + raw) : raw;
  const art = isNew ? '' : genderOf({ word: c.word });      // genre que l'article de la fiche donne déjà (« un », « une »)
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
      <div class="two">${field('theme', t('fTheme'), c.theme)}<label>${t('fReg')} <select name="register">${['', ...REGISTERS, ...(c.register && !REGISTERS.includes(c.register) ? [c.register] : [])].map(r => `<option value="${esc(r)}" ${(c.register || '') === r ? 'selected' : ''}>${r ? regName(r) : t('regNone')}</option>`).join('')}</select></label></div>
      <div class="two">${field('family', t('fFam'), c.family)}${field('ipa', t('fIpa'), c.ipa)}</div>
      <label>${t('fPos')} <select name="pos">${['', ...KINDS, ...(c.pos && !KINDS.includes(kindOf(c)) ? [kindOf(c)] : [])].map(k => `<option value="${esc(k)}" ${(c.pos ? kindOf(c) : '') === k ? 'selected' : ''}>${k ? kindName(k) : t('posAuto', isNew ? '…' : guessed)}</option>`).join('')}</select></label>
      <p class="sethint">${t('fPosHint')}</p>
      ${GENDERED_LANGS.includes(d.lang) ? `<label>${t('fGender')} <select name="gender">${[['', art ? t('genArt', t('gen_' + art)) : t('genNone')], ['m', t('gen_m')], ['f', t('gen_f')], ['mf', t('gen_mf')]].map(([v, label]) => opt(v, c.gender || '', label)).join('')}</select></label>
      <p class="sethint">${t('fGenderHint')}</p>` : ''}
      ${c.doubt ? field('doubt', t('fDoubt'), c.doubt) : ''}
      <fieldset><legend>${t('fImg')}</legend>
        <img class="illus" data-preview="image" src="${esc(S.draft.image || '')}" alt="" ${S.draft.image ? '' : 'hidden'}>
        <input type="file" data-file="image" accept="image/*" aria-label="${t('fImg')}">
        <button type="button" class="link" data-action="clear" data-key="image">${t('remove')}</button></fieldset>
      <fieldset><legend>${t('fAudio')}</legend>
        <p class="meta" data-preview="audio">${S.draft.audio ? '🔊 ✓' : '—'}</p>
        <input type="file" data-file="audio" accept="audio/*" aria-label="${t('fAudio')}">
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
    theme: v('theme') || undefined, register: v('register') || undefined, family: v('family') || undefined, ipa: v('ipa') || undefined, pos: v('pos') || undefined, gender: v('gender') || undefined, doubt: v('doubt') || undefined,
    image: safeUrl(S.draft.image) || undefined, audio: safeUrl(S.draft.audio) || undefined };
  d.demo = false;      // une fiche modifiée : ce n'est plus la démonstration d'origine, elle ne sera jamais remplacée
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
  const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bmp.width * k)); cv.height = Math.max(1, Math.round(bmp.height * k));      // une image très allongée garde au moins un pixel
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return canvasToDataURL(cv);
}

async function attach(input) {
  const kind = input.dataset.file, file = input.files[0]; if (!file) return;
  if (kind === 'sheets') return addSheets([...input.files]);
  if (kind === 'loose') return addLoose([...input.files]);
  if (kind === 'packet') return importPacket({ files: [...input.files], home: true });
  if (kind === 'backup') return restoreBackup(file);
  try {
    if (kind === 'image') S.draft.image = await imageToDataURL(file);
    else {
      if (file.size > 600 * 1024) return toast(t('tooBig', 600));
      S.draft.audio = await blobToDataURL(file);
    }
    showDraft();
  } catch { toast(t('errEmpty')); }
}
// Images ajoutées après coup : celle dont le nom de fichier est un mot du paquet va sur sa fiche (elle remplace
// l'ancienne) ; les autres attendent que l'enseignant touche le mot qu'elles illustrent.
async function addLoose(files) {
  const id = S.imgId, d = S.decks.find(x => x.id === id); if (!TEACHER || !d) return;
  const squash = x => noAcc(norm(x)).replace(/[^a-z0-9]/g, ''), stem = n => n.split('/').pop().toLowerCase().replace(/\.\w+$/, '');
  const images = files.filter(f => (f.type || '').startsWith('image/')), wait = []; let n = 0, bad = Math.max(0, images.length - 200);
  for (const f of images.slice(0, 200)) {
    try {                                    // un fichier illisible ne fait pas perdre les autres
      if (f.size > 12 * 1024 * 1024) { bad++; continue; }
      const url = safeUrl(await imageToDataURL(f)), name = squash(stem(f.name));
      if (!/^data:image\//.test(url)) { bad++; continue; }
      const c = name && d.cards.find(c => [c.key, noArt(c.key)].map(squash).includes(name));
      if (c) { c.image = url; n++; } else wait.push(url);
    } catch { bad++; }
  }
  await saveDecks();
  // L'enseignant a changé de paquet pendant le traitement : les images en attente ne suivent pas.
  if (S.imgId !== id || !S.decks.includes(d)) return;
  const room = Math.max(0, 200 - S.loose.length);      // compté au dernier moment : deux lots lancés ensemble ne dépassent pas le plafond
  S.loose.push(...wait.slice(0, room)); bad += Math.max(0, wait.length - room);
  S.notice = { text: t('imgAdded', n, S.loose.length) + (bad ? ' ' + t('imgRefused', bad) : ''), bad: !n && !S.loose.length && bad > 0 }; render();
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
    const type = /\.ics$/i.test(name) ? 'text/calendar;charset=utf-8' : bom ? 'text/csv;charset=utf-8' : 'application/json';
    a.href = URL.createObjectURL(new Blob([(bom ? '\uFEFF' : '') + text], { type }));
    a.download = name; document.body.append(a); a.click(); a.remove();
  } catch { toast(t('downloadFail')); }
}
// ---------- Sauvegarde de la progression ----------
const hasProgress = () => Object.values(S.progress).some(P => Object.keys(P || {}).some(k => !k.startsWith('_')));
const iosSafari = () => /iP(hone|ad|od)/.test(navigator.userAgent) && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
function saveBackup() {
  if (S.sandbox) return;      // une sauvegarde contient la vraie progression, jamais des essais
  const d = new Date(), name = `elefiches-sauvegarde-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  download(name, makeBackup({ decks: S.decks.map(serialize), progress: S.progress, settings: { lang: S.lang, minutes: S.minutes, maxNew: S.maxNew, help: S.help } }), false);
  S.savedAt = Date.now(); saveSettings(); S.notice = { text: t('bkSaved', name) }; render();
}
// Restauration en deux temps : on lit le fichier, on montre ce qu'il changerait, et l'étudiant confirme.
async function restoreBackup(file) {
  if (S.sandbox) return;
  const b = file.size < 60e6 ? readBackup(await file.text()) : null;
  if (!b) { S.notice = { bad: true, text: t('bkBad') }; return render(); }
  const decks = [];
  for (const raw of b.decks) {
    let d; try { d = deckFromJSON(JSON.stringify(raw)); } catch { continue; }
    d.id = safeKey(raw?.id) || d.id;
    const cur = S.progress[d.id] || cleanProgress(await store.get(pkey(d.id)));
    decks.push({ deck: d, saved: b.progress[d.id], replaced: countReplaced(cur, b.progress[d.id]), added: countAdded(cur, b.progress[d.id]), late: countLate(cur, b.progress[d.id]), fresh: !S.decks.some(x => x.id === d.id) });
  }
  if (!decks.length) { S.notice = { bad: true, text: t('bkBad') }; return render(); }
  const when = new Date(b.date); S.pendingBackup = { decks, date: Number.isNaN(+when) ? '' : when.toLocaleDateString(uiLang()) }; S.notice = null; render();
}
async function applyBackup() {
  const pb = S.pendingBackup; if (!pb || S.sandbox || sbBusy) return; S.pendingBackup = null;
  let cards = 0;
  sbBusy = true;      // une restauration va jusqu'au bout avant tout changement de mode : elle ne concerne que la vraie progression
  try {
    for (const { deck: d, saved } of pb.decks) {
      if (!S.decks.some(x => x.id === d.id)) S.decks.push(d);
      S.progress[d.id] = mergeProgress(S.progress[d.id] || cleanProgress(await store.get('progress:' + d.id)), saved);
      cards += Object.keys(S.progress[d.id]).filter(k => !k.startsWith('_')).length;
      await store.set('progress:' + d.id, S.progress[d.id]);
    }
    S.decks = S.decks.filter(d => !(pristineDemo(d) && !Object.keys(S.progress[d.id] || {}).filter(k => !k.startsWith('_')).length && S.decks.length > 1));
    await saveDecks();
  } finally { sbBusy = false; } S.notice = { text: t('bkRestored', cards) }; render();
}
function backupView() {
  if (S.sandbox) return `<p class="toolrow sethint">${ICON.save} ${t('sbNoBackup')}</p>`;
  const days = S.savedAt ? Math.floor((Date.now() - S.savedAt) / 86400000) : -1, late = hasProgress() && (days < 0 || days >= 14);
  return `<details class="card settings backup"${late || iosSafari() || S.pendingBackup ? ' open' : ''}><summary>${ICON.save} ${t('bkTitle')}</summary>
      <p class="sethint">${t('bkIntro')}</p>
      ${iosSafari() ? `<p class="banner warn">${t('bkIos')}</p>` : ''}
      ${late ? `<p class="banner warn">${days < 0 ? t('bkNever') : t('bkLate', days)}</p>` : days >= 0 ? `<p class="sethint">${t('bkWhen', days)}</p>` : ''}
      ${S.pendingBackup ? `<div class="banner warn bkask" role="alert"><p><b>${S.pendingBackup.date ? t('bkAsk', esc(S.pendingBackup.date)) : t('bkAskNoDate')}</b></p><ul>${S.pendingBackup.decks.map(x => `<li><span lang="${esc(x.deck.lang)}">${esc(x.deck.name)}</span> : ${t(x.fresh ? 'bkAskNew' : 'bkAskOld', x.deck.cards.length, x.replaced, x.added)}${x.late ? ` ${t('bkAskLate', x.late)}` : ''}</li>`).join('')}</ul>
        <div class="row"><button class="primary" data-action="backup-yes">${t('bkYes')}</button><button class="secondary" data-action="backup-no">${t('cancel')}</button></div></div>` : ''}
      <div class="stack"><button class="secondary" data-action="backup">${t('bkSave')}</button>
      <label class="secondary filebtn">${t('bkRestore')}<input type="file" class="vh" data-file="backup" accept=".json,application/json"></label></div>
    </details>`;
}

// ---------- Course : la fluidité ----------
// Soixante secondes sur des mots déjà rencontrés : retrouver vite un mot connu. La course ne déplace aucune fiche et ne
// compare l'étudiant qu'à lui-même : la souris court au rythme de son record, l'éléphant avance à chaque bonne réponse.
const RACE_MS = 60000;
let raceTimer = null;
function stopRace() { clearInterval(raceTimer); raceTimer = null; if (S.race && !S.race.over) S.race = null; }
function raceQuestion(r) {
  const pool = r.deck.cards.filter(c => !isNew(S.progress[r.deck.id][c.id]) && c.id !== r.card?.id);
  for (let i = 0; i < 12; i++) {
    const card = pool[Math.floor(Math.random() * pool.length)], a = card && buildActivity(r.deck, card, 2, Math.random, { force: 'qcm-rev' });
    if (a?.options) { r.card = card; r.activity = a; r.flash = null; return; }
  }
  r.over = true;
}
function startRace(id) {
  const deck = S.decks.find(d => d.id === id), P = S.progress[id]; deck.help = helpFor(deck);
  const best = P._race?.best || 0;
  S.race = { deck, score: 0, miss: 0, missed: [], goal: Math.max(10, Math.min(30, best + 1)), best, startAt: Date.now(), over: false };
  raceQuestion(S.race); S.view = 'race'; S.session = null; S.notice = null; window.scrollTo?.(0, 0); render();
  clearInterval(raceTimer);
  raceTimer = setInterval(() => {
    const r = S.race; if (!r || r.over || S.view !== 'race') return clearInterval(raceTimer);
    const left = Math.max(0, 1 - (Date.now() - r.startAt) / RACE_MS), bar = app.querySelector('.racetime span'), hare = app.querySelector('.hare');
    if (bar) bar.style.width = (100 * left).toFixed(1) + '%';
    if (hare) hare.style.left = (12 + 76 * (1 - left)).toFixed(1) + '%';
    if (!left) endRace(false);
  }, 200);
}
const raceGain = r => Math.max(0, r.score - r.miss / 2);
function endRace(won) {
  const r = S.race; if (!r || r.over) return;
  clearInterval(raceTimer); r.over = true; r.won = won;
  const P = S.progress[r.deck.id], old = P._race || {};
  r.record = r.score > (old.best || 0);
  P._race = { best: Math.max(old.best || 0, r.score), runs: (old.runs || 0) + 1 }; saveProgress(r.deck.id);
  sfx(won ? 'trumpet' : 'birds'); render();
}
function racePick(i) {
  const r = S.race; if (!r || r.over || r.flash) return;
  const picked = r.activity.options[i]; if (picked === undefined) return;
  if (picked === r.activity.answer) {
    r.score++; sfx('pop');
    if (raceGain(r) >= r.goal) return endRace(true);
    raceQuestion(r); render();
  } else {                                  // une erreur coûte un demi-pas et le temps de lire la bonne réponse
    r.miss++; if (!r.missed.includes(r.card.id)) r.missed.push(r.card.id);
    r.flash = picked; sfx('steps'); render();
    setTimeout(() => { if (S.race === r && !r.over) { raceQuestion(r); render(); } }, 900);
  }
}
function raceView() {
  const r = S.race, lang = r.deck.lang, pos = Math.min(88, 5 + 83 * raceGain(r) / r.goal), left = Math.max(0, 1 - (Date.now() - r.startAt) / RACE_MS);
  if (r.over) {
    return `<div class="card done">${mascot(104, r.won ? 'joy' : 'idle', 4)}
      <h2>${t(r.won ? 'raceWon' : 'raceLost')}</h2>
      <p class="big">${t('raceScore', r.score)}</p>
      <p>${r.record ? t('raceRecord') : t('raceBestLine', Math.max(r.best, r.score))}</p>
      ${r.missed.length ? `<p><span class="label">${t('doneAgain')}</span><br>${r.missed.map(id => `<span class="chip" lang="${lang}">${esc(r.deck.byId[id].word)}</span>`).join(' ')}</p>` : ''}
      ${r.miss ? '' : `<p class="win">${t('raceClean')}</p>`}
      <p class="quip">${t('raceNote')}</p>
      <div class="row"><button class="secondary" data-action="race" data-id="${r.deck.id}">${t('raceAgain')}</button><button class="primary" data-action="home" autofocus>${t('home')}</button></div></div>`;
  }
  const a = r.activity, card = r.card;
  return `<div class="bar"><button class="icon" data-action="home" aria-label="${t('quit')}" title="${t('quit')}">✕</button>
      <div class="racetime" role="timer" aria-label="${t('raceTime')}"><span style="width:${(100 * left).toFixed(1)}%"></span></div><span class="racescore" aria-label="${t('raceScore', r.score)}">${r.score}</span></div>
    <div class="track" aria-hidden="true"><span class="finish">${GRASS}</span><span class="hare" style="left:${(12 + 76 * (1 - left)).toFixed(1)}%">${mouse(34)}</span><span class="runner" style="left:${pos.toFixed(1)}%">${mascot(40, 'joy', 3)}</span></div>
    <div class="card study racecard" style="--th:${hue(card.theme)}"><p class="question">${t('raceQ')} <span class="meta">${t('raceGoal', r.goal)}</span></p>
      ${card.image ? `<img class="illus small" src="${esc(card.image)}" alt="">` : ''}<p class="def big" lang="${card.definition ? lang : ''}">${esc(gloss(card, r.deck.help) || meaning(card, r.deck.help))}</p>
      <div class="options">${a.options.map((o, i) => {
        const cls = r.flash ? (o === a.answer ? 'right' : o === r.flash ? 'wrong' : '') : '';
        return `<button class="option ${cls}" data-action="race-pick" data-i="${i}" ${r.flash ? 'disabled' : ''} lang="${lang}"><kbd>${i + 1}</kbd> ${esc(o)}</button>`;
      }).join('')}</div></div>`;
}

// ---------- Session ----------

function startSession(id, force = false, mode = '') {
  const deck = S.decks.find(d => d.id === id);
  deck.help = helpFor(deck);
  let plan = null;
  if (planned(deck)) {
    // Plan personnel : pas de séance sans pas choisi ; la séance contient le programme du jour, ou ce qu'il en reste.
    const P = S.progress[id]; if (!P._plan) return openPlace(id);
    const now = Date.now(), T = ensureDay(deck), weak = weakIds(deck, P, now), small = P._plan.small === true;
    if (T.complete) {      // journée faite : seule la seconde séance (mots ratés ou aidés du jour) peut encore s'ouvrir
      if (mode !== 'second' || !weak.length) return render();
      plan = { fresh: 0, dueBy: -1, again: weak };
    } else {
      P._plan.ack = missedNow(P._plan, T.d);      // commencer sans choisir, après un jour manqué : la fin du plan ne bouge pas
      // Reprise générale : ses fiches s'ajoutent aux révisions. Séances courtes : cinq mots nouveaux et dix révisions au
      // plus, et les mots ratés ou aidés de la séance précédente reviennent en tête de la suivante.
      plan = { fresh: T.freshLeft, dueBy: dayEnd(now), also: T.recap ? staleIds(deck, P, now) : [], again: small ? weak : [], chunk: small ? SMALL : null };
    }
  }
  S.stageBefore = summary(deck, S.progress[id]).stage;
  // Mode essai : ni frein sur les nouveaux mots, ni fin de session à l'heure (l'enseignant examine chaque écran à son rythme).
  S.session = new Session(deck, S.progress[id], { minutes: S.sandbox ? 600 : S.minutes, maxNew: newFor(id), force: force || S.sandbox, audio: canListen(deck), plan });
  S.view = 'session'; S.notice = null; S.stepAt = 0;
  advance();
  store.keep();                            // demande au navigateur de ne pas effacer la progression s'il manque de place
  if (S.session?.held) toast(t('heldNew'));
}

function startChallenge(id, stage) {
  const deck = S.decks.find(d => d.id === id), P = S.progress[id];
  deck.help = helpFor(deck);
  const [a, b] = stageOf(deck, P).bounds[stage - 1];
  S.session = new Challenge(deck, P, deck.cards.slice(a, b));
  S.chStage = stage; S.view = 'session'; S.notice = null; S.stepAt = 0;
  advance();
}

// Aperçu : un exemple de chaque exercice, tout de suite. Sans lui, les exercices des boîtes 2 à 5 ne se voient qu'après plusieurs jours.
function startTour(id) {
  const deck = S.decks.find(d => d.id === id);
  deck.help = helpFor(deck);
  S.session = new Tour(deck, S.progress[id]);
  S.view = 'session'; S.notice = null; S.stepAt = 0;
  advance();
}

function advance() {
  dropRecording(); S.feedback = null; S.local = null; S.gate = false;
  // Mesure locale : durée de l'étape qui s'achève (découverte ou question, retour compris), dans une vraie séance seulement.
  if (S.stepAt && S.step && !S.session.challenge) addTime(S.measure, Date.now() - S.stepAt);
  S.step = S.session.next();
  S.stepAt = S.step ? Date.now() : 0;
  if (!S.step) {
    if (!S.session.challenge) saveMeasure();
    const id = S.session.deck.id;
    if (S.session.friendly) { const st = S.session.stats, old = S.progress[id]._match || {}; S.progress[id]._match = { best: Math.max(old.best || 0, st.ok), runs: (old.runs || 0) + 1 }; }
    else if (S.session.challenge && !S.session.tour) { S.chWon = S.session.stats.answered - S.session.stats.ok <= 1; if (S.chWon) (S.progress[id]._stages ??= {})[S.chStage] = Date.now(); }
    S.view = 'done'; saveProgress(id); sfx(S.session.challenge ? 'trumpet' : 'birds');
  } else if (S.step.intro) { saveProgress(S.session.deck.id); autoSpeak(); }
  render();
  if (S.step?.activity?.listen) speak(S.step.card, S.session.deck.lang, { auto: true, say: S.step.activity.say });      // exercice d'écoute : le mot est dit dès l'affichage
}

function sentence(cl, lang, reveal) {
  return `<p class="sentence" lang="${lang}">${clozeParts(cl).map(p => (p.blank
    ? (reveal ? `<mark>${esc(p.text)}</mark>` : `<span class="gap" aria-label="…">${'&nbsp;'.repeat(Math.max(6, p.text.length + 2))}</span>`)
    : esc(p.text))).join('')}</p>`;
}

const listenBtn = card => `<button class="icon" data-action="speak" data-id="${card.id}" aria-label="${t('listen')}" title="${t('listen')}">${ICON.sound}</button>`;
// Registre : nom dans la langue de l'interface, et note (i) qui explique les sept registres à l'étudiant.
const regKey = r => 'reg_' + REGISTERS.indexOf(r);
const regName = r => (REGISTERS.includes(r) ? t(regKey(r)) : esc(r));
// Point (i) : une explication rangée derrière un rond « i », dans le coin supérieur droit de son encart ou de son titre. Ce qui est
// nécessaire pour agir reste écrit en clair ; le (i) ne porte que le détail et le pourquoi. Jamais dans un bouton : un bouton logé
// dans un bouton est inutilisable au clavier et avec un lecteur d'écran.
const infoNote = (text, about) => `<details class="infonote"><summary><span class="info" aria-hidden="true">i</span><span class="vh">${esc(t('moreAbout', about))}</span></summary><p class="infobox">${text}</p></details>`;
const regNote = c => `<details class="reginfo"><summary><span class="chip">${regName(c.register)}</span><span class="info" aria-hidden="true">i</span><span class="vh">${t('regWhat')}</span></summary>
  <div class="regbox"><p>${t('regIntro')}</p><dl>${REGISTERS.map(r => `<dt${r === c.register ? ' class="on"' : ''}>${t(regKey(r))}</dt><dd>${t(regKey(r) + 'Def')}</dd>`).join('')}</dl></div></details>`;
const chips = c => `<div class="chips">${c.theme ? `<span class="chip theme">${esc(c.theme)}</span>` : ''}${c.register ? regNote(c) : ''}</div>`;
const illus = c => (c.image ? `<img class="illus" src="${esc(c.image)}" alt="">` : '');
// Image d'appui, plus petite : partout où l'indice donné est le sens du mot, l'image l'accompagne.
const pic = c => (c.image ? `<img class="illus mid" src="${esc(c.image)}" alt="">` : '');
// Phrase avec le mot étudié en gras.
const boldIn = (text, cloze, lang) => `<span lang="${lang}">${cloze ? clozeParts(cloze).map(p => (p.blank ? `<b class="target">${esc(p.text)}</b>` : esc(p.text))).join('') : esc(text)}</span>`;

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
    const mark = cls === 'right' ? ' <span class="mark">✓</span>' : cls === 'wrong' ? ' <span class="mark">✗</span>' : '';
    if (a.pics) return `<button class="option pic ${cls}" data-action="choose" data-i="${i}" ${fb ? 'disabled' : ''} aria-label="${esc(o)}"><kbd>${i + 1}</kbd><img src="${esc(a.pics[o])}" alt=""><span class="cap${fb ? ' on' : ''}" lang="${lang}">${esc(o)}</span>${mark}</button>`;
    return `<button class="option ${cls}" data-action="choose" data-i="${i}" ${fb ? 'disabled' : ''} lang="${lang}"><kbd>${i + 1}</kbd> ${esc(o)}${mark}</button>`;
  }).join('')}</div>${fb ? '' : skip}`;
  // Écoute : un gros bouton pour réentendre le mot, et une sortie pour qui ne peut pas écouter maintenant.
  const ear = `<p class="earrow"><button type="button" class="earbtn" data-action="speak" data-id="${card.id}" aria-label="${t('listenAgain')}">${bird(30)}${ICON.sound} <span>${t('listenAgain')}</span></button></p>`;
  const quiet = fb ? '' : `<button type="button" class="link" data-action="cant-listen">${t('cantListen')}</button>`;
  const selfRow = `<p class="askline">${t(a.type === 'speak' ? 'selfSpeak' : a.type === 'recall' ? 'selfRecall' : 'selfSentence')}</p><div class="row felt"><button class="primary" data-action="self" data-v="good">${t('selfGood')}</button><button class="secondary" data-action="self" data-v="again">${t('selfAgain')}</button></div>
    ${a.type === 'recall' ? '' : `<button type="button" class="link" data-action="self-retry">${t(a.type === 'speak' ? 'speakRetry' : 'sentenceRetry')}</button>`}`;
  // Rappel de tête : l'étudiant cherche d'abord sa réponse, les choix n'arrivent qu'ensuite pour la vérifier.
  const gate = () => `<div class="gate"><p>${t('gateWord')}</p>
    <div class="row"><button class="primary" data-action="reveal" autofocus>${t('reveal')}</button>${skip}</div></div>`;
  const choice = () => (a.gated && !S.gate && !fb ? gate() : options());
  const hint = `<div class="hint"><span class="tag">${t('hint')}</span>${card.image ? `<img class="hintimg" src="${esc(card.image)}" alt="">` : ''}${sense(card, lang, 'hintdef')}</div>`;
  let body;
  if (a.type === 'qcm') body = `<p class="question">${t('qMeaning')}</p><h2 class="word" lang="${lang}">${esc(card.bare)} ${listenBtn(card)}</h2>${options()}`;
  else if (a.type === 'listen') body = `<p class="question">${t('qListen')}</p>${ear}${fb ? `<h2 class="word" lang="${lang}">${esc(card.bare)}</h2>` : ''}${options()}${quiet}`;
  else if (a.type === 'speak') {
    // Oral : l'étudiant dit la phrase entière, qu'il a sous les yeux ; il écoute ensuite le modèle, compare avec sa voix,
    // puis répète en même temps que la voix (shadowing). Tout porte sur la même phrase, du début au retour.
    const can = !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder) && !L.noMic, phrase = `<p class="saythis">${boldIn(a.model, a.cloze, lang)}</p>`;
    body = !L.phase && !fb ? `<p class="question">${t('qSpeak')}</p>${pic(card)}${phrase}
        <div class="stack">${L.recording ? `<button class="primary rec on" data-action="rec-stop">${ICON.stop} ${t('recStop')}</button>` : `${can ? `<button class="primary rec" data-action="rec-start">${ICON.mic} ${t('recStart')}</button>` : ''}<button class="${can ? 'secondary' : 'primary'}" data-action="reveal-self">${t('saidIt')}</button>`}</div>
        ${L.recording ? `<p class="again" role="status">${t('recOn')}</p>` : `<p class="sethint oral">${t(can ? 'recHint' : 'noRecHint')}</p>`}${quiet}`
      : `<p class="question">${t('qSpeakCheck')}</p>${pic(card)}${phrase}
        <ol class="steps">
          <li><span class="meta">${t('stepModel')}</span><button type="button" class="secondary" data-action="say-sentence">${ICON.sound} ${t('hearModel')}</button></li>
          ${L.rec ? `<li><span class="meta">${t('stepMine')}</span><audio controls src="${esc(L.rec)}"></audio></li>` : ''}
          <li><span class="meta">${t('shadowHow')}</span><button type="button" class="secondary" data-action="shadow">${ICON.play} ${t('shadowGo')}</button></li>
        </ol>
        ${fb ? '' : selfRow}`;
  } else if (a.type === 'recall') {
    // Rappel de tête : dernier recours quand la fiche ne peut être ni choisie parmi des mots de sa catégorie, ni écrite.
    body = !L.phase && !fb ? `<p class="question">${t('qRecall')}</p>${illus(card)}${sense(card, lang, 'def big')}
        <div class="row"><button class="primary" data-action="reveal-self">${t('seeAnswer')}</button>${skip}</div>`
      : `<p class="question">${t('qRecallCheck')}</p>${pic(card)}<h2 class="word" lang="${lang}">${esc(card.bare)} ${listenBtn(card)}</h2>${sense(card, lang)}${fb ? '' : selfRow}`;
  } else if (a.type === 'sentence') {
    // Phrase libre : l'étudiant compose sa phrase, puis la compare aux phrases modèles et se juge lui-même.
    body = !L.phase && !fb ? `<p class="question">${t('qSentence')}</p>${pic(card)}<h2 class="word" lang="${lang}">${esc(card.bare)} ${listenBtn(card)}</h2>${sense(card, lang)}
        <label class="mysentence">${t('mySentence')}<textarea name="mine" rows="2" lang="${lang}" autocomplete="off" autocapitalize="sentences" spellcheck="false" data-keep="mine">${esc(L.mine || '')}</textarea></label>
        ${keyRow(S.session.deck, lang)}
        <div class="row"><button class="primary" data-action="reveal-self">${t('seeModel')}</button>${skip}</div>`
      : `<p class="question">${t('qSentenceCheck')}</p>${L.mine ? `<p class="mine"><span class="meta">${t('yours')}</span><span lang="${lang}">${esc(L.mine)}</span></p>` : ''}
        <ul class="models">${a.models.map((m, i) => `<li><button type="button" class="icon small" data-action="say-model" data-i="${i}" aria-label="${t('listen')}">${ICON.sound}</button> ${boldIn(m, a.modelClozes?.[i], lang)}</li>`).join('')}</ul>
        ${fb ? '' : selfRow}`;
  }
  else if (a.type === 'qcm-rev') body = `<p class="question">${t('qWord')}</p>${illus(card)}${sense(card, lang, 'def big')}${choice()}`;
  else if (a.type === 'cloze-choice') body = `<p class="question">${t('qCloze')}</p>${sentence(a.cloze, lang, !!fb)}${hint}${choice()}`;
  else if (a.type === 'situation') body = `<p class="question">${t('qSituation')}</p>${pic(card)}<p class="situation">${esc(a.situation)}</p>${options()}`;
  else if (a.type === 'order') {
    const picked = L.picked || [], lock = L.lock || 0, by = k => a.chunks.find(c => c.k === k);
    // Dans la phrase en construction, le premier morceau reçoit sa majuscule et la ponctuation s'ajoute toute seule :
    // les morceaux à choisir, eux, ne donnent aucun indice sur le début ni sur la fin.
    const up = x => x.charAt(0).toUpperCase() + x.slice(1);
    const chip = (c, fixed, first) => `<button type="button" class="chunk${fixed ? ' locked' : ''}" data-action="chunk" data-k="${c.k}" lang="${lang}" ${fb || fixed ? 'disabled' : ''}>${esc(first ? up(c.text) : c.text)}</button>`;
    const punct = x => (x ? `<span class="punct" lang="${lang}">${esc(x)}</span>` : '');
    body = `<p class="question">${t('qOrder')}</p>${pic(card)}
      <div class="line" data-zone="line" role="group" aria-label="${t('yourSentence')}">${fb ? `<span lang="${lang}">${esc(a.answer)}</span>` : picked.length ? punct(a.lead) + picked.map((k, i) => chip(by(k), i < lock, i === 0)).join('') + punct(a.tail) : `<span class="placeholder">${t('tapWords')}</span>`}</div>
      ${fb ? '' : `<div class="bank" data-zone="bank">${a.chunks.filter(c => !picked.includes(c.k)).map(c => chip(c)).join('')}</div>
      ${L.again ? `<p class="again" role="status">${t('orderAgain')}</p>` : ''}
      <div class="row"><button class="primary" data-action="check-order" ${picked.length === a.chunks.length ? '' : 'disabled'}>${t('validate')}</button>${skip}</div>`}`;
  } else {
    // Réponse courte écrite : un mot ou une expression. L'aide dépend du niveau du paquet ; la forme exacte est exigée partout (voir judge).
    const typed = `<form class="typed" data-submit="typed">
      <label>${t('answerLabel')} <input name="answer" maxlength="200" lang="${lang}" ${a.type === 'number' ? 'inputmode="numeric"' : ''} autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" ${fb ? `disabled value="${esc(fb.typed ?? '')}"` : `autofocus value="${esc(L.value || '')}"`}></label>
      ${fb || a.type === 'number' ? '' : keyRow(S.session.deck, lang)}
      ${a.hint && !fb ? `<p class="helpline"><span class="tag">${t('hintLabel')}</span> <span class="letters" lang="${lang}">${esc(a.hint)}</span></p>` : ''}
      ${L.again && !fb ? `<p class="again" role="status">${againText(L)}</p>` : ''}
      ${fb ? '' : `<div class="row"><button class="primary">${t('validate')}</button>${skip}</div>`}</form>`;
    if (a.type === 'cloze-type') body = `<p class="question">${t('qClozeType')}</p>${sentence(a.cloze, lang, !!fb)}${hint}${typed}`;
    else if (a.type === 'listen-type') body = `<p class="question">${t('qListenType')}</p>${ear}${typed}${quiet}`;
    else if (a.type === 'situation-type') body = `<p class="question">${t('qSitType')}</p>${pic(card)}<p class="situation">${esc(a.situation)}</p>${sentence(a.cloze, lang, !!fb)}${typed}`;
    else if (a.type === 'type') body = `<p class="question">${t(a.art ? 'qTypeArt' : 'qType')}${a.ask === 'm' || a.ask === 'f' ? ` <span class="formtag">${t('ask_' + a.ask)}</span>` : ''}</p>${illus(card)}${sense(card, lang, 'def big')}${typed}`;
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
  // Premier essai sans indice : il faut lire la phrase. Si une phrase est manquée, son indice de sens (image, traduction)
  // apparaît et l'étudiant réessaie une fois : un mot manquant contestable ne coûte donc jamais la réponse.
  const kept = L.kept || [];
  const cue = it => { const c = S.session.deck.byId[it.id]; return `<span class="cue" lang="">${c.image ? `<img src="${esc(c.image)}" alt="">` : ''}${esc(gloss(c, S.session.deck.help) || meaning(c, S.session.deck.help))}</span>`; };
  const rows = a.items.map((it, i) => `<li>${fb ? `<button type="button" class="icon small" data-action="say-line" data-i="${i}" aria-label="${t('listen')}">${ICON.sound}</button> ` : ''}${clozeParts(it.cloze).map(p => (!p.blank ? esc(p.text)
    : fb ? `<mark>${esc(p.text)}</mark> <span class="mark">${(L.missed || []).includes(it.id) ? '✗' : '✓'}</span>`
      : `<button type="button" class="slot${i === cur ? ' cur' : ''}" data-action="bank-gap" data-i="${i}" aria-label="${t('gapN', i + 1)}" ${kept.includes(i) ? 'disabled' : ''}>${fill[i] === null ? '&nbsp;'.repeat(9) : esc(a.bank[fill[i]])}</button>`)).join('')}${fb || (L.cue || []).includes(i) ? cue(it) : ''}</li>`).join('');
  return `<div class="card study" style="--th:${hue(step.card.theme)}"><p class="question">${t('qBank')}</p>
    <ol class="banklist" lang="${lang}">${rows}</ol>
    ${L.again && !fb ? `<p class="again" role="status">${t('bankAgain')}</p>` : ''}
    ${fb ? '' : `<div class="bank">${a.bank.map((w, k) => `<button type="button" class="chunk" data-action="bank-word" data-k="${k}" lang="${lang}" ${fill.includes(k) ? 'disabled' : ''}>${esc(w)}</button>`).join('')}</div>
    <div class="row"><button class="primary" data-action="check-bank" ${fill.includes(null) ? 'disabled' : ''}>${t('validate')}</button></div>`}</div>${fb ? feedbackView(step, lang) : ''}`;
}

function feedbackView(step, lang) {
  const { card, activity: a } = step, fb = S.feedback, s = S.session, help = s.deck.help;
  const plc = !!s.placement, title = plc ? t(fb.ok ? 'plcYes' : 'plcNo') : fb.ok ? t(['ok1', 'ok2', 'ok3'][fb.n % 3]) : a.multi ? t('almost') : t('no');
  if (a.multi) {
    const missed = (S.local?.missed || S.local?.errors || []).map(id => s.deck.byId[id]);
    return `<div class="card feedback ${fb.ok ? 'good' : 'soft'}" role="status" aria-live="polite"><h3>${title}</h3>
      ${missed.length ? `<p>${t('toReview')}</p><ul class="missed">${missed.map(c => `<li><b lang="${lang}">${esc(c.bare)}</b> : ${esc(meaning(c, help))}</li>`).join('')}</ul>` : ''}
      <button class="primary" data-action="next" autofocus>${t('next')}</button></div>`;
  }
  // Un retour qui explique : ce que voulait dire la réponse choisie, ou les lettres sur lesquelles on s'est trompé.
  const other = !fb.ok && fb.chosen && a.from?.[fb.chosen] ? s.deck.byId[a.from[fb.chosen]] : null;
  const explain = !other ? '' : a.type === 'qcm' || a.type === 'listen' ? t('exMeaning', other.bare) : a.type === 'situation' ? t('exSituation', other.bare) : t('exWord', fb.chosen, meaning(other, help));
  const note = ['article', 'form', 'variant', 'open'].includes(fb.note) ? t({ article: 'noteArticle', form: 'noteForm', variant: 'noteVariant', open: 'noteOpen' }[fb.note], fb.shown) : '';
  // Réponse écrite à une lettre ou à un accent près, manquée au second essai : on montre l'endroit de l'écart dans la bonne orthographe.
  let sp = null;
  if (a.cloze && fb.typed && fb.near) { const d = diffParts(a.answer.toLowerCase(), fb.typed.trim().toLowerCase()), i = d[0].length, j = i + d[1].length; sp = [a.answer.slice(0, i), a.answer.slice(i, j), a.answer.slice(j)]; }
  const ex = a.type === 'order' ? '' : a.type === 'speak' ? a.model : card.examples.find(e => !a.cloze || e.replace(/[’`´]/g, "'") !== a.cloze.text) || card.examples[0];
  const move = fb.retry || plc ? '' : fb.boxAfter > fb.boxBefore ? t('boxUp', fb.boxAfter) : fb.boxAfter < fb.boxBefore ? t('boxDown', fb.boxAfter) : '';
  const when = s.challenge || plc || fb.ask ? '' : fb.ok && !fb.retry ? t('nextIn', Math.max(1, fb.days)) : fb.ok ? '' : t('nextSoon');
  const wins = plc ? (fb.ok ? [t('plcJoined')] : []) : [fb.joined ? t('joined') : '', fb.tamed ? t('tamed', card.word, s.tamed.length, s.today.length) : '',
    fb.ok && [3, 5, 10].includes(s.stats.streak) ? t('streak', s.stats.streak) : ''].filter(Boolean);
  return `<div class="card feedback ${fb.ok ? 'good' : 'soft'}" role="status" aria-live="polite">
    <h3>${title}</h3>
    ${wins.length ? `<p class="win">${mascot(44, 'joy', Math.max(1, fb.boxAfter))}<span>${wins.map(esc).join('<br>')}</span></p>` : ''}
    ${fb.ok ? '' : plc ? `<p class="explain">${t('plcLater')}</p>` : `<p class="oopsrow">${mascot(46, 'oops', Math.max(1, fb.boxAfter))}<span>${fb.pun ? esc(t('puns')[fb.n % t('puns').length]) : ''}</span></p>`}
    ${explain ? `<p class="explain">${esc(explain)}</p>` : ''}
    ${note ? `<p class="explain">${esc(note)}</p>` : ''}
    ${sp ? `<p class="spelling" lang="${lang}">${esc(sp[0])}<mark>${esc(sp[1])}</mark>${esc(sp[2])}</p>` : ''}
    <p class="recap">${card.image ? `<img class="recapimg" src="${esc(card.image)}" alt="">` : ''}<b lang="${lang}">${esc(card.word)}</b> ${listenBtn(card)}</p>
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
  if (S.session.challenge || S.session.placement) { cheer(commit(result, extra)); return render(); }      // défi, aperçu, preuve du « déjà su » : rien à déclarer
  const box = boxOf(S.session.progress[S.step.card.id]);
  S.feedback = { ...result, ...extra, ask: true, retry: true, boxBefore: box, boxAfter: box, days: 0, n: S.session.served };
  sfx('pop'); autoSpeak(); render();
}

function commit(result, extra = {}) {
  const step = S.step, s = S.session, before = boxOf(s.progress[step.card.id]);
  const st = s.answer(step, result.ok, undefined, { assisted: extra.assisted, hesitated: extra.hesitated, chosen: result.ok || extra.lucky ? null : extra.chosen, missed: extra.missed });
  // Mesure locale : seule la première réponse à une question compte pour le taux de réussite, jamais un rattrapage.
  if (!s.challenge && !s.placement && !step.activity.multi && !step.item.retry) { addTry(S.measure, !!result.ok); saveMeasure(); }      // les mots cochés « déjà sus » ne disent rien du taux de réussite
  if (s.planned && s.progress._plan && !step.activity.multi) markWorked(s.progress._plan);      // la journée est travaillée ; les jours manqués sont constatés
  const after = boxOf(st), retry = !!s.challenge || (!!step.item.retry && after === before);
  S.feedback = { ...result, ...extra, retry, boxBefore: before, boxAfter: after, days: dueInDays(st), n: s.served,
    tamed: s.lastTamed, joined: before < HERD_BOX && after >= HERD_BOX, pun: !result.ok && !s.placement && !step.activity.multi && (S.errors = (S.errors || 0) + 1) % 3 === 1 };
  saveProgress(s.deck.id); autoSpeak();
  return S.feedback;
}
const cheer = fb => sfx(!fb.ok ? 'steps' : fb.tamed || fb.joined ? 'trumpet' : 'pop');

// Touches des lettres accentuées et des signes, sous le champ de réponse : puisque la forme exacte est exigée, tout
// ce qu'il faut pour l'écrire est à portée de doigt, quel que soit le clavier. Les touches de la langue du paquet,
// puis toute autre lettre latine spéciale présente dans ses mots et ses exemples (un paquet d'anglais qui contient « café »
// reçoit la touche « é »). Rien pour un paquet sans lettre spéciale.
// Le calcul est fait une fois par session (le paquet ne change pas pendant qu'on joue).
const KEYS = { fr: 'éèàêçùâîôûëïüœ', es: 'áéíóúüñ¿¡' }, KEYS_MAX = 20, keyCache = new WeakMap();
function accentKeys(deck) {
  const owner = S.session || deck;
  if (keyCache.has(owner)) return keyCache.get(owner);
  const keys = [...(KEYS[String(deck.lang || '').slice(0, 2)] || '')];
  for (const c of deck.cards || []) {
    if (keys.length >= KEYS_MAX) break;
    for (const ch of `${c.word} ${(c.examples || []).join(' ')}`.normalize('NFC').toLowerCase()) {
      if (keys.length < KEYS_MAX && ch > '\u007f' && !keys.includes(ch) && (/^\p{Script=Latin}$/u.test(ch) || ch === '¿' || ch === '¡')) keys.push(ch);   // lettres latines seulement : un paquet en cyrillique ou en grec recevrait sinon vingt lettres ordinaires, qui souffleraient la réponse
    }
  }
  keyCache.set(owner, keys);
  return keys;
}
// Majuscule d'une touche, quand elle tient en un seul signe différent (« é » : « É » ; « ¿ » n'en a pas, « ß » en a deux).
const upKey = ch => { const u = ch.toUpperCase(); return u !== ch && [...u].length === 1 ? u : ''; };
function keyRow(deck, lang) {
  const keys = accentKeys(deck);
  if (!keys.length) return '';
  // Une majuscule garde son accent (« École », « Ça va ») : la touche « Maj » donne É, È, À, Ç… pour la lettre
  // suivante, comme sur un téléphone, puis la rangée revient d'elle-même aux minuscules.
  const shift = keys.some(upKey) ? `<button type="button" class="key shift" data-action="shift" aria-pressed="false" aria-label="${t('shiftLabel')}" title="${t('shiftLabel')}"><span aria-hidden="true">⇧</span></button>` : '';
  return `<div class="keys" role="group" aria-label="${t('keysLabel')}">${shift}${keys.map(ch => `<button type="button" class="key" data-action="key" data-ch="${esc(ch)}" data-low="${esc(ch)}" lang="${lang}">${esc(ch)}</button>`).join('')}</div>`;
}
// Bascule la rangée entre minuscules et majuscules, sans redessiner l'écran (le texte tapé et le curseur restent en place).
function shiftKeys(row, on) {
  if (!row) return;
  const b = row.querySelector('.key.shift'); if (!b) return;
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  for (const k of row.querySelectorAll('.key[data-low]')) { const low = k.dataset.low || '', ch = on ? upKey(low) || low : low; k.dataset.ch = ch; k.textContent = ch; }
}
// Écrit la lettre d'une touche à l'endroit du curseur, sans redessiner l'écran : le texte déjà tapé et le curseur restent en place.
function typeKey(b) {
  const el = b.closest('.study')?.querySelector('input[name="answer"], textarea[name="mine"]'), ch = b.dataset.ch || '';
  if (!el || el.disabled || [...ch].length !== 1) return;
  const from = el.selectionStart ?? el.value.length, to = el.selectionEnd ?? from;
  if (el.maxLength > 0 && el.value.length - (to - from) + ch.length > el.maxLength) return el.focus({ preventScroll: true });
  el.setRangeText(ch, from, to, 'end');
  el.focus({ preventScroll: true });
  shiftKeys(b.closest('.keys'), false);      // « Maj » ne vaut que pour une lettre
}

// Message du second essai : il dit quoi regarder, sans donner la réponse. Un écart d'article (oublié, ou qui ne va
// pas avec le mot) peut être le seul écart, ou s'ajouter à un autre : le message dit alors les deux, pour que
// l'étudiant ne corrige pas l'un et échoue sur l'autre.
function againText(L) {
  const art = L.article === 'wrong' ? 'wrong' : L.article === 'missing' ? 'missing' : '';
  const main = L.form ? t(L.form === 'm' || L.form === 'f' ? 'tryForm_' + L.form : 'tryForm')
    : L.accent ? (L.slip && L.slip !== 'accent' ? t('tryChar', esc(L.slip)) : t('tryAccent')) + (L.cap ? ' ' + t('tryCap') : '')
    : art ? '' : t('tryAgain');
  return main ? main + (art ? ' ' + t(art === 'wrong' ? 'alsoArtWrong' : 'alsoArtMissing') : '') : t(art === 'wrong' ? 'tryArtWrong' : 'tryArtMissing');
}

// Réponse courte écrite. Un écart d'une lettre, d'un accent ou d'un signe donne droit à un second essai, à tous les niveaux ;
// la réussite au second essai compte comme aidée (assisted).
function submitTyped(value) {
  const a = S.step.activity, L = S.local || {}, r = judge(value, a, S.session.deck, !!L.again);
  if (r.empty) return;
  if (r.retry) { S.local = { again: true, accent: r.accent, slip: r.slip, cap: r.cap, article: r.article, form: r.form, value }; sfx('steps'); return render(); }
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
  return `<div class="bar">
      <button class="icon" data-action="quit" aria-label="${t('quit')}" title="${t('quit')}">✕</button>
      ${mealBar(pct, S.feedback ? (S.feedback.ok ? 'joy' : 'oops') : 'idle', t('sessionBar'), s.today.length)}
    </div>
    ${(tag => tag ? `<p class="where"><span class="chip box">${tag}</span></p>` : '')(s.placement ? t('plcChip') : s.tour ? (s.box ? t('tourN', s.box) : t('tourAll')) : s.friendly ? t('fmChip') : s.challenge ? t('challengeN', S.chStage) : step.intro ? '' : step.activity.multi ? t('recap') : t('box', +box || 1))}
    ${step.intro ? introView(step.card, lang) : activityView(step, lang)}`;
}

function doneView() {
  if (S.session.tour) return `<div class="card done">${mascot(104, 'joy', 3)}<h2>${t('tourDone')}</h2><p>${t('tourNote')}</p>
    <div class="row"><button class="primary" data-action="teacher" autofocus>${t('eBack')}</button><button class="secondary" data-action="home">${t('home')}</button></div></div>`;
  if (S.session.friendly) {                // match amical : on compte les points, on se serre la trompe, personne ne perd rien
    const { stats, deck } = S.session, them = stats.answered - stats.ok;
    return `<div class="card done">
      <p class="duo" aria-hidden="true">${mascot(84, 'joy', 4)}${croc(64)}</p>
      <h2>${t(stats.ok > them ? 'fmWon' : stats.ok === them ? 'fmDraw' : 'fmLost')}</h2>
      <p class="big">${t('fmScore', stats.ok, them)}</p>
      ${stats.missed.length ? `<p><span class="label">${t('doneAgain')}</span><br>${stats.missed.map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ')}</p>` : ''}
      <p class="quip">${t('fmNote')}</p>
      <div class="row"><button class="secondary" data-action="friendly" data-id="${deck.id}">${t('fmAgain')}</button><button class="primary" data-action="home" autofocus>${t('home')}</button></div>
    </div>`;
  }
  if (S.session.challenge) {
    const { stats, deck } = S.session;
    return `<div class="card done">
      <div class="rain" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 11) % 96}%;animation-delay:${(i * 0.13).toFixed(2)}s;font-size:${1 + (i % 3) * 0.3}rem">${BLADE}</i>`).join('')}</div>
      ${mascot(104, S.chWon ? 'joy' : 'idle', 5)}
      <h2>${t(S.chWon ? 'chDone' : 'chTried', S.chStage)}</h2>
      <p class="win tuskwin">${tusks(44, S.chWon)}<span>${t(S.chWon ? 'chWon' : 'chAlmost')}</span></p>
      <p>${t('chStats', stats.ok, stats.answered)}</p>
      ${stats.missed.length ? `<p><span class="label">${t('doneAgain')}</span><br>${stats.missed.map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ')}</p>` : ''}
      <p class="quip">${t('chNote')}</p>
      <div class="row">${S.chWon ? '' : `<button class="secondary" data-action="challenge" data-id="${deck.id}" data-stage="${S.chStage}">${t('chRetry')}</button>`}<button class="primary" data-action="home" autofocus>${t('home')}</button></div>
    </div>`;
  }
  if (S.session.placement) {              // test « déjà su » : ce qui est prouvé rejoint le troupeau, le reste s'apprendra ; puis le choix du pas
    const { stats, deck } = S.session, left = deck.cards.filter(c => isNew(S.progress[deck.id][c.id])).length;
    return `<div class="card done">${mascot(104, stats.known.length ? 'joy' : 'idle', 4)}
      <h2>${t('plcDone')}</h2>
      ${stats.known.length ? `<p class="big">${t('plcKnownN', stats.known.length)}</p><p>${stats.known.map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ')}</p>` : `<p>${t('plcNone')}</p>`}
      <p>${t('plcLeft', left)}</p>
      <div class="row"><button class="primary" data-action="plan" data-id="${deck.id}" autofocus>${t('plChoose')}</button></div>
    </div>`;
  }
  const { stats, deck, tamed, today } = S.session, P = S.progress[deck.id];
  const words = ids => [...new Set(ids)].map(id => `<span class="chip" lang="${deck.lang}">${esc(deck.byId[id].word)}</span>`).join(' ');
  const T = S.session.planned ? ensureDay(deck) : null;
  const s = summary(deck, P), more = T ? !T.complete : s.due + pickNew(deck, P, newFor(deck.id)).length > 0, other = more ? null : nextList(deck.id);
  const stageDone = s.stage.count > 1 && (s.stage.index > S.stageBefore.index || (s.stage.allSeen && !S.stageBefore.allSeen));
  const line = (label, ids) => (ids.length ? `<p><span class="label">${t(label)}</span><br>${words(ids)}</p>` : '');
  return `<div class="card done">
    <div class="rain" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 37 + 11) % 96}%;animation-delay:${(i * 0.13).toFixed(2)}s;font-size:${1 + (i % 3) * 0.3}rem">${BLADE}</i>`).join('')}</div>
    ${mascot(104, 'joy', Math.min(5, 1 + Math.floor(summary(deck, P).memory * 5)))}
    <h2>${t('doneTitle')}</h2>
    ${tamed.length ? `<p class="big">${t('doneTamed', tamed.length)}</p>` : ''}
    <p>${stats.answered ? t('doneStats', stats.ok, stats.answered) : t('doneNone')}${stats.best >= 3 ? ' ' + t('doneBest', stats.best) : ''}</p>
    ${stageDone ? `<p class="win">${mascot(44, 'joy', 3)}<span>${t('stageDone', S.stageBefore.index)}</span></p>` : ''}
    <p class="label">${t('herdCount', s.animals.length)}</p>
    ${prairie(deck, s, [...today, ...stats.up])}
    <p class="quip">${t('quips')[(stats.answered + s.animals.length) % t('quips').length]}</p>
    ${line('doneHerd', stats.herd)}${line('doneUp', stats.up)}${line('doneAgain', stats.again)}
    ${T ? `<p class="win planwin">${trail(1)}<span>${T.complete ? t('plDayDone') : t('plDonePart', T.freshLeft, T.revLeft)}</span></p>` : ''}
    ${T?.complete && T.weak ? `<p class="pacenote">${t('plSecondWhy', T.weak)}</p>` : ''}
    ${S.session.held ? `<p class="heldline">${t('heldDone')} <button class="link" data-action="start-force" data-id="${deck.id}">${t('heldForce')}</button></p>` : ''}
    <div class="row">${more ? `<button class="secondary" data-action="start" data-id="${deck.id}">${t(T ? 'plResume' : 'again')}</button>` : ''}${T?.complete && T.weak ? `<button class="secondary" data-action="second" data-id="${deck.id}">${AGAIN} ${t('plSecond', T.weak)}</button>` : ''}${other ? `<button class="secondary" data-action="start" data-id="${other.deck.id}">${t('nextList', esc(other.deck.name), other.n)}</button>` : ''}<button class="primary" data-action="home" autofocus>${t('home')}</button></div>
    <button class="link" data-action="share">${t('share')}</button>
    <button class="link" data-action="remind">${ICON.bell} ${t('remDone')}</button>
  </div>`;
}

// ---------- Rendu et événements ----------

function render() {
  try { paint(); S.rescue = false; } catch (e) {
    S.rescue = true;
    // Écran de secours : revenir à l'accueil, ou retirer le paquet qui empêche l'affichage. La progression des autres est intacte.
    console.error(e);
    const onHome = S.view === 'home' || !S.view;
    app.innerHTML = `<div class="card"><h2>${esc(STR.fr.rescueTitle)}</h2><p>${esc(STR.fr.rescueText)}</p>
      ${onHome ? `<ul class="decklist">${S.decks.map(d => `<li><span>${esc(d.name)}</span><button class="link danger" data-action="rescue-del" data-id="${esc(d.id)}">${esc(STR.fr.rescueDel)}</button></li>`).join('')}</ul>` : `<button class="primary" data-action="home">${esc(STR.fr.home)}</button>`}</div>`;
  }
}
// Porte de l'espace enseignant : tant que le code n'a pas été saisi sur cet appareil, rien d'autre ne s'affiche.
function gateView() {
  const G = S.door || {};
  return `<div class="card gate-card">${mascot(96, 'idle', 2)}<h1>${t('gTitle')}</h1><p>${t('gLead')}</p>
    <form data-submit="gate" class="stack"><input name="username" autocomplete="username" value="enseignant" hidden><label>${t('gLabel')} <input name="code" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required ${G.busy ? 'disabled' : 'autofocus'}></label>
      ${G.error ? `<p class="again" role="alert">${t(G.error)}</p>` : ''}
      <button class="primary" ${G.busy ? 'disabled' : ''}>${t(G.busy ? 'gBusy' : 'gEnter')}</button></form>
    <p class="sethint">${t('gHelp')}</p>
    <p><a class="link" href="./">${t('gStudent')}</a></p></div>`;
}
// Dans l'espace enseignant : créer la ligne à ranger dans js/acces.js pour définir ou changer le code.
function accessCard() {
  const G = S.door || {}, on = validAccess(ACCESS);
  return `<details class="card more"${G.line || G.makeError ? ' open' : ''}><summary>${t('gCardTitle')} ${on ? `<span class="tag ok">${t('gOn')}</span>` : `<span class="tag warn">${t('gOff')}</span>`}</summary>
    <p>${t(on ? 'gCardOn' : 'gCardOff')}</p>
    <form data-submit="gate-make" class="stack"><input name="username" autocomplete="username" value="enseignant" hidden><label>${t('gNew')} <input name="code" type="password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" minlength="${MIN_CODE}" required><span class="sethint">${t('gNewHint', MIN_CODE)}</span></label>
      <label>${t('gNew2')} <input name="again" type="password" autocomplete="new-password" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
      ${G.makeError ? `<p class="again" role="alert">${t(G.makeError, MIN_CODE)}</p>` : ''}
      <button class="secondary">${t('gMake')}</button></form>
    ${G.line ? `<p>${t('gLineHow')}</p><textarea class="codeline" readonly rows="3" data-line>${esc(G.line)}</textarea><button class="secondary small" data-action="gate-copy">${t('copy')}</button>` : ''}
    <p class="sethint">${t('gLimits')}</p></details>`;
}
async function openGate(code) {
  S.door = { busy: true }; render();
  const fails = S.doorFails || 0;
  if (fails) await new Promise(r => setTimeout(r, Math.min(8000, 1000 * fails)));      // chaque erreur allonge l'attente
  let ok = false; try { ok = await checkAccess(code); } catch { ok = false; }
  if (ok) { S.locked = false; S.door = null; S.doorFails = 0; await store.set('access', ACCESS); }
  else { S.doorFails = fails + 1; S.door = { error: window.crypto?.subtle ? 'gWrong' : 'gNoCrypto' }; }
  render();
}
async function makeGate(code, again) {
  if (code !== again) S.door = { makeError: 'gDiffer' };
  else { try { S.door = { line: await makeAccess(code) }; } catch (e) { S.door = { makeError: e.message === 'short' ? 'gShort' : e.message === 'weak' ? 'gWeak' : 'gNoCrypto' }; } }
  render();
}
function paint() {
  if (S.locked) { document.documentElement.lang = 'fr'; app.innerHTML = gateView(); app.querySelector('[autofocus]')?.focus({ preventScroll: true }); return; }
  document.documentElement.lang = uiLang();
  const open = app.querySelector('details.settings')?.open;
  app.innerHTML = (S.sandbox && !['home', 'teacher'].includes(S.view || 'home') ? sandboxBar(false) : '') + (S.view === 'session' ? sessionView() : S.view === 'done' ? doneView() : S.view === 'teacher' ? teacherView() : S.view === 'rules' ? rulesView() : S.view === 'herd' ? herdView() : S.view === 'images' ? imagesView() : S.view === 'edit' ? editView() : S.view === 'sort' && TEACHER && S.decks.some(d => d.id === S.sortId) ? sortView() : S.view === 'card' ? cardView() : S.view === 'race' ? raceView() : S.view === 'privacy' ? privacyView() : S.view === 'plan' && S.decks.some(d => d.id === S.planId && planned(d)) && S.progress[S.planId] ? planView() : S.view === 'place' && S.decks.some(d => d.id === S.placeId && planned(d)) && S.progress[S.placeId] && !S.progress[S.placeId]._plan ? placeView() : home());
  if (open && app.querySelector('details.settings')) app.querySelector('details.settings').open = true;
  if (S.view === 'session' || S.view === 'done') {
    app.querySelector('[autofocus]')?.focus({ preventScroll: true });
    app.querySelector('.feedback')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
}

// Une confirmation n'est acceptée qu'un instant après la demande : un double-clic ne peut pas tout effacer par accident.
const armed = () => Date.now() - (S.armedAt || 0) >= 800;
app.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b || S.locked || sbBusy) return;      // porte fermée : aucun geste de l'appli n'est possible
  const { action, id, model } = b.dataset;
  if (action !== 'pace' && action !== 'pace-undo') S.paceUndo = null;      // « Annuler » ne vaut que juste après un changement de pas fait sur la carte
  if (action === 'start') startSession(id);
  else if (action === 'sb-on') { if (S.sandbox) { S.view = 'home'; S.notice = null; window.scrollTo?.(0, 0); render(); } else setSandbox(true); }
  else if (action === 'sb-off') setSandbox(false);
  else if (action === 'sb-skip') sandboxSkip(+b.dataset.days);
  else if (action === 'sb-reset') { if (!S.sandbox) return; S.confirmSb = true; S.armedAt = Date.now(); render(); }
  else if (action === 'sb-reset-yes') { if (!S.sandbox || !S.confirmSb || !armed()) return; sandboxReset(); }
  else if (action === 'gate-copy') { navigator.clipboard?.writeText(S.door?.line || '').then(() => toast(t('copied')), () => app.querySelector('[data-line]')?.select()); }
  else if (action === 'start-force') startSession(id, true);
  else if (action === 'plan') openPlan(id, b.dataset.own === '1');
  else if (action === 'pace') { if (S.view === 'plan') choosePace(S.planId, b.dataset.pace, S.ownDays); else if ((S.view || 'home') === 'home') {
      // Un toucher change de pas, sans confirmation : le plan d'avant est gardé, et la carte propose « Annuler ».
      const pl = S.progress[id]?._plan; if (!pl || pl.pace === b.dataset.pace) return;
      const keep = S.paceUndo?.id === id ? S.paceUndo : { id, plan: JSON.parse(JSON.stringify(pl)) };
      S.paceAnim = id; S.paceUndo = keep; choosePace(id, b.dataset.pace, 0, true); S.paceAnim = null;
      const now = S.progress[id]?._plan; if (!now || (now.pace === keep.plan.pace && now.days === keep.plan.days)) { S.paceUndo = null; render(); }
      app.querySelector(`.pacepick[data-id="${CSS.escape(id || '')}"][aria-pressed=true]`)?.focus();
    }
  }
  else if (action === 'pace-new') {      // paquet sans jours conseillés : le pas règle les mots nouveaux par séance, pour ce paquet seulement
    const P = Object.hasOwn(S.progress, id) ? S.progress[id] : null, n = Object.hasOwn(NEW_BY_PACE, b.dataset.pace) ? NEW_BY_PACE[b.dataset.pace] : 0;
    if ((S.view || 'home') !== 'home' || !P || !n || !S.decks.some(x => x.id === id && !planned(x)) || newFor(id) === n) return;
    P._new = { n }; saveProgress(id); S.paceSaid = id; render(); S.paceSaid = null;
    app.querySelector(`.pacepick[data-id="${CSS.escape(id || '')}"][aria-pressed=true]`)?.focus();
  }
  else if (action === 'pace-undo') {
    const u = S.paceUndo, P = S.progress[id]; S.paceUndo = null;
    if ((S.view || 'home') !== 'home' || !u || u.id !== id || !P?._plan || !S.decks.some(x => x.id === id && planned(x))) return;
    P._plan = u.plan; saveProgress(id); S.paceAnim = id; render(); S.paceAnim = null;
    app.querySelector(`.pacepick[data-id="${CSS.escape(id || '')}"][aria-pressed=true], .pathbtn[data-id="${CSS.escape(id || '')}"]`)?.focus();
  }
  else if (action === 'own-open' || action === 'own-step') {
    const d = S.view === 'plan' ? S.decks.find(x => x.id === S.planId) : null; if (!d || !planned(d)) return;
    S.ownDays = action === 'own-open' ? Math.min(d.days, 3) : Math.min(d.days, Math.max(1, (S.ownDays || 1) + (b.dataset.v === '1' ? 1 : -1)));
    render(); app.querySelector(action === 'own-open' ? '.ownbox .stepper button:not([disabled])' : `.ownbox [data-action=own-step][data-v="${b.dataset.v === '1' ? '1' : '-1'}"]:not([disabled]), .ownbox .stepper button:not([disabled])`)?.focus();
  }
  else if (action === 'moment') { const m = MOMENTS.find(x => x[0] === b.dataset.v); if (!m || S.view !== 'plan') return; S.remind = { ...S.remind, time: m[0], days: 'daily' }; S.momentSet = true; saveSettings(); render(); app.querySelector(`[data-action=moment][data-v="${m[0]}"]`)?.focus(); }
  else if (action === 'place') openPlace(id);
  else if (action === 'place-pick') {      // cocher un mot : sans redessiner l'écran, pour ne perdre ni la place ni le focus
    const d = S.view === 'place' ? S.decks.find(x => x.id === S.placeId) : null, cid = b.dataset.card; if (!d || !Object.hasOwn(d.byId, cid) || !isNew(S.progress[d.id]?.[cid])) return;
    const pick = S.placePick ??= new Set(); if (pick.has(cid)) pick.delete(cid); else pick.add(cid);
    b.setAttribute('aria-pressed', String(pick.has(cid))); const go = app.querySelector('.placego'); if (go) go.innerHTML = placeGo(pick.size);
  }
  else if (action === 'place-go') { if (S.view === 'place') startPlacement(); }
  else if (action === 'place-skip') { if (S.view === 'place') openPlan(S.placeId); }
  else if (action === 'second') { if (['home', 'done'].includes(S.view || 'home') && S.decks.some(x => x.id === id)) startSession(id, false, 'second'); }
  else if (action === 'recap') { if ((S.view || 'home') === 'home') recapNow(id); }
  else if (action === 'offer') { if ((S.view || 'home') === 'home') setSmall(id, b.dataset.v === 'yes', true); }
  else if (action === 'small') { const pl = S.progress[id]?._plan; if ((S.view || 'home') === 'home' && pl && (pl.offer || pl.small) && S.decks.some(x => x.id === id && planned(x))) setSmall(id, b.dataset.v === 'on'); }
  else if (action === 'plan-keep') keepPlan(id, b.dataset.v, +b.dataset.k);
  else if (action === 'next') advance();
  else if (action === 'home' || action === 'quit') { stopRace(); dropRecording(); if (S.session) { saveProgress(S.session.deck.id); if (!S.session.challenge) saveMeasure(); } S.stepAt = 0; S.view = 'home'; S.session = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'teacher') { if (!TEACHER) return; if (S.session) S.session = null; S.view = 'teacher'; S.notice = null; S.confirmDel = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'set') applySetting(b.dataset.key, b.dataset.value);
  else if (action === 'rules') { S.view = 'rules'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'privacy') { S.view = 'privacy'; S.confirmWipe = false; S.notice = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'wipe') { S.confirmWipe = true; S.armedAt = Date.now(); render(); }
  else if (action === 'wipe-no') { S.confirmWipe = false; render(); }
  else if (action === 'wipe-yes') { if (!S.confirmWipe || S.view !== 'privacy' || !armed()) return; store.wipe().then(() => location.reload()); }       // tout est effacé sur cet appareil, puis l'application repart de zéro
  else if (action === 'herd') { if (!S.decks.some(x => x.id === id) || !S.progress[id]) return; S.herdId = id; S.view = 'herd'; S.confirmReset = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'share') { const st = S.session.stats; navigator.clipboard?.writeText(plainSp(t('shareText', S.session.deck.name, S.session.tamed.length, st.ok, st.answered))).then(() => toast(t('copied')), () => toast(t('downloadFail'))); }
  else if (action === 'edit') { if (!TEACHER || !S.decks.some(d => d.id === id)) return; S.editId = id; S.view = 'edit'; if (b.closest('form')) S.notice = null; window.scrollTo?.(0, 0); render(); }
  else if (action === 'fix-card') {      // depuis le contrôle du paquet : ouvre la fiche du mot touché
    const dk = S.decks.find(x => x.id === b.dataset.deck); if (!TEACHER || !dk || !Object.hasOwn(dk.byId, id)) return;
    const c = dk.byId[id]; S.editId = dk.id; S.cardId = id; S.draft = { image: c.image, audio: c.audio }; S.notice = null; S.view = 'card'; window.scrollTo?.(0, 0); render();
  }
  else if (action === 'card') { if (!TEACHER || !editing()) return; const c = Object.hasOwn(editing().byId, id) ? editing().byId[id] : undefined; S.cardId = id; S.draft = { image: c?.image, audio: c?.audio }; S.notice = null; S.view = 'card'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'clear') { S.draft[b.dataset.key] = undefined; const u = b.closest('form')[b.dataset.key + 'Url']; if (u) u.value = ''; showDraft(); }
  else if (action === 'test-audio') { const f = b.closest('form'); speak({ word: f.word.value, audio: safeUrl(S.draft.audio) }, editing().lang); }
  else if (action === 'del-card') { if (!TEACHER || !editing()) return; const d = editing(); d.demo = false; d.cards = d.cards.filter(c => c.id !== S.cardId); prepare(d); saveDecks(); S.view = 'edit'; render(); }
  else if (action === 'export') {
    const d = S.decks.find(x => x.id === id), lv = (d.level || '').toLowerCase(), base = slug(d.name), name = lv && !base.split('-').includes(lv) ? `${base}-${lv}` : base;
    download(name + '.json', deckToJSON(d), false);
    S.notice = { text: t('exported', name + '.json', siteBase() + '?paquet=' + name) }; render();
  }
  else if (action === 'del') { S.confirmDel = id; S.armedAt = Date.now(); render(); }
  else if (action === 'del-yes') { if (S.confirmDel !== id || !armed()) return; S.decks = S.decks.filter(d => d.id !== id); S.confirmDel = null; if (S.imgId === id) { S.imgId = null; S.loose = []; S.sheets = []; } saveDecks(); render(); }
  else if (action === 'rescue-del') { if (!S.rescue) return; S.decks = S.decks.filter(d => d.id !== id); S.rescue = false; S.view = 'home'; saveDecks(); render(); }
  else if (action === 'speak') speak(S.session.deck.byId[id], S.session.deck.lang, S.step?.activity?.say && S.step.card?.id === id && !S.feedback ? { say: S.step.activity.say } : {});
  else if (action === 'choose' && !S.feedback) {
    const o = S.step.activity.options[+b.dataset.i];
    if (o === S.step.activity.answer) ask({ ok: true }, { chosen: o }); else { cheer(commit({ ok: false }, { chosen: o })); render(); }
  }
  else if (action === 'skip' && !S.feedback) { commit({ ok: false }, { typed: '', chosen: null }); sfx('steps'); render(); }
  else if (action === 'reveal') { S.gate = true; render(); }
  else if (action === 'remind') { download('elefiches-rappel.ics', buildICS({ ...S.remind, url: siteBase(), title: plainSp(t('remEvent', S.minutes)), note: plainSp(t('remNote')) }), false); toast(t('remOk')); }
  else if (action === 'race') startRace(id);
  else if (action === 'friendly') startFriendly(id);
  else if (action === 'backup') saveBackup();
  else if (action === 'backup-yes') applyBackup();
  else if (action === 'backup-no') { S.pendingBackup = null; render(); }
  else if (action === 'race-pick') racePick(+b.dataset.i);
  else if (action === 'cant-listen' && !S.feedback) cantListen();
  else if (action === 'rec-start') recStart();
  else if (action === 'rec-stop') rec?.stop();
  else if (action === 'reveal-self' && !S.feedback) { keepInputs(); S.local = { ...(S.local || {}), phase: 1 }; S.spoke = S.step; render(); if (S.step.activity.type === 'speak') sayText(S.step.activity.model, S.session.deck.lang, { auto: true }); }
  else if (action === 'shadow') sayText(S.step.activity.model, S.session.deck.lang, { rate: 0.8 });
  else if (action === 'say-sentence') sayText(S.step.activity.model, S.session.deck.lang);
  else if (action === 'say-line') sayText(S.step.activity.items[+b.dataset.i].cloze.text, S.session.deck.lang);
  else if (action === 'self-retry' && !S.feedback) { const mine = S.local?.mine; dropRecording(); S.local = mine ? { mine } : null; render(); }      // recommencer tout de suite, sans être noté
  else if (action === 'say-model') sayText(S.step.activity.models[+b.dataset.i], S.session.deck.lang);
  else if (action === 'self' && !S.feedback) {
    // L'étudiant se juge en comparant avec le modèle : « comme le modèle », « j'ai hésité » ou « à revoir ».
    const v = b.dataset.v; S.spoke = S.step;
    // Se juger soi-même est indulgent : un « oui » compte comme une réussite hésitante, donc une révision plus proche.
    const fb = commit({ ok: v !== 'again' }, { hesitated: true, self: true });
    if (fb.tamed || fb.joined || !fb.ok) { sfx(fb.ok ? 'trumpet' : 'steps'); render(); } else { sfx('pop'); advance(); }
  }
  else if (action === 'felt' && S.feedback?.ask) {
    const v = b.dataset.v, was = S.feedback;
    const fb = commit({ ok: v !== 'lucky', note: was.note }, { chosen: was.chosen, typed: was.typed, shown: was.shown, hesitated: v === 'hard', lucky: v === 'lucky' });
    if (v === 'lucky') { toast(t('luckyNote')); advance(); }
    else if (fb.tamed || fb.joined) { sfx('trumpet'); render(); } else advance();
  }
  else if (action === 'tour') startTour(id);
  else if (action === 'key') { if (S.view === 'session' && !S.feedback) typeKey(b); }
  else if (action === 'shift') { if (S.view === 'session' && !S.feedback) { shiftKeys(b.closest('.keys'), b.getAttribute('aria-pressed') !== 'true'); b.closest('.study')?.querySelector('input[name="answer"], textarea[name="mine"]')?.focus({ preventScroll: true }); } }
  else if (action === 'chunk' && !S.feedback && !S.dragged) {
    const L = S.local ??= { picked: [], lock: 0 }, k = +b.dataset.k, i = L.picked.indexOf(k);
    if (i < 0) L.picked.push(k); else if (i >= L.lock) L.picked.splice(i, 1);
    render();
  }
  else if (action === 'check-order' && !S.feedback) checkOrder();
  else if (action === 'match' && !S.feedback) {
    const a = S.step.activity, L = S.local ??= { done: [], errors: [] }, side = b.dataset.side;
    L.bad = null;
    if (side === 'l' && S.voice) speak(S.session.deck.byId[id], S.session.deck.lang, { auto: true });      // chaque mot se fait entendre quand on le touche
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
    if (action === 'bank-gap') { if ((L.kept || []).includes(+b.dataset.i)) return; L.cur = +b.dataset.i; L.fill[L.cur] = null; }
    else if (L.cur >= 0) { L.fill[L.cur] = +b.dataset.k; L.cur = L.fill.indexOf(null); }
    render();
  }
  else if (action === 'check-bank' && !S.feedback) {
    const a = S.step.activity, L = S.local;
    const wrong = a.items.map((it, i) => (a.bank[L.fill[i]] !== it.answer ? i : -1)).filter(i => i >= 0);
    if (wrong.length && !L.again) {      // second essai : les phrases justes restent, les autres reçoivent leur indice de sens
      L.again = true; L.kept = a.items.map((_, i) => i).filter(i => !wrong.includes(i)); L.cue = wrong;
      wrong.forEach(i => { L.fill[i] = null; }); L.cur = wrong[0]; sfx('steps'); return render();
    }
    L.missed = wrong.map(i => a.items[i].id);
    cheer(commit({ ok: !L.missed.length }, { missed: L.missed, assisted: !!L.again })); render();
  }
  else if (action === 'challenge') startChallenge(id, +b.dataset.stage);
  else if (action === 'copy-prompt') {
    if (!S.builder.level) return toast(t('pickLevel'));
    const pre = b.parentElement.querySelector('pre'), manual = () => { getSelection().selectAllChildren(pre); toast(t('copyManual')); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(prompts()[b.dataset.k]).then(() => toast(t('copied')), manual); else manual();
  }
  else if (action === 'sort') { if (!TEACHER || !S.decks.some(d => d.id === id)) return; S.sortId = id; S.notice = null; S.view = 'sort'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'sort-all') { const boxes = [...(b.closest('fieldset')?.querySelectorAll('input[type=checkbox]') ?? [])], on = boxes.some(x => !x.checked); for (const x of boxes) x.checked = on; }
  else if (action === 'sort-confirm' || action === 'sort-move' || action === 'sort-gender') {
    if (!TEACHER || S.view !== 'sort') return;
    const d = S.decks.find(x => x.id === S.sortId); if (!d) return;
    const picked = name => [...app.querySelectorAll(`input[name="${name}"]:checked`)].filter(x => Object.hasOwn(d.byId, x.value)).map(x => d.byId[x.value]);      // jamais une clé héritée (« __proto__ »)
    if (action === 'sort-gender') { const g = b.dataset.g; if (!['m', 'f', 'mf'].includes(g)) return; sortApply(picked('gpick').filter(c => kindOf(c) === 'nom'), c => { c.gender = g; }, 'sortSavedG'); return; }
    // Confirmer un groupe : toutes ses fiches encore sans catégorie. Ranger : seulement les fiches cochées, où qu'elles soient.
    const kind = action === 'sort-confirm' ? b.dataset.kind : app.querySelector('[data-sortkind]')?.value;
    if (!KINDS.includes(kind)) return;
    sortApply(action === 'sort-confirm' ? unsorted(d).filter(c => suggestKind(c, d.lang) === kind) : picked('pick'), c => { c.pos = kind; }, 'sortSaved');
  }
  else if (action === 'images') { if (!TEACHER || !S.decks.some(d => d.id === id)) return; if (S.imgId !== id) { S.sheets = []; S.loose = []; } S.imgId = id; /* les images en attente d'un paquet ne se perdent pas quand on passe par un autre écran */ S.notice = null; S.view = 'images'; window.scrollTo?.(0, 0); render(); }
  else if (action === 'swap-sheets') {
    const d = S.decks.find(x => x.id === S.imgId), n = S.sheets.length, total = [1, 1, 2, 6, 24, 120][Math.min(n, 5)];
    S.perm = (S.perm + 1) % total;
    cutSheets(d, nthPerm(S.sheets, S.perm)).then(() => saveDecks()).then(render);
  }
  else if (action === 'assign-image' && S.loose.length) { const d = S.decks.find(x => x.id === S.imgId); if (!TEACHER || !d || !d.byId[id]) return; const img = safeUrl(S.loose.shift()); if (!img) return render(); d.byId[id].image = img; saveDecks(); render(); }
  else if (action === 'skip-image') { S.loose.shift(); render(); }
  else if (action === 'reset') { S.confirmReset = id; S.armedAt = Date.now(); render(); }
  else if (action === 'reset-yes') { if (S.confirmReset !== id || !armed()) return; S.progress[id] = {}; S.confirmReset = null; saveProgress(id); render(); }
  else if (action === 'dl') download(MODELS[model].file, MODELS[model].csv);
  else if (action === 'copy') navigator.clipboard?.writeText(MODELS[model].csv).then(() => toast(t('copied')), () => toast(t('downloadFail')));
  else if (action === 'try') addDeck(MODELS[model].csv, MODELS[model].name, MODELS[model].lang, false, MODELS[model].level || 'A2');
});
app.addEventListener('submit', e => {
  e.preventDefault();
  const kind = e.target.dataset.submit;
  if (kind === 'gate') { if (S.locked && !S.door?.busy) openGate(e.target.code.value); return; }
  if (S.locked || sbBusy) return;
  if (kind === 'gate-make') { makeGate(e.target.code.value, e.target.again.value); return; }
  if (kind === 'import') {
    if (!TEACHER) return;      // ce formulaire n'existe que dans l'espace enseignant
    const f = e.target, raw = f.days.value.trim();
    if (raw && !adviseDays(raw)) { S.notice = { bad: true, text: t('errDays', PLAN_DAYS.min, PLAN_DAYS.max) }; toast(S.notice.text); return; }
    importPacket({ files: [...f.files.files], text: f.text.value, name: f.name.value.trim(), lang: f.lang.value, level: f.level.value, days: adviseDays(raw), seen: f.seen.checked });
  }
  else if (kind === 'card') { if (TEACHER && editing()) saveCard(e.target); }
  else if (kind === 'rename') {
    if (!TEACHER || !editing()) return; const d = editing(), f = e.target, n = f.name.value.trim(), raw = f.days.value.trim(), days = adviseDays(raw);
    // Jours conseillés : un nombre de 4 à 60, ou rien. Une valeur refusée n'est jamais enregistrée en silence : le message dit quoi écrire.
    if (raw && !days) { S.notice = { bad: true, text: t('errDays', PLAN_DAYS.min, PLAN_DAYS.max) }; toast(S.notice.text); return; }
    if (n) { d.name = n; d.lang = f.lang.value; d.level = f.level.value; d.days = days || undefined; d.seen = f.seen.checked ? true : undefined; d.demo = false; saveDecks(); S.notice = { text: t('saved') }; render(); }
  }
  else if (kind === 'typed' && !S.feedback) submitTyped(e.target.answer.value);
});
function applySetting(k, v) {
  if (!['lang', 'help', 'minutes', 'sound', 'voice', 'remindDays'].includes(k)) return;          // seuls les réglages connus se modifient
  if (k === 'remindDays') S.remind = { ...S.remind, days: v };
  else S[k] = k === 'minutes' ? +v : k === 'sound' || k === 'voice' ? v === '1' : v;
  saveSettings(); render();
  if (k === 'sound' && S.sound) sfx('pop');
}
// Une image qui ne peut pas s'afficher ne laisse jamais un exercice sans contenu : dans un choix parmi des images,
// tous les choix repassent en texte ; ailleurs, l'image disparaît simplement.
app.addEventListener('error', e => {
  const img = e.target; if (img?.tagName !== 'IMG' || !img.getAttribute('src') || img.dataset.preview) return;      // l'aperçu de l'éditeur reste en place, même vide
  const options = img.closest('.options');
  if (options) options.classList.add('nopics'); else img.remove();
}, true);
app.addEventListener('change', e => {
  if (S.locked || sbBusy) return;
  if (e.target.dataset.file) return attach(e.target);
  if (e.target.dataset.remind) { S.remind = { ...S.remind, time: e.target.value || '18:00' }; return saveSettings(); }
  if (e.target.dataset.grid) {                 // grille des planches : colonnes ou rangées
    const d = S.decks.find(x => x.id === S.imgId), G = gridOf(d.grid);
    G[e.target.dataset.grid] = +e.target.value; d.grid = `${G.cols}x${G.rows}`;
    (S.sheets.length ? cutSheets(d, nthPerm(S.sheets, S.perm)) : Promise.resolve()).then(() => saveDecks()).then(render);
  }
});
app.addEventListener('input', e => {
  if (S.locked || sbBusy) return;
  const k = e.target.dataset?.b;
  if (k) { S.builder[k] = k === 'count' ? Math.min(500, Math.max(3, Math.round(+e.target.value) || 20)) : e.target.value;
    if (k === 'examples') {      // seul le message change : le reste du formulaire (fichiers choisis, texte collé) n'est pas redessiné
      const n = +S.builder.examples, w = app.querySelector('[data-exwarn]');
      if (w) { w.hidden = n > 2; w.classList.toggle('warn', n === 1); w.textContent = n === 1 ? t('bExWarn1') : n === 2 ? t('bExWarn2') : ''; }
    }
    return refreshPrompts(); }
  if (e.target.dataset.input !== 'search') return;
  const q = e.target.value.trim().toLowerCase();
  for (const li of app.querySelectorAll('.cardlist li')) li.hidden = !!q && !li.dataset.text.includes(q);
});
document.addEventListener('keydown', e => {
  if (S.locked || sbBusy) return;
  if (S.view === 'race' && !S.race?.over) { const k = ['1', '2', '3', '4'].indexOf(e.key); if (k >= 0) racePick(k); return; }
  if (S.view !== 'session' || S.feedback || !S.step?.activity?.options) return;
  const i = ['1', '2', '3', '4'].indexOf(e.key);
  if (i >= 0) app.querySelector(`.option[data-i="${i}"]`)?.click();
});

// Appuyer sur une touche d'accent ne retire pas le curseur du champ : le clavier du téléphone reste ouvert.
app.addEventListener('mousedown', e => { if (e.target.closest?.('.key')) e.preventDefault(); });

// Glisser-déposer des morceaux de phrase (souris, doigt ou stylet). Toucher un morceau fait la même chose :
// le glisser n'est jamais obligatoire, pour le clavier et les personnes qui ne peuvent pas maintenir un appui.
let drag = null;
app.addEventListener('pointerdown', e => {
  const c = e.target.closest?.('.chunk[data-action="chunk"]:not(:disabled)');
  if (c && !S.feedback && !S.locked) drag = { k: +c.dataset.k, x: e.clientX, y: e.clientY, el: c, ghost: null };
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
// Accès à l'état pour les tests : seulement sur un poste de développement, jamais sur le site en ligne.
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) window.__elefiches = { get step() { return S.step; }, get state() { return S; }, rerender: render };
