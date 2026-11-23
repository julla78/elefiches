// Éléfiches — déroulement d'une session : quelles fiches, dans quel ordre, sous quelle forme.
import { variants } from './match.js';
import { review, isNew, isDue, boxOf, HERD_BOX } from './scheduler.js';

const shuffle = (a, rnd) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
// Sens affiché comme question : la définition en langue cible, sinon une traduction.
export const gloss = (c, help) => c.translations?.[help] || '';
export const meaning = (c, help) => c.definition || gloss(c, help) || Object.values(c.translations || {})[0] || '';

// Nouvelles fiches du jour. Deux fiches de sens proche ne sont jamais introduites ensemble ;
// avec un champ « famille » explicite, la suivante attend que la première ait atteint la boîte 3.
export function pickNew(deck, progress, max) {
  const chosen = [];
  for (const c of deck.cards) {
    if (chosen.length >= max) break;
    if (!isNew(progress[c.id])) continue;
    if (c.neighbours.some(id => chosen.some(x => x.id === id))) continue;
    const waiting = c.family && deck.cards.some(d => d.id !== c.id && d.family === c.family
      && !isNew(progress[d.id]) && boxOf(progress[d.id]) < 3);
    if (waiting) continue;
    chosen.push(c);
  }
  return chosen;
}

function distractors(deck, card, n, rnd, textOf) {
  const used = new Set([textOf(card)]); const out = [];
  const ok = d => d.id !== card.id && d.key !== card.key && !card.neighbours.includes(d.id);
  const pools = [deck.cards.filter(d => ok(d) && d.theme === card.theme), deck.cards.filter(ok), deck.cards.filter(d => d.id !== card.id && d.key !== card.key)];
  for (const pool of pools) for (const d of shuffle(pool, rnd)) {
    const t = textOf(d);
    if (!t || used.has(t)) continue;
    used.add(t); out.push(t);
    if (out.length === n) return out;
  }
  return out;
}

const lowerFirst = (s, word) => (/^\p{Lu}/u.test(word.replace(/^\S+\s/, '')) || /^\p{Lu}{2}/u.test(s) ? s : s[0].toLowerCase() + s.slice(1));

// Choisit la forme de l'activité selon la boîte (voir le tableau du cahier des charges, section 5).
export function buildActivity(deck, card, box, rnd = Math.random, force = null) {
  const mean = c => meaning(c, deck.help);
  const cl = card.clozes.length ? pick(card.clozes, rnd) : null;
  const typable = cl && !cl.multi && cl.n <= 3;
  const discontinuous = /…|\.\.\./.test(card.word);
  const surface = d => (d.clozes.length ? lowerFirst(pick(d.clozes, rnd).answer, d.word) : null);
  let type;
  // Mot grammatical avec glose (« Au (siècle) ») ou homographe (deux fiches « En ») : seule la phrase lève l'ambiguïté.
  const needsContext = card.bare !== card.word || deck.homographs.has(card.key);
  if (box <= 1) type = needsContext && cl ? 'cloze-choice' : 'qcm';
  else if (box === 2) type = cl ? 'cloze-choice' : 'qcm-rev';
  else if (box === 3) type = typable ? 'cloze-type' : cl ? 'cloze-choice' : 'type';
  else type = discontinuous ? 'qcm-rev' : 'type';
  if (force === 'cloze-choice' && cl) type = 'cloze-choice';

  const act = { type, cardId: card.id, recognition: type === 'qcm' || type === 'qcm-rev' || type === 'cloze-choice' };
  if (type === 'qcm') {
    act.answer = mean(card);
    act.options = shuffle([act.answer, ...distractors(deck, card, 2, rnd, mean)], rnd);
  } else if (type === 'qcm-rev') {
    act.answer = card.bare;
    act.options = shuffle([act.answer, ...distractors(deck, card, 2, rnd, d => d.bare)], rnd);
  } else if (type === 'cloze-choice') {
    act.cloze = cl; act.answer = lowerFirst(cl.answer, card.word);
    const ds = distractors(deck, card, 2, rnd, d => (d.id === card.id ? act.answer : surface(d)));
    act.options = shuffle([act.answer, ...ds], rnd);
  } else if (type === 'cloze-type') {
    act.cloze = cl; act.answer = cl.answer; act.accepted = [cl.answer]; act.lemmas = variants(card.word);
  } else {
    act.answer = card.word; act.accepted = variants(card.word);
  }
  return act;
}

export class Session {
  constructor(deck, progress, { minutes = 5, maxNew = 3, now = Date.now(), rnd = Math.random } = {}) {
    Object.assign(this, { deck, progress, rnd, startedAt: now, endAt: now + minutes * 60000 });
    this.stats = { answered: 0, ok: 0, fresh: 0, up: [], again: [], herd: [], streak: 0, best: 0 };
    this.served = 0; this.today = []; this.tamed = [];
    const due = deck.cards.filter(c => isDue(progress[c.id], now))
      .sort((a, b) => (progress[a.id].fsrs?.due ?? 0) - (progress[b.id].fsrs?.due ?? 0));
    const q = due.map(c => ({ id: c.id, kind: 'quiz' }));
    let pos = Math.min(2, q.length);
    for (const c of pickNew(deck, progress, maxNew)) {     // découverte, puis première question un peu plus loin
      this.today.push(c.id);
      q.splice(pos, 0, { id: c.id, kind: 'intro' });
      q.splice(Math.min(q.length, pos + 3), 0, { id: c.id, kind: 'quiz', first: true });
      pos = Math.min(q.length, pos + 2);
    }
    this.queue = q;
    this.total = q.length;
  }

  // Prochaine étape, ou null quand la session est finie. Passé la durée choisie, on n'introduit plus rien.
  next(now = Date.now()) {
    if (now > this.endAt) {
      const unseen = new Set(this.queue.filter(i => i.kind === 'intro').map(i => i.id));
      this.queue = this.queue.filter(i => i.retry && !i.bonus && !unseen.has(i.id));
    }
    const item = this.queue.shift();
    if (!item) return null;
    this.served++;
    const card = this.deck.byId[item.id];
    if (item.kind === 'intro') {
      this.progress[card.id] = { seen: true, box: 1 };
      this.stats.fresh++;
      return { item, card, intro: true };
    }
    return { item, card, activity: buildActivity(this.deck, card, boxOf(this.progress[card.id]) || 1, this.rnd, item.force) };
  }

  // Enregistre une réponse. Seule la première réponse du jour compte pour FSRS ; les rattrapages non.
  answer(step, ok, now = Date.now()) {
    const { item, card, activity } = step;
    if (!item.retry) {
      const before = boxOf(this.progress[card.id]);
      this.progress[card.id] = review(this.progress[card.id], ok ? (activity.recognition ? 'hard' : 'good') : 'again', now);
      this.stats.answered++;
      if (ok) {
        this.stats.ok++;
        if (this.progress[card.id].box > before) this.stats.up.push(card.id);
        if (before < HERD_BOX && this.progress[card.id].box >= HERD_BOX) this.stats.herd.push(card.id);
      } else this.stats.again.push(card.id);
    }
    this.stats.streak = ok ? this.stats.streak + 1 : 0;
    this.stats.best = Math.max(this.stats.best, this.stats.streak);
    // Mot du jour : après la première question réussie, une phrase à trous arrive un peu plus loin.
    // Elle varie l'exercice sans compter pour FSRS. Le mot est « apprivoisé » quand elle est réussie.
    let tamedNow = false;
    if (ok && this.today.includes(card.id) && !this.tamed.includes(card.id)) {
      if (item.first && card.clozes.length) this.queue.splice(Math.min(this.queue.length, 3), 0, { id: card.id, kind: 'quiz', retry: true, bonus: true, force: 'cloze-choice' });
      else if (item.bonus || !card.clozes.length || item.retry) { this.tamed.push(card.id); tamedNow = true; }
    }
    this.lastTamed = tamedNow;
    // Une fiche ratée revient un peu plus loin, deux fois au plus par session pour ne pas s'acharner.
    const tries = (item.tries || 0) + 1;
    if (!ok && tries <= 2) this.queue.splice(Math.min(this.queue.length, 3), 0, { id: card.id, kind: 'quiz', retry: true, tries, bonus: item.bonus, force: item.force });
    return this.progress[card.id];
  }

  get remaining() { return this.queue.length; }
}
