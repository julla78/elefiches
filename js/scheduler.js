// Éléfiches — planification des révisions.
// FSRS (bibliothèque ts-fsrs, licence MIT) décide du moment ; les cinq boîtes décident de la forme de l'activité.
import { fsrs, generatorParameters, createEmptyCard, Rating } from '../vendor/ts-fsrs.js';

const engine = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true, enable_short_term: false }));
const DAY = 86400000;

export const HERD_BOX = 4;      // un mot rejoint le troupeau quand il atteint la boîte 4 (rappel écrit réussi après espacement)

// grade : 'again' (raté), 'hard' (réussi en reconnaissance : preuve faible), 'good' (réussi en rappel écrit)
export function review(state, grade, now = Date.now()) {
  const prev = state?.fsrs
    ? { ...state.fsrs, due: new Date(state.fsrs.due), last_review: state.fsrs.last_review ? new Date(state.fsrs.last_review) : undefined }
    : createEmptyCard(new Date(now));
  const rating = grade === 'again' ? Rating.Again : grade === 'hard' ? Rating.Hard : Rating.Good;
  let card;
  try { ({ card } = engine.next(prev, new Date(now), rating)); }
  catch { ({ card } = engine.next(createEmptyCard(new Date(now)), new Date(now), rating)); }      // état de mémoire illisible : on repart d'une fiche neuve
  const box0 = state?.box ?? 1;
  const box = grade === 'again' ? Math.max(1, box0 - 1) : Math.min(5, box0 + 1);
  return {
    seen: true, box, born: state?.born,
    fsrs: { ...card, due: card.due.getTime(), last_review: card.last_review ? card.last_review.getTime() : now },
    lastOk: grade !== 'again',
  };
}

export const isNew = st => !st || !st.seen;
export const isDue = (st, now = Date.now()) => !!st?.seen && (!st.fsrs || st.fsrs.due <= now);
export const inHerd = st => !!st?.seen && (st.box ?? 1) >= HERD_BOX;
export const boxOf = st => (isNew(st) ? 0 : st.box ?? 1);
export const dueInDays = (st, now = Date.now()) => (st?.fsrs ? Math.max(0, Math.round((st.fsrs.due - now) / DAY)) : 0);

// Un grand paquet est découpé en étapes d'une dizaine de mots, pour que l'objectif visible reste proche.
export const STAGE = 10;
export function stageOf(deck, progress) {
  const n = deck.cards.length, count = Math.max(1, Math.floor(n / STAGE) + (n % STAGE >= 5 ? 1 : 0));
  const bounds = i => [i * STAGE, i === count - 1 ? n : (i + 1) * STAGE];
  let index = count - 1, allSeen = true;
  for (let i = 0; i < count; i++) {
    const [a, b] = bounds(i);
    if (deck.cards.slice(a, b).some(c => isNew(progress[c.id]))) { index = i; allSeen = false; break; }
  }
  const [a, b] = bounds(index), cards = deck.cards.slice(a, b);
  return { index: index + 1, count, size: cards.length, seen: cards.filter(c => !isNew(progress[c.id])).length, allSeen, bounds: Array.from({ length: count }, (_, i) => bounds(i)) };
}

// Résumé d'un paquet pour l'écran d'accueil.
// memory : part du chemin parcouru par l'ensemble des fiches vers la boîte 5 (0 à 1). Elle baisse quand on oublie.
export function summary(deck, progress, now = Date.now()) {
  const boxes = [0, 0, 0, 0, 0, 0], animals = []; let due = 0, herd = 0, sum = 0, closest = null;
  for (const c of deck.cards) {
    const st = progress[c.id], b = boxOf(st);
    boxes[b]++; sum += b;
    if (b > 0) animals.push({ id: c.id, word: c.word, box: b });
    if (isDue(st, now)) due++;
    if (inHerd(st)) herd++;
    else if (b > 0 && (!closest || b > closest.box)) closest = { word: c.word, box: b };
  }
  return { total: deck.cards.length, fresh: boxes[0], due, herd, boxes, closest, animals, stage: stageOf(deck, progress), memory: sum / (5 * deck.cards.length) };
}

// Mode essai de l'espace enseignant (« Tester sans limites ») : pour voir en une séance ce qu'un étudiant ne rencontre
// qu'au fil des semaines, on « avance le temps ». L'horloge de l'appareil ne change pas : ce sont toutes les dates de la
// progression d'essai qui reculent de la même durée. Les écarts entre révisions restent donc exacts pour FSRS.
export function shiftProgress(P, ms) {
  if (!P || typeof P !== 'object' || !(ms > 0)) return P;
  const back = v => (Number.isFinite(+v) ? Math.max(0, +v - ms) : v), out = {};
  for (const [id, st] of Object.entries(P)) {
    if (!st || typeof st !== 'object') continue;
    if (id === '_stages') out[id] = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, back(v)]));
    else if (id.startsWith('_')) out[id] = { ...st };
    else {
      out[id] = { ...st };
      if ('born' in st) out[id].born = back(st.born);
      if (st.fsrs && typeof st.fsrs === 'object') out[id].fsrs = { ...st.fsrs, due: back(st.fsrs.due), last_review: back(st.fsrs.last_review) };
    }
  }
  return out;
}
// Durée à attendre avant la prochaine révision d'une progression (0 si une fiche est déjà due ou si rien n'est commencé).
export function nextDueIn(P, now = Date.now()) {
  let best = Infinity;
  for (const [id, st] of Object.entries(P || {})) {
    if (id.startsWith('_') || !st?.seen) continue;
    if (!st.fsrs || st.fsrs.due <= now) return 0;
    best = Math.min(best, st.fsrs.due - now);
  }
  return Number.isFinite(best) ? best : 0;
}
