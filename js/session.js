// Éléfiches — déroulement d'une session : quelles fiches, dans quel ordre, sous quelle forme.
// Les questions se répondent par un choix ou par une réponse courte écrite (un mot ou une expression).
import { review, isNew, isDue, boxOf, HERD_BOX } from './scheduler.js';
import { check, variants } from './match.js';
import { spec } from './levels.js';

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

// Leurres : [{text, id}]. Des leurres qu'on peut vraiment confondre avec la réponse obligent à retrouver
// ce qu'on sait de chacun pour l'écarter : c'est ce qui rend un choix utile à la mémoire.
function distractors(deck, card, n, rnd, textOf, prefer = []) {
  const used = new Set([textOf(card)]); const out = [];
  const ok = d => d.id !== card.id && d.key !== card.key && !card.neighbours.includes(d.id);
  // Les mots de même nature d'abord (un nom face à des noms), puis ceux découverts le même jour, puis ceux du même thème.
  const same = d => ok(d) && card.pos && d.pos === card.pos;
  const pools = [deck.cards.filter(d => same(d) && prefer.includes(d.id)), deck.cards.filter(d => same(d) && d.theme === card.theme), deck.cards.filter(same), deck.cards.filter(d => ok(d) && prefer.includes(d.id)), deck.cards.filter(d => ok(d) && d.theme === card.theme), deck.cards.filter(ok), deck.cards.filter(d => d.id !== card.id && d.key !== card.key)];
  for (const pool of pools) for (const d of shuffle(pool, rnd)) {
    const t = textOf(d);
    if (!t || used.has(t)) continue;
    used.add(t); out.push({ text: t, id: d.id });
    if (out.length === n) return out;
  }
  return out;
}

const lowerFirst = (s, word) => (/^\p{Lu}/u.test(word.replace(/^\S+\s/, '')) || /^\p{Lu}{2}/u.test(s) ? s : s[0].toLowerCase() + s.slice(1));
// Article en tête d'un mot piège : retiré quand le trou de la phrase ne contient pas d'article.
const ARTICLE = /^(?:un|une|des|du|le|la|les|l'|a|an|the|to|el|los|las|una|unos|unas)(?:\s+|(?<=')\s*)/i;
const isNumber = s => /^\d[\d\s.,]*$/.test(s || '');
const apos = s => s.replace(/[’`´]/g, "'");

// Découpe une phrase en morceaux à remettre dans l'ordre (la ponctuation reste collée au mot qui la précède).
export function chunks(text, max) {
  const w = [];
  for (const tok of text.trim().split(/\s+/)) { if (/^[?!:;»]+$/.test(tok) && w.length) w[w.length - 1] += ' ' + tok; else if (w.length && /^[«¿¡]$/.test(w[w.length - 1])) w[w.length - 1] += ' ' + tok; else w.push(tok); }
  if (w.length < 3) return null;
  const k = Math.min(w.length, max), out = [];
  for (let i = 0; i < k; i++) out.push(w.slice(Math.round(i * w.length / k), Math.round((i + 1) * w.length / k)).join(' '));
  return out;
}

// Aide à l'écriture : la première lettre, avec ou sans la longueur du mot. Jamais plus : on n'épelle pas à la place de l'étudiant.
export function hintOf(answer, mode) {
  if (!mode || !answer) return '';
  if (mode === 'first') return answer[0] + '…';
  return answer.split(' ').map((w, i) => (i ? '_' : w[0]) + ' _'.repeat(Math.max(0, [...w].length - 1))).join('   ');
}

// Juge une réponse écrite selon le niveau du paquet (voir levels.js). second : c'est déjà le second essai.
// Renvoie {ok, note} ; {retry:true} quand un écart d'une lettre donne droit à un second essai ; {empty:true} si rien n'est écrit.
export function judge(value, a, deck, second = false) {
  if (a.type === 'number') { const c = v => String(v).replace(/[\s.,]/g, ''); return c(value) ? { ok: c(value) === c(a.answer) } : { empty: true }; }
  const lenient = spec(deck).lenient;
  let r = check(value, a.accepted, lenient === 2 ? 4 : 5);
  if (r.empty) return r;
  if (!r.ok && a.lemmas && check(value, a.lemmas).ok) return { ok: true, note: 'form' };   // forme de base au lieu de la forme de la phrase
  if (r.ok && r.note === 'accent' && lenient === 0) r = { ok: false, near: true, accent: true };
  if (!r.ok && r.near) {
    if (lenient === 2) return { ok: true, note: 'near' };
    return second ? { ok: false, near: true } : { retry: true, accent: !!r.accent };
  }
  return r;
}

// L'échelle : la forme de l'exercice dépend de la boîte, et chaque boîte travaille un autre aspect du mot.
//   découverte : reconnaître le sens, puis choisir le mot dans une phrase ;
//   boîte 2 : retrouver le mot de tête à partir du sens, avant de voir les choix ;
//   boîte 3 : écrire le mot dans une phrase (réponse courte) ;
//   boîte 4 : reconstruire une phrase qui emploie le mot ;
//   boîte 5 : écrire le mot dans une situation de communication, sans la définition.
// Si une forme est impossible pour une fiche (pas d'exemple, expression en deux morceaux…), la suivante la remplace.
function ladder(deck, card, box) {
  const cl = card.clozes.length > 0;
  // Mot grammatical avec glose (« Au (siècle) ») ou homographe (deux fiches « En ») : seule la phrase lève l'ambiguïté.
  const needsContext = (card.bare !== card.word || deck.homographs.has(card.key)) && cl;
  if (box <= 1) return needsContext ? ['cloze-choice'] : ['qcm'];
  if (box === 2) return needsContext ? ['cloze-choice', 'qcm-rev'] : ['qcm-rev'];
  if (box === 3) return ['number', 'cloze-type', 'type', 'cloze-choice', 'qcm-rev'];
  if (box === 4) return ['order', 'cloze-type', 'type', 'cloze-choice', 'qcm-rev'];
  return ['number', 'situation-type', 'type', 'cloze-type', 'cloze-choice', 'qcm-rev'];
}

// opts.force : forme imposée (rattrapage, phrase « bonus » du jour, défi, aperçu). opts.contrast : {text, id} de la
// mauvaise réponse donnée juste avant ; le rattrapage oppose alors la bonne réponse à cette erreur précise.
// opts.help : aide maximale à l'écriture (rattrapage). opts.gate : impose le rappel de tête (aperçu des exercices).
export function buildActivity(deck, card, box, rnd = Math.random, { force = null, prefer = [], contrast = null, help = false, gate = false } = {}) {
  const mean = c => meaning(c, deck.help), L = spec(deck), lures = L.options - 1;
  const typable = c => c && !c.multi && c.n <= 3, discontinuous = /…|\.\.\./.test(card.word);
  const first = card.clozes.find(c => card.examples[0] && c.text === apos(card.examples[0]));      // phrase à trous du premier exemple
  const cl = card.clozes.length ? pick(card.clozes, rnd) : null;
  const surface = d => (d.clozes.length ? lowerFirst(pick(d.clozes, rnd).answer, d.word) : null);
  const hint = answer => hintOf(answer, help ? 'pattern' : L.hint);
  const choice = (answer, ds, extra = {}) => {
    if (!answer || !ds.length) return null;
    const keep = contrast && contrast.text !== answer ? [contrast] : ds;
    return { answer, options: shuffle([answer, ...keep.map(d => d.text)], rnd), from: Object.fromEntries(keep.filter(d => d.id).map(d => [d.text, d.id])), ...extra };
  };
  const written = (c, extra = {}) => (typable(c) ? { cloze: c, answer: c.answer, accepted: [c.answer], lemmas: variants(card.word), hint: hint(c.answer), ...extra } : null);
  const make = {
    qcm: () => choice(mean(card), distractors(deck, card, lures, rnd, mean, prefer)),
    'qcm-rev': () => choice(card.bare, distractors(deck, card, lures, rnd, d => d.bare, prefer)),
    // Phrase à compléter par un choix. Quand la fiche fournit des mots pièges écrits pour son premier exemple, ce sont
    // eux les leurres : ils s'insèrent dans la phrase sans faute de grammaire. Sinon, les leurres sont des mots du paquet.
    'cloze-choice': () => {
      const fit = w => (first && !ARTICLE.test(first.answer) ? w.replace(ARTICLE, '') : w).trim();
      const own = first ? [...new Set((card.distractors || []).map(fit))].filter(w => w && w.toLowerCase() !== first.answer.toLowerCase()).slice(0, lures) : [];
      const c = own.length ? first : cl; if (!c) return null;
      const answer = lowerFirst(c.answer, card.word), mine = shuffle(own, rnd).map(text => ({ text }));
      const rest = distractors(deck, card, lures, rnd, d => (d.id === card.id ? answer : surface(d)), prefer).filter(d => !own.includes(d.text));
      return choice(answer, [...mine, ...rest].slice(0, lures), { cloze: c });
    },
    'cloze-type': () => written(pick(card.clozes.filter(typable), rnd)),
    'situation-type': () => (card.situation ? written(first, { situation: card.situation }) : null),
    type: () => (discontinuous || isNumber(card.definition) ? null : (v => ({ answer: card.word, accepted: v, hint: hint(v[0]) }))(variants(card.word))),
    order: () => {
      for (const text of shuffle(card.examples.map(apos), rnd)) {
        const parts = chunks(text, L.chunks);
        if (!parts) continue;
        let mixed = parts.map((t, k) => ({ k, text: t }));
        for (let i = 0; i < 6; i++) { mixed = shuffle(mixed, rnd); if (mixed.map(c => c.text).join(' ') !== parts.join(' ')) break; }
        return { answer: text, solution: parts, chunks: mixed };
      }
      return null;
    },
    situation: () => (card.situation && card.examples[0]
      ? (ds => (ds.length === 2 ? choice(card.examples[0], ds, { situation: card.situation }) : null))(distractors(deck, card, 2, rnd, d => d.examples[0], prefer))
      : null),
    number: () => (isNumber(card.definition) ? { answer: card.definition.trim(), accepted: [card.definition.trim()] } : null),
  };
  for (const type of [force, ...ladder(deck, card, box)]) {
    const a = type && make[type]?.();
    if (!a) continue;
    // gated : l'étudiant cherche d'abord la réponse de tête, les choix n'apparaissent qu'ensuite.
    const gated = !!a.options && type !== 'qcm' && type !== 'situation' && !contrast && (gate || (box >= 2 && !force));
    return { type, cardId: card.id, gated, ...a };
  }
  return null;
}

// Tableau d'association (mots et sens) et banque de mots : formes à plusieurs fiches, sans effet sur les boîtes.
function matchStep(deck, ids, rnd) {
  const pairs = ids.map(id => deck.byId[id]).map(c => ({ id: c.id, word: c.bare, meaning: gloss(c, deck.help) || meaning(c, deck.help) }));
  return { card: deck.byId[ids[0]], activity: { type: 'match', multi: true, left: shuffle(pairs, rnd), right: shuffle(pairs, rnd) } };
}
function bankStep(deck, ids, pool, rnd) {
  const items = ids.map(id => deck.byId[id]).map(c => { const cloze = pick(c.clozes.filter(x => !x.multi), rnd); return { id: c.id, cloze, answer: lowerFirst(cloze.answer, c.word) }; });
  const answers = items.map(i => i.answer), extra = [];
  for (const c of shuffle(pool.filter(c => !ids.includes(c.id) && c.clozes.length), rnd)) {
    const s = lowerFirst(c.clozes[0].answer, c.word);
    if (!answers.includes(s) && !extra.includes(s)) extra.push(s);
    if (extra.length === 2) break;
  }
  return { card: deck.byId[ids[0]], activity: { type: 'bank', multi: true, items, bank: shuffle([...answers, ...extra], rnd) } };
}

export class Session {
  constructor(deck, progress, { minutes = 5, maxNew = 3, now = Date.now(), rnd = Math.random } = {}) {
    Object.assign(this, { deck, progress, rnd, startedAt: now, endAt: now + minutes * 60000 });
    this.stats = { answered: 0, ok: 0, fresh: 0, up: [], again: [], herd: [], streak: 0, best: 0 };
    this.served = 0; this.today = []; this.tamed = []; this.waiting = new Set();
    const due = deck.cards.filter(c => isDue(progress[c.id], now))
      .sort((a, b) => (progress[a.id].fsrs?.due ?? 0) - (progress[b.id].fsrs?.due ?? 0));
    const reviews = due.map(c => ({ id: c.id, kind: 'quiz' }));
    const fresh = pickNew(deck, progress, maxNew);
    this.today = fresh.map(c => c.id);
    // Une question posée juste après la découverte est trop facile pour servir la mémoire (le mot est encore
    // « sous les yeux »). On découvre donc trois mots d'affilée, puis découvertes et premières questions alternent :
    // au moins deux autres étapes séparent chaque mot de sa première question.
    const intros = fresh.map(c => ({ id: c.id, kind: 'intro' })), firsts = fresh.map(c => ({ id: c.id, kind: 'quiz', first: true }));
    const news = intros.splice(0, 3);
    while (intros.length) news.push(firsts.shift(), intros.shift());
    news.push(...firsts);
    // Les révisions du jour s'intercalent : deux pour commencer, puis une toutes les deux étapes.
    const q = reviews.splice(0, 2);
    news.forEach((item, i) => { q.push(item); if (i % 2 === 1 && reviews.length) q.push(reviews.shift()); });
    q.push(...reviews);
    this.queue = q;
    this.total = q.length;
  }

  // Prochaine étape, ou null quand la session est finie. Passé la durée choisie, on n'introduit plus rien.
  next(now = Date.now()) {
    if (now > this.endAt) {
      const unseen = new Set(this.queue.filter(i => i.kind === 'intro').map(i => i.id));
      this.queue = this.queue.filter(i => i.retry && !i.bonus && !unseen.has(i.id));
    }
    let item = this.queue.shift();
    // Pour finir : un tableau d'association des mots du jour. Il ne déplace aucune fiche ; il fait revoir une dernière
    // fois, quelques minutes après la découverte, les mots qu'on vient d'apprendre, sous une autre forme.
    if (!item && !this.recap && this.today.filter(id => !isNew(this.progress[id])).length >= 3) { this.recap = true; item = { kind: 'match', ids: this.today.filter(id => !isNew(this.progress[id])).slice(0, 5) }; }
    if (!item) return null;
    this.served++;
    if (item.kind === 'match') return { item, ...matchStep(this.deck, item.ids, this.rnd) };
    const card = this.deck.byId[item.id];
    if (item.kind === 'intro') {
      this.progress[card.id] = { seen: true, box: 1, born: now };
      this.stats.fresh++;
      return { item, card, intro: true };
    }
    return { item, card, activity: buildActivity(this.deck, card, boxOf(this.progress[card.id]) || 1, this.rnd, { force: item.force, prefer: this.today, contrast: item.contrast, help: item.help }) };
  }

  // Enregistre une réponse. Seule la première réponse du jour compte pour FSRS ; les rattrapages non.
  // Un mot découvert aujourd'hui ne monte en boîte 2 qu'après deux réussites de formes différentes (choisir le sens,
  // puis compléter une phrase), comme les « étapes d'apprentissage » d'Anki : une réponse au hasard ne suffit pas.
  // info.assisted : réussi au second essai seulement. info.hesitated : l'étudiant dit avoir hésité.
  // info.chosen : la mauvaise option choisie. Une réussite « au hasard » déclarée arrive ici comme un échec (ok = false).
  answer(step, ok, now = Date.now(), info = {}) {
    const { item, card, activity } = step, P = this.progress;
    if (activity.multi) return P[card.id];
    const before = boxOf(P[card.id]);
    const record = grade => {
      P[card.id] = review(P[card.id], grade, now);
      if (P[card.id].box > before) this.stats.up.push(card.id);
      if (before < HERD_BOX && P[card.id].box >= HERD_BOX) this.stats.herd.push(card.id);
    };
    const twoStep = this.today.includes(card.id) && card.clozes.length > 0;
    let tamedNow = false;
    if (!item.retry) {                                   // première réponse du jour sur cette fiche
      this.stats.answered++;
      if (ok) this.stats.ok++; else this.stats.again.push(card.id);
      if (twoStep && item.first && ok) this.waiting.add(card.id);            // réussite 1 sur 2 : rien n'est encore acquis
      else record(!ok ? 'again' : info.assisted || info.hesitated ? 'hard' : 'good');
    } else if (item.bonus && this.waiting.has(card.id)) {  // phrase à trous du mot du jour : c'est elle qui décide
      this.waiting.delete(card.id);
      record(!ok ? 'again' : info.hesitated ? 'hard' : 'good');
    }
    this.stats.streak = ok ? this.stats.streak + 1 : 0;
    this.stats.best = Math.max(this.stats.best, this.stats.streak);
    if (ok && this.today.includes(card.id) && !this.tamed.includes(card.id)) {
      if (item.first && twoStep) this.queue.splice(Math.min(this.queue.length, 3), 0, { id: card.id, kind: 'quiz', retry: true, bonus: true, force: 'cloze-choice' });
      else if (!this.waiting.has(card.id) && P[card.id].lastOk) { this.tamed.push(card.id); tamedNow = true; }
    }
    this.lastTamed = tamedNow;
    // Une fiche ratée revient un peu plus loin, sous la même forme, deux fois au plus par session pour ne pas s'acharner.
    // Si l'étudiant a choisi une mauvaise réponse, le rattrapage l'oppose à la bonne : il travaille sa confusion précise.
    const tries = (item.tries || 0) + 1;
    if (!ok && tries <= 2) {
      const contrast = info.chosen ? { text: info.chosen, id: activity.from?.[info.chosen] } : item.contrast;
      this.queue.splice(Math.min(this.queue.length, 3), 0, { id: card.id, kind: 'quiz', retry: true, tries, bonus: item.bonus, force: item.force || activity.type, contrast, help: !activity.options });
    }
    return P[card.id];
  }

  get remaining() { return this.queue.length; }
}

// Défi d'étape : un récapitulatif des dix mots d'une étape, quand ils ont tous été découverts un jour précédent.
// Trois moments : associer les mots à leur sens, compléter des phrases avec une banque de mots, puis employer
// les mots en situation. Le défi ne déplace aucune fiche : c'est un entraînement, pas une mesure.
export class Challenge {
  constructor(deck, progress, cards, { rnd = Math.random } = {}) {
    Object.assign(this, { deck, progress, rnd, challenge: true, cards });
    this.stats = { answered: 0, ok: 0, missed: [] };
    this.served = 0; this.today = []; this.tamed = [];
    const cs = shuffle(cards, rnd), q = [];
    const half = cs.length >= 8 ? Math.ceil(cs.length / 2) : cs.length;
    for (const part of [cs.slice(0, half), cs.slice(half)]) if (part.length >= 3) q.push({ kind: 'match', ids: part.slice(0, 5).map(c => c.id) });
    const gaps = shuffle(cards.filter(c => c.clozes.some(x => !x.multi)), rnd).slice(0, 4);
    if (gaps.length >= 3) q.push({ kind: 'bank', ids: gaps.map(c => c.id) });
    const sit = shuffle(cards.filter(c => c.situation && c.examples[0]), rnd).slice(0, 2);
    const ord = shuffle(cards.filter(c => !sit.includes(c) && c.examples.length), rnd).slice(0, 2);
    [...sit.map(c => [c, 'situation']), ...ord.map(c => [c, 'order'])].slice(0, 3).forEach(([c, force]) => q.push({ kind: 'quiz', id: c.id, force }));
    this.queue = q; this.total = q.length;
  }

  next() {
    const item = this.queue.shift();
    if (!item) return null;
    this.served++;
    const { deck, rnd } = this, by = id => deck.byId[id];
    if (item.kind === 'match') return { item, ...matchStep(deck, item.ids, rnd) };
    if (item.kind === 'bank') return { item, ...bankStep(deck, item.ids, this.cards, rnd) };
    const card = by(item.id);
    return { item, card, activity: buildActivity(deck, card, 5, rnd, { force: item.force, prefer: this.cards.map(c => c.id) }) };
  }

  answer(step, ok, now, info = {}) {
    this.stats.answered++;
    if (ok) this.stats.ok++;
    for (const id of info.missed || (ok ? [] : [step.card.id])) if (!this.stats.missed.includes(id)) this.stats.missed.push(id);
    return this.progress[step.card.id];
  }

  get remaining() { return this.queue.length; }
}

// Aperçu des exercices : un exemple de chaque forme, dans l'ordre des boîtes, pour qu'un enseignant voie en deux
// minutes ce qu'un étudiant ne rencontre qu'au fil des jours. Rien n'est enregistré.
export class Tour {
  constructor(deck, progress, { rnd = Math.random } = {}) {
    Object.assign(this, { deck, progress, rnd, challenge: true, tour: true });
    this.stats = { answered: 0, ok: 0, missed: [] }; this.served = 0; this.today = []; this.tamed = [];
    const used = new Set(), q = [];
    for (const [box, type] of [[1, 'qcm'], [1, 'cloze-choice'], [2, 'qcm-rev'], [3, 'cloze-type'], [4, 'order'], [5, 'situation-type'], [5, 'type']]) {
      const card = deck.cards.find(c => !used.has(c.id) && buildActivity(deck, c, box, rnd, { force: type })?.type === type);
      if (card) { used.add(card.id); q.push({ kind: 'quiz', id: card.id, force: type, box }); }
    }
    const ids = deck.cards.slice(0, 5).map(c => c.id), gaps = deck.cards.filter(c => c.clozes.some(x => !x.multi)).slice(0, 4).map(c => c.id);
    q.push({ kind: 'match', ids, box: 0 });
    if (gaps.length >= 3) q.push({ kind: 'bank', ids: gaps, box: 0 });
    this.queue = q; this.total = q.length;
  }
  next() {
    const item = this.queue.shift();
    if (!item) return null;
    this.served++; this.box = item.box;
    if (item.kind === 'match') return { item, ...matchStep(this.deck, item.ids, this.rnd) };
    if (item.kind === 'bank') return { item, ...bankStep(this.deck, item.ids, this.deck.cards, this.rnd) };
    const card = this.deck.byId[item.id];
    return { item, card, activity: buildActivity(this.deck, card, item.box, this.rnd, { force: item.force, gate: item.box >= 2 }) };
  }
  answer(step, ok) { this.stats.answered++; if (ok) this.stats.ok++; return this.progress[step.card.id]; }
  get remaining() { return this.queue.length; }
}
