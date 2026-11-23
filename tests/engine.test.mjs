// Tests du moteur : node tests/engine.test.mjs [chemin d'un CSV réel]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { check, variants, findSpans, clozes, clozeParts } from '../js/match.js';
import { parseCSV, deckFromCSV, DEMO_CSV, serialize, prepare, demoDeck, MODELS, safeUrl, deckToJSON, deckFromJSON } from '../js/deck.js';
import { review, isDue, inHerd, summary, stageOf } from '../js/scheduler.js';
import { guessLevel } from '../js/deck.js';
import { Session, pickNew, buildActivity, meaning, gloss } from '../js/session.js';

let n = 0; const t = (name, fn) => { fn(); n++; };
const surf = (s, w) => { const f = findSpans(s, w); return f && f.spans.map(p => s.slice(p.start, p.end)).join('|'); };

t('variants', () => {
  assert.deepEqual(variants('Un patron / une patronne'), ['un patron', 'une patronne']);
  assert.deepEqual(variants('Être recruté(e)'), ['être recruté', 'être recrutée']);
  assert.deepEqual(variants('En (durée nécessaire)'), ['en']);
  assert.deepEqual(variants('Le (jour ou date)'), ['le']);
});
t('check', () => {
  assert.deepEqual(check('un emploi', ['un emploi']), { ok: true });
  assert.equal(check('Etre recrute', variants('Être recruté(e)')).note, 'accent');
  assert.equal(check('emploi', ['un emploi']).note, 'article');
  assert.equal(check('le emploi', ['un emploi']).ok, true);
  assert.equal(check('emplo', ['un emploi']).ok, false);
  assert.equal(check('un emploie', ['un emploi']).near, true);
  assert.equal(check('boulot', ['un emploi']).ok, false);
  assert.equal(check('  ', ['x']).empty, true);
  assert.equal(check('le', variants('Le (jour ou date)')).ok, true);
});
t('findSpans', () => {
  assert.equal(surf("J'habite à Lyon depuis trois ans.", 'Depuis'), 'depuis');
  assert.equal(surf("J'ai déménagé il y a deux mois.", 'Il y a'), 'il y a');
  assert.equal(surf('Je travaille de 9 heures à 17 heures.', 'De… à…'), 'de|à');
  assert.equal(surf('Le musée est ouvert du mardi au dimanche.', 'De… à…'), null);
  assert.equal(surf("Je prends mes vacances au mois d'août.", 'Au mois de'), "au mois d'");
  assert.equal(surf('Elle a été recrutée par une banque.', 'Être recruté(e)'), 'recrutée');
  assert.equal(surf("L'entreprise recrute de nouveaux employés.", 'Une entreprise'), 'entreprise');
  assert.equal(surf('Il travaille comme serveur depuis deux ans.', 'Travailler'), 'travaille');
  assert.equal(surf('La cheffe répartit les tâches.', 'Un chef / une cheffe'), 'cheffe');
  assert.equal(surf("J'ai soif, je voudrais de l'eau.", 'Avoir soif'), 'soif');
  assert.equal(surf('La fête aura lieu le 14 juillet.', 'Le (jour ou date)'), 'le');
  assert.equal(surf('Le rendez-vous est à 14 heures.', 'À (heure)'), 'à');
  assert.equal(surf('Elle a décroché un job dans une librairie.', 'Décrocher un job'), 'décroché un job');
  assert.equal(surf('Je taf dans un café.', 'Taffer'), null);
});
t('clozeParts', () => {
  const [c] = clozes({ word: 'Depuis', examples: ["J'habite à Lyon depuis trois ans."] });
  assert.deepEqual(clozeParts(c).map(p => (p.blank ? '_' : p.text)).join(''), "J'habite à Lyon _ trois ans.");
});
t('csv', () => {
  assert.deepEqual(parseCSV('a;b\n"x;1";"y ""z"""\n\n'), [['a', 'b'], ['x;1', 'y "z"']]);
  assert.deepEqual(parseCSV('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
});

const demo = deckFromCSV(DEMO_CSV, 'Démo');
t('deck', () => {
  assert.equal(demo.cards.length, 12);
  const add = demo.cards.find(c => c.word === "L'addition"), note = demo.cards.find(c => c.word === 'La note');
  assert.equal(add.theme, 'Au café'); assert.equal(add.register, 'Registre courant');
  assert.ok(add.neighbours.includes(note.id) && note.neighbours.includes(add.id));
  for (const c of demo.cards) assert.ok(c.clozes.length >= 1, 'pas de phrase à trous : ' + c.word);
  const again = prepare(JSON.parse(JSON.stringify(serialize(demo))));
  assert.deepEqual(again.cards.map(c => c.id), demo.cards.map(c => c.id));
});
t('scheduler', () => {
  const t0 = Date.UTC(2026, 0, 1);
  let st = review({ seen: true, box: 1 }, 'hard', t0);
  assert.equal(st.box, 2); assert.ok(st.fsrs.due > t0 && !isDue(st, t0));
  const hardDays = (st.fsrs.due - t0) / 864e5;
  const good = review({ seen: true, box: 1 }, 'good', t0);
  assert.ok((good.fsrs.due - t0) / 864e5 > hardDays, 'un rappel écrit doit espacer plus qu’une reconnaissance');
  let s2 = review(good, 'good', good.fsrs.due); s2 = review(s2, 'good', s2.fsrs.due);
  assert.ok(inHerd(s2)); assert.equal(s2.box, 4);
  const lapse = review(s2, 'again', s2.fsrs.due);
  assert.equal(lapse.box, 3); assert.ok(lapse.fsrs.stability < s2.fsrs.stability);
  assert.equal(JSON.parse(JSON.stringify(lapse)).fsrs.due, lapse.fsrs.due);
});
t('pickNew sépare les familles', () => {
  const p = {}; const chosen = pickNew(demo, p, 12);
  const ids = new Set(chosen.map(c => c.id));
  for (const c of chosen) assert.ok(!c.neighbours.some(id => ids.has(id)), c.word);
  assert.ok(chosen.some(c => c.word === "L'addition") && !chosen.some(c => c.word === 'La note'));
  const add = demo.cards.find(c => c.word === "L'addition");
  p[add.id] = { seen: true, box: 2 };
  assert.ok(!pickNew(demo, p, 12).some(c => c.word === 'La note'), 'la note attend la boîte 3');
  p[add.id] = { seen: true, box: 3 };
  assert.ok(pickNew(demo, p, 12).some(c => c.word === 'La note'));
});
t('activités', () => {
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const c of demo.cards) for (let box = 1; box <= 5; box++) for (let k = 0; k < 5; k++) {
    const a = buildActivity(demo, c, box, rnd);
    if (a.options) {
      assert.equal(a.options.length, 3, c.word + ' ' + a.type);
      assert.equal(new Set(a.options).size, 3);
      assert.ok(a.options.includes(a.answer));
    } else for (const v of a.accepted) assert.ok(check(v, a.accepted).ok, c.word);
    if (box >= 4) assert.equal(a.recognition, false);
  }
});
t('session complète', () => {
  let now = Date.UTC(2026, 0, 1), seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const progress = {};
  for (let day = 0; day < 40; day++) {
    const s = new Session(demo, progress, { minutes: 5, maxNew: 5, now, rnd });
    const introduced = new Set(); let step, guard = 0;
    while ((step = s.next(now)) && guard++ < 500) {
      if (step.intro) { introduced.add(step.card.id); continue; }
      assert.ok(!demo.cards.some(c => c.id === step.card.id && !progress[c.id]?.seen), 'question avant découverte');
      s.answer(step, rnd() > 0.25, now);
      now += 8000;
    }
    assert.ok(guard < 500);
    now += 864e5;
  }
  const sum = summary(demo, progress, now);
  assert.equal(sum.fresh, 0); assert.ok(sum.herd >= 1, 'aucun mot dans le troupeau après 40 jours');
  assert.ok(sum.memory > 0.3 && sum.memory <= 1);
});
t('durée dépassée : plus de nouvelles fiches', () => {
  const now = Date.UTC(2026, 0, 1);
  const s = new Session(demo, {}, { minutes: 5, now });
  assert.equal(s.next(now + 6 * 60000), null);
});

t('langues : traductions par colonne', () => {
  const en = deckFromCSV(MODELS.en.csv, 'EN', 'en'), es = deckFromCSV(MODELS.es.csv, 'ES', 'es'), fr = deckFromCSV(MODELS.fr.csv, 'FR', 'fr');
  assert.deepEqual(en.helpLangs, ['fr']); assert.deepEqual(es.helpLangs, ['fr', 'en']); assert.deepEqual(fr.helpLangs, []);
  assert.equal(gloss(es.cards[0], 'en'), 'An appointment'); assert.equal(gloss(es.cards[0], 'fr'), 'Un rendez-vous');
  assert.equal(meaning(en.cards[0], 'fr'), en.cards[0].definition);
  assert.equal(en.cards[0].ipa, '/ˈded.laɪn/');
  for (const d of [en, es, fr]) for (const c of d.cards) assert.ok(c.clozes.length, 'modèle sans phrase à trous : ' + c.word);
  const only = deckFromCSV('Mot;Traduction (anglais);Trad. FR\nUna casa;A house;Une maison\nUn perro;A dog;Un chien\nUn gato;A cat;Un chat', 'x', 'es');
  assert.equal(meaning(only.cards[0], 'fr'), 'Une maison'); assert.equal(meaning(only.cards[0], 'de'), 'A house');
  const old = prepare({ id: 'o', name: 'o', lang: 'fr', cards: [{ id: '1', word: 'a', translation: 'b', examples: [] }] });
  assert.equal(meaning(old.cards[0], 'fr'), 'b');
});
t('images et liens', () => {
  assert.ok(demoDeck().cards.filter(c => c.image).length === 5);
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('https://x.org/a.png'), 'https://x.org/a.png');
  assert.equal(safeUrl('images/cafe.png'), 'images/cafe.png'); assert.equal(safeUrl('../x'), '');
});
t('première session : découverte, choix, puis phrase à trous ; mots apprivoisés', () => {
  const now = Date.UTC(2026, 0, 1), progress = {};
  const s = new Session(demo, progress, { now });
  assert.equal(s.today.length, 3);
  const types = []; let step, guard = 0;
  while ((step = s.next(now)) && guard++ < 50) {
    if (step.intro) { types.push('intro'); continue; }
    types.push(step.activity.type); s.answer(step, true, now);
  }
  assert.equal(types.filter(x => x === 'intro').length, 3);
  assert.equal(types.filter(x => x === 'qcm').length, 3);
  assert.equal(types.filter(x => x === 'cloze-choice').length, 3);
  assert.equal(s.tamed.length, 3); assert.equal(s.stats.answered, 3); assert.equal(s.stats.best, 6);
  for (const id of s.today) assert.equal(progress[id].box, 2);
});

t('gloses et homographes : la question ne donne pas la réponse', () => {
  const g = deckFromCSV(`Word;Definition;Example 1;Category
Au (siècle);Pour situer un événement dans un siècle.;Victor Hugo a vécu au XIXe siècle.;Temps · Grammaire
En (durée nécessaire);Indique le temps nécessaire pour faire une action.;J'ai terminé cet exercice en vingt minutes.;Temps · Grammaire
En (mois, année, saison);Pour situer une action dans un mois ou une année.;Je suis né en 2004.;Temps · Grammaire
Depuis;Indique qu'une action a commencé dans le passé et continue.;J'habite ici depuis trois ans.;Temps · Grammaire
Pendant;Indique la durée complète d'une action.;J'ai dormi pendant huit heures.;Temps · Grammaire`, 'g');
  const au = g.cards[0], en1 = g.cards[1];
  assert.equal(au.bare, 'Au'); assert.ok(g.homographs.has('en')); assert.ok(!g.homographs.has('au'));
  for (let k = 0; k < 20; k++) {
    const a = buildActivity(g, au, 1); assert.equal(a.type, 'cloze-choice');
    assert.ok(a.options.every(o => !o.includes('(')));
    const b = buildActivity(g, en1, 1); assert.equal(b.type, 'cloze-choice');
    assert.equal(b.options.filter(o => o === 'en').length, 1, 'une seule option « en »');
    const c = buildActivity(g, g.cards[3], 1); assert.equal(c.type, 'qcm');
    const d = buildActivity(g, en1, 4); assert.deepEqual(d.accepted, ['en']);
  }
  const split = deckFromCSV('Word;Definition;Example 1\nAu… de;Pour situer dans un mois.;Je pars au mois d\'août.\nDepuis;x y z;Je suis ici depuis hier.\nPendant;a b c;Il dort pendant le film.', 's');
  assert.equal(split.cards[0].clozes[0].answer, "au … d'");
});
t('format json : aller-retour avec image', () => {
  const d = demoDeck(); const back = deckFromJSON(deckToJSON(d));
  assert.equal(back.cards.length, 12); assert.equal(back.id, d.id);
  assert.deepEqual(back.cards.map(c => c.id), d.cards.map(c => c.id));
  assert.ok(back.cards.find(c => c.word === 'Un café').image.startsWith('data:image/svg+xml'));
  assert.throws(() => deckFromJSON('{"cards":[{"word":"a","image":"javascript:1"}]}'));
});

t('niveau et étapes', () => {
  assert.equal(guessLevel('Au café (A1)'), 'A1'); assert.equal(guessLevel('Mobilité B2 vers B2+'), 'B2'); assert.equal(guessLevel('Travail'), 'A2');
  assert.equal(demoDeck().level, 'A1'); assert.equal(deckFromCSV(MODELS.en.csv, 'x', 'en', 'C1').level, 'C1');
  assert.equal(deckFromJSON(deckToJSON(deckFromCSV(MODELS.en.csv, 'x', 'en', 'B2'))).level, 'B2');
  const mk = n => prepare({ id: 'k', name: 'k', lang: 'fr', cards: Array.from({ length: n }, (_, i) => ({ id: 'c' + i, word: 'mot' + i, definition: 'définition ' + i, examples: [] })) });
  assert.equal(stageOf(mk(12), {}).count, 1); assert.equal(stageOf(mk(85), {}).count, 9); assert.equal(stageOf(mk(84), {}).count, 8);
  const d = mk(25), p = {}; let st = stageOf(d, p);
  assert.deepEqual([st.index, st.count, st.size, st.seen], [1, 3, 10, 0]);
  for (let i = 0; i < 10; i++) p['c' + i] = { seen: true, box: 1 };
  st = stageOf(d, p); assert.deepEqual([st.index, st.size, st.seen, st.allSeen], [2, 10, 0, false]);
  for (let i = 10; i < 25; i++) p['c' + i] = { seen: true, box: 1 };
  st = stageOf(d, p); assert.deepEqual([st.index, st.size, st.seen, st.allSeen], [3, 5, 5, true]);
});

const real = process.argv[2];
if (real && fs.existsSync(real)) {
  const d = deckFromCSV(fs.readFileSync(real, 'utf8'), 'A2+');
  const none = d.cards.filter(c => !c.clozes.length).map(c => c.word);
  const nb = d.cards.filter(c => c.neighbours.length).length;
  console.log(`CSV réel : ${d.cards.length} fiches, ${d.skipped} ignorées, ${d.cards.length - none.length} avec phrase à trous, ${nb} avec voisines`);
  console.log('Sans phrase à trous :', none.join(' | ') || 'aucune');
  const show = w => { const c = d.cards.find(x => x.word === w); return c && `${w} → ${c.clozes.map(x => x.answer).join(' / ')} ; voisines : ${c.neighbours.map(id => d.byId[id].word).join(', ')}`; };
  for (const w of ['Un boulot', 'Bosser', 'Avoir du taf', 'Être viré(e)', 'Un emploi', 'Jusqu\'à']) console.log(show(w));
}
console.log(`${n} groupes de tests réussis`);
