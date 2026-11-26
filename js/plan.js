// Éléfiches : plan personnel (décisions du 26 novembre 2026).
// Un paquet pour lequel l'enseignant a conseillé un nombre de jours reçoit un plan : l'étudiant choisit un pas parmi
// trois, chacun étant une balance entre minutes par jour et nombre de jours. Le pas du milieu est celui du cours.
// Rien n'est une date : le plan part du jour où l'étudiant choisit son pas.
//
// Ce module ne fait que des calculs. Les durées qu'il annonce sont des estimations : elles sortent du calendrier
// réel de l'appli (scheduler.js), joué à blanc avec la vitesse et le taux de réussite mesurés sur l'appareil
// (15 secondes par étape et 90 % de réussite tant que rien n'est mesuré). Elles se recalculent chaque jour.
//
// Trois garde-fous ne dépendent d'aucun réglage : les révisions passent avant les mots nouveaux, tous les mots sont
// découverts dans la première moitié du plan (arrondie au-dessus), et l'ordre de découverte est celui des fiches.
import { review, isNew, isDue } from './scheduler.js';
import { PLAN_DAYS, adviseDays } from './deck.js';

export const DAY = 86400000;
export const PACES = ['slow', 'mid', 'fast'];      // Patte de velours, Patte trotteuse, Patte pressée
export const DEFAULT_SEC = 15, DEFAULT_OK = 0.9;
export const EXTRA_MIN = 5;                        // jour manqué : au-delà de cinq minutes de plus par jour, l'étudiant choisit

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v);
const int = (v, a, b, def) => (num(v) ? Math.round(clamp(+v, a, b)) : def);

// Les jours sont ceux du calendrier de l'appareil : un jour commence à minuit, heure locale.
export const dayStart = ts => new Date(ts).setHours(0, 0, 0, 0);
export const dayEnd = ts => new Date(ts).setHours(24, 0, 0, 0) - 1;
export const dayIndex = (start, now) => Math.round((dayStart(now) - dayStart(start)) / DAY);

// Les trois pas, autour des jours conseillés : une fois et demie, les jours conseillés, deux tiers (9, 6 et 4 pour 6).
// Aucun plan de moins de quatre jours : plus court, trop peu de mots sont rappelés un autre jour que celui de leur
// découverte. Quand le pas rapide retombe sur le pas du cours (4 jours conseillés), il n'est pas proposé.
export function paceDays(advised) {
  const D = adviseDays(advised); if (!D) return [];
  const out = [['slow', Math.round(D * 1.5)], ['mid', D], ['fast', Math.max(PLAN_DAYS.min, Math.round(D * 2 / 3))]];
  return out.filter(([k, n]) => k !== 'fast' || n < D);
}

// Mots nouveaux du jour d (0 = premier jour) : ce qu'il reste, réparti sur les jours de découverte qui restent.
// La découverte occupe la première moitié du plan ; chaque jour manqué la prolonge d'un jour, sans jamais prendre
// le dernier jour, où tout ce qui reste est présenté.
// cap : jours conseillés par l'enseignant. Quel que soit le pas, et même après des jours manqués, la découverte finit
// la veille du dernier jour conseillé : tous les mots sont vus au moins une fois dans le temps imparti.
export function newToday(left, days, d, missed = 0, cap = 0) {
  if (left <= 0) return 0;
  const D = Math.max(1, days), win = Math.min(Math.max(1, D - 1), Math.ceil(D / 2) + Math.max(0, missed), cap > 1 ? cap - 1 : Infinity);
  return d >= D - 1 ? left : Math.min(left, Math.ceil(left / Math.max(1, win - d)));
}

// ---------- Mesure locale : vitesse et réussite ----------
// Les soixante dernières durées d'étape (en secondes) et le compte des premières réponses, justes ou non. Tout reste
// sur l'appareil. Une étape de moins d'une seconde (double appui) ou de plus de quatre-vingt-dix secondes (l'étudiant
// a posé son téléphone) n'est pas une mesure.
export const emptyMeasure = () => ({ t: [], tries: 0, ok: 0 });
export function cleanMeasure(m) {
  if (!m || typeof m !== 'object') return emptyMeasure();
  const t = (Array.isArray(m.t) ? m.t : []).filter(x => typeof x === 'number' && Number.isFinite(x) && x >= 1 && x <= 90).slice(-60).map(x => Math.round(x * 10) / 10);
  const tries = int(m.tries, 0, 1e6, 0);
  return { t, tries, ok: int(m.ok, 0, tries, 0) };
}
export function addTime(m, ms) {
  if (!(ms >= 1000 && ms <= 90000)) return m;
  m.t.push(Math.round(ms / 100) / 10); if (m.t.length > 60) m.t.splice(0, m.t.length - 60);
  return m;
}
// Première réponse à une question (jamais un rattrapage). Passé deux cents réponses, les anciennes pèsent moitié
// moins : le taux suit les progrès de l'étudiant.
export function addTry(m, ok) {
  m.tries++; if (ok) m.ok++;
  if (m.tries > 200) { m.tries = Math.round(m.tries / 2); m.ok = Math.min(m.tries, Math.round(m.ok / 2)); }
  return m;
}
const median = a => { const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
// Valeurs utilisées par les calculs : la médiane des durées dès dix mesures, le taux de réussite dès vingt réponses.
export function rates(m) {
  const c = cleanMeasure(m), timed = c.t.length >= 10, counted = c.tries >= 20;
  return { sec: timed ? clamp(median(c.t), 4, 60) : DEFAULT_SEC, ok: counted ? clamp(c.ok / c.tries, 0.5, 0.98) : DEFAULT_OK, measured: timed && counted };
}
export const minutes = (steps, sec = DEFAULT_SEC) => Math.max(1, Math.round(steps * sec / 60));

// ---------- Le calendrier joué à blanc ----------
// Étapes par jour d'un plan de « days » jours, du jour « from » au dernier. states : états des fiches déjà découvertes ;
// fresh : nombre de mots encore nouveaux. single : paquet « mots déjà vus en classe » (pas d'écran de découverte, une
// seule question écrite pour un mot nouveau) ; sinon un mot nouveau coûte trois étapes (découverte, sens, phrase).
// Une réponse manquée coûte une étape de plus (le rattrapage). mark : nombre de jours au bout duquel on veut savoir
// quelle part des mots nouveaux a été découverte (seen) et rappelée un autre jour que celui de sa découverte (again).
// Le tirage est à graine fixe : le même plan donne toujours les mêmes nombres.
const lcg = seed => { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };
const cache = new Map();
// perNew : étapes d'un mot nouveau réussi (3 avec écran de découverte ; 1 pour un mot déjà vu en classe ; 2 au niveau A1,
// où l'étudiant choisit le mot avant de l'écrire). cap : jours conseillés (voir newToday).
export function simulate({ states = [], fresh = 0, days, from = 0, missed = 0, ok = DEFAULT_OK, single = false, perNew = single ? 1 : 3, cap = 0, now = Date.now(), runs = 4, mark = 0 }) {
  // Jamais plus de deux fois la durée la plus longue d'un plan, ni plus de deux tirages pour un très grand paquet : un
  // état forgé ou un paquet de deux mille fiches ne doit pas ralentir l'écran (relecture de sécurité, 15b).
  const D = Math.max(1, Math.round(days) || 1), d0 = Math.max(0, Math.round(from) || 0), span = Math.min(2 * PLAN_DAYS.long, Math.max(1, D - d0)), noon = dayStart(now) + DAY / 2;
  if (states.length + fresh > 500) runs = Math.min(runs, 2);
  const key = states.length ? '' : [fresh, D, d0, missed, ok, perNew, cap, runs, mark, noon].join('|');
  if (key && cache.has(key)) return cache.get(key);
  const per = Array(span).fill(0); let seen = 0, again = 0;
  for (let r = 0; r < runs; r++) {
    const rnd = lcg(r + 1), cards = states.map(st => ({ st: { ...st, fsrs: st.fsrs ? { ...st.fsrs } : undefined }, born: -1, later: -1 }));
    let left = Math.max(0, Math.round(fresh) || 0);
    for (let i = 0; i < span; i++) {
      const d = d0 + i, t = noon + i * DAY, end = dayEnd(t);
      for (const c of cards) {
        if (!isDue(c.st, end)) continue;
        const good = rnd() < ok; c.st = review(c.st, good ? 'good' : 'again', t); per[i] += good ? 1 : 2;
        if (c.born >= 0 && c.born < d && c.later < 0) c.later = d;
      }
      const n = newToday(left, D, d, missed, cap);
      for (let k = 0; k < n; k++) { const good = rnd() < ok; cards.push({ st: review(undefined, good ? 'good' : 'again', t), born: d, later: -1 }); per[i] += perNew - 1 + (good ? 1 : 2); }
      left -= n;
    }
    if (mark > 0) for (const c of cards) { if (c.born >= 0 && c.born < mark) seen++; if (c.born >= 0 && c.later >= 0 && c.later < mark) again++; }
  }
  const avgPer = per.map(x => x / runs), total = avgPer.reduce((a, b) => a + b, 0), all = runs * Math.max(1, fresh);
  const out = { per: avgPer, total, avg: total / span, max: Math.max(...avgPer), days: span, seen: fresh ? seen / all : 1, again: fresh ? again / all : 1 };
  if (key) { if (cache.size > 200) cache.clear(); cache.set(key, out); }
  return out;
}

// ---------- Le plan d'un étudiant pour un paquet ----------
// Rangé dans la progression du paquet, sous « _plan » : pas choisi, durée en jours, premier jour, dernier jour
// travaillé, jours manqués constatés (missed) et déjà annoncés (ack), minutes par jour annoncées au choix du pas
// (est), et le programme du jour arrêté à la première visite de la journée (day, fresh, rev).
export const startPlan = (pace, days, now = Date.now(), est = 0) => ({ pace: PACES.includes(pace) ? pace : 'mid', days: int(days, 1, PLAN_DAYS.long, PLAN_DAYS.min), start: dayStart(now), last: -1, missed: 0, ack: 0, est: int(est, 0, 600, 0), day: -1, fresh: 0, rev: 0 });
// Un plan venu du stockage ou d'une sauvegarde n'est jamais repris tel quel : chaque champ est reconstruit.
export function cleanPlan(p, now = Date.now()) {
  if (!p || typeof p !== 'object' || !PACES.includes(p.pace) || !num(p.start) || !num(p.days)) return null;
  // Un plan commencé il y a plus de deux fois la durée la plus longue n'est plus un plan : il est écarté, et l'étudiant
  // choisit de nouveau son pas. Aucun compteur ne dépasse cette même borne (relecture de sécurité, 15b).
  const top = 2 * PLAN_DAYS.long; if (+p.start < now - top * DAY) return null;
  const missed = int(p.missed, 0, top, 0);
  return { pace: p.pace, days: int(p.days, 1, PLAN_DAYS.long, PLAN_DAYS.min), start: dayStart(clamp(+p.start, 0, now)), last: int(p.last, -1, top, -1), missed, ack: int(p.ack, 0, missed, 0),
    est: int(p.est, 0, 600, 0), day: int(p.day, -1, top, -1), fresh: int(p.fresh, 0, 2000, 0), rev: int(p.rev, 0, 2000, 0) };
}
// Jours manqués à ce jour : ceux déjà constatés, plus les jours sans aucune réponse depuis le dernier jour travaillé.
export const missedNow = (plan, d) => plan.missed + Math.max(0, d - 1 - plan.last);
// À la première réponse de la journée : les jours manqués sont constatés, le jour est noté comme travaillé.
export function markWorked(plan, now = Date.now()) {
  const d = Math.max(0, dayIndex(plan.start, now));
  if (d > plan.last) { plan.missed = missedNow(plan, d); plan.last = d; }
  return plan;
}

// Programme du jour. Il est arrêté à la première visite de la journée (snap) : le nombre de mots nouveaux et de
// révisions annoncé le matin ne bouge plus si l'étudiant travaille en deux fois. En plan personnel, une fiche due
// avant minuit est due aujourd'hui : la journée ne se rouvre pas le soir pour trois fiches.
export function today(deck, P, plan, now = Date.now()) {
  const d = Math.max(0, dayIndex(plan.start, now)), t0 = dayStart(now), end = dayEnd(now);      // horloge reculée après le choix du pas : jamais de « jour 0 »
  let left = 0, born = 0, due = 0, done = 0, old = 0;
  for (const c of deck.cards) {
    const st = P[c.id];
    if (isNew(st)) { left++; continue; }
    const mine = (st.born || 0) >= t0, seenToday = (st.fsrs?.last_review || 0) >= t0, waits = isDue(st, end);
    if (mine) born++;
    if (seenToday) done++;
    if (waits) due++;
    if (!mine && (waits || seenToday)) old++;      // révision du jour, faite ou à faire
  }
  // Programme recalculé en cours de journée (changement de pas) : ce qui est déjà fait aujourd'hui reste compté.
  const kept = plan.day === d;
  const fresh = kept ? plan.fresh : newToday(left, plan.days, d, missedNow(plan, d), deck.days) + born, rev = kept ? plan.rev : old;
  const freshLeft = Math.max(0, Math.min(left, fresh - born)), total = fresh + rev;
  return { d, over: d >= plan.days, fresh, rev, total, freshLeft, revLeft: due, left, done: Math.min(done, total), complete: freshLeft + due === 0, snap: { day: d, fresh, rev } };
}
// Étapes qu'il reste à faire aujourd'hui (pour l'annonce « environ N minutes »).
export const stepsLeft = (T, { ok = DEFAULT_OK, single = false, perNew = single ? 1 : 3 } = {}) => T.revLeft * (2 - ok) + T.freshLeft * (perNew + 1 - ok);
// Où en est l'étudiant par rapport aux jours conseillés : mots vus, mots déjà rappelés un autre jour que celui de leur
// découverte, jours conseillés qui restent. C'est ce que la carte du paquet lui montre chaque jour, sans jugement.
export function milestone(deck, P, plan, now = Date.now()) {
  const d = Math.max(0, dayIndex(plan.start, now)); let seen = 0, again = 0;
  for (const c of deck.cards) { const st = P[c.id]; if (isNew(st)) continue; seen++; if (st.fsrs?.last_review && st.born && dayStart(st.fsrs.last_review) > dayStart(st.born)) again++; }
  return { d, daysLeft: Math.max(0, (deck.days || plan.days) - d), total: deck.cards.length, seen, again, unseen: deck.cards.length - seen };
}

// Ce qu'il reste du plan, joué à blanc à partir de la vraie progression : sert au recalcul quotidien, au changement
// de pas et au jour manqué. days : durée totale envisagée (celle du plan par défaut).
export function outlook(deck, P, plan, now = Date.now(), { ok = DEFAULT_OK, single = false, perNew = single ? 1 : 3, days = plan.days, mark = 0 } = {}) {
  const d = Math.max(0, dayIndex(plan.start, now)), states = [];
  for (const c of deck.cards) if (!isNew(P[c.id])) states.push(P[c.id]);
  return simulate({ states, fresh: deck.cards.length - states.length, days: Math.max(days, d + 1), from: d, missed: missedNow(plan, d), ok, perNew, cap: deck.days || 0, now, mark });
}
