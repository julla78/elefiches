// Tests du moteur : node tests/engine.test.mjs [chemin d'un CSV réel]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { check, variants, findSpans, clozes, clozeParts } from '../js/match.js';
import { parseCSV, deckFromCSV, DEMO_CSV, serialize, prepare, demoDeck, MODELS, safeUrl, deckToJSON, deckFromJSON, mergeDecks, decode, audit } from '../js/deck.js';
import { review, isDue, inHerd, summary, stageOf } from '../js/scheduler.js';
import { guessLevel } from '../js/deck.js';
import { Session, Challenge, Tour, pickNew, buildActivity, meaning, gloss, chunks, judge, hintOf, roomFor, neutral } from '../js/session.js';
import { bookish, sceneLike } from '../js/deck.js';
import { kindOf, genderOf, startOf, cluster, tightGap } from '../js/session.js';
import { diffParts, spoken, slug } from '../js/match.js';
import { SPEC, WRITING } from '../js/levels.js';
import { unzip } from '../js/zip.js';
import { buildPrompts } from '../js/prompts.js';
import { levelIn, looksJSON, deckFromAnki } from '../js/deck.js';
import { openSqlite } from '../js/sqlite.js';
import { execFileSync } from 'node:child_process';

// État de fiche réaliste (tel que le calendrier le produit), pour les tests de sauvegarde.
const st = (box, last, extra = {}) => ({ seen: true, box, lastOk: true, fsrs: { state: 2, stability: 5, difficulty: 5, due: last + 86400000, last_review: last, reps: 1, lapses: 0, ...extra } });
// Les groupes asynchrones sont attendus avant le bilan : un échec ne peut pas passer inaperçu.
let n = 0; const pending = [], t = (name, fn) => { const r = fn(); if (r?.then) pending.push(r.catch(e => { console.error('ÉCHEC :', name); throw e; })); n++; };
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
t('activités : une forme par boîte, du choix à la réponse écrite', () => {
  let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const want = { 1: 'qcm', 2: 'qcm-rev', 3: 'cloze-type', 4: 'order', 5: 'situation-type' };
  for (const c of demo.cards) for (let box = 1; box <= 5; box++) for (let k = 0; k < 5; k++) {
    const a = buildActivity(demo, c, box, rnd);
    assert.equal(a.type, want[box], c.word);
    if (a.options) {
      assert.equal(a.options.length, 3, c.word + ' ' + a.type);
      assert.equal(new Set(a.options).size, 3);
      assert.ok(a.options.includes(a.answer));
    } else if (a.accepted) {
      assert.ok(judge(a.answer, a, demo).ok, c.word); assert.equal(a.hint, hintOf(a.answer, 'first'), 'A2 : première lettre');
    }
    if (a.type === 'order') {
      // les morceaux ne portent ni la majuscule du début ni le point final : l'écran les remet autour de la phrase construite
      const built = a.solution.join(' '), shown = (a.lead ? a.lead + ' ' : '') + built[0].toUpperCase() + built.slice(1) + a.tail;
      assert.equal(shown.replace(/\s+([?!])/g, '$1'), a.answer.replace(/\s+([?!])/g, '$1')); assert.notEqual(a.chunks.map(x => x.text).join(' '), built);
      assert.ok(!/[.!?…]$/.test(a.solution[a.solution.length - 1]), 'pas de ponctuation finale dans le dernier morceau');
      assert.ok(a.chunks.length >= 3 && a.chunks.length <= 4, 'niveau A : quatre morceaux au plus');
    }
    if (a.type === 'situation-type') { assert.equal(a.cloze.text, c.examples[0].replace(/’/g, "'")); assert.equal(a.situation, c.situation); }
    assert.equal(a.gated, box === 2, 'rappel de tête avant les choix en boîte 2');
  }
  const b1 = deckFromCSV(DEMO_CSV, 'Démo', 'fr', 'B1');
  assert.equal(buildActivity(b1, b1.cards[0], 1, rnd).options.length, 4, 'quatre options à partir de B1');
  assert.ok(buildActivity(b1, b1.cards[0], 4, rnd).chunks.length > 4, 'morceaux plus petits à partir de B1');
  assert.equal(buildActivity(b1, b1.cards[0], 3, rnd).hint, '', 'pas d’aide à l’écriture à partir de B1');
  // Mots pièges écrits pour le premier exemple : ce sont eux les leurres ; le paquet ne complète que s'il en manque.
  const cafe = demo.cards[0], own = cafe.distractors;
  assert.deepEqual(own, ['lait', 'chocolat']);
  for (let k = 0; k < 10; k++) {
    const a = buildActivity(demo, cafe, 1, rnd, { force: 'cloze-choice' });
    assert.equal(a.cloze.text, cafe.examples[0]); assert.equal(a.options.filter(o => own.includes(o)).length, 2, 'les mots pièges de la fiche servent de leurres'); assert.equal(a.options.length, 3);
    const b = buildActivity(b1, b1.cards[0], 1, rnd, { force: 'cloze-choice' });
    assert.equal(b.options.filter(o => own.includes(o)).length, 2); assert.equal(b.options.length, 4);
  }
  // Rattrapage : la bonne réponse face à l'erreur commise, sans rappel de tête.
  const r2 = buildActivity(demo, cafe, 1, rnd, { force: 'qcm', contrast: { text: meaning(demo.cards[1]), id: demo.cards[1].id } });
  assert.equal(r2.options.length, 2); assert.equal(r2.from[meaning(demo.cards[1])], demo.cards[1].id); assert.equal(r2.gated, false);
  // Rattrapage d'une réponse écrite : aide maximale, quel que soit le niveau.
  assert.equal(buildActivity(b1, b1.cards[0], 3, rnd, { force: 'cloze-type', help: true }).hint, 'c _ _ _');
  // Sans exemple ni situation, l'échelle se replie sur une forme possible.
  const bare = prepare({ id: 'b', name: 'b (A2)', lang: 'fr', cards: ['chat', 'chien', 'oiseau', 'poisson'].map((w, i) => ({ id: 'x' + i, word: 'Un ' + w, definition: 'animal numéro ' + i, examples: [] })) });
  assert.equal(buildActivity(bare, bare.cards[2], 3, rnd).type, 'type'); assert.equal(buildActivity(bare, bare.cards[2], 3, rnd).hint, 'u…');
  assert.equal(buildActivity(bare, bare.cards[2], 4, rnd).type, 'type');
  const nums = prepare({ id: 'n', name: 'n (A1)', lang: 'fr', cards: [['quatre-vingt-douze', '92'], ['soixante-dix', '70'], ['seize', '16']].map(([w, d], i) => ({ id: 'n' + i, word: w, definition: d, examples: [] })) });
  const num = buildActivity(nums, nums.cards[0], 3, rnd); assert.equal(num.type, 'number');
  assert.ok(judge(' 92 ', num, nums).ok); assert.ok(!judge('93', num, nums).ok); assert.ok(judge('', num, nums).empty);
});
t('réponse écrite : tolérance réglée par le niveau du CECRL', () => {
  const act = { type: 'cloze-type', answer: 'terrasse', accepted: ['terrasse'], lemmas: ['une terrasse'] }, acc = { type: 'cloze-type', answer: 'café', accepted: ['café'], lemmas: ['un café'] };
  const at = lv => ({ level: lv });
  // A1 et A2 : une lettre d'écart est acceptée et corrigée ; l'accent oublié aussi.
  assert.deepEqual(judge('terasse', act, at('A1')), { ok: true, note: 'near' }); assert.deepEqual(judge('caffé', acc, at('A2')), { ok: true, note: 'near' });
  assert.equal(judge('cafe', acc, at('A2')).note, 'accent'); assert.ok(!judge('tarase', act, at('A1')).ok);
  // B1 et B2 : accent accepté et signalé ; une lettre d'écart donne droit à un second essai, puis compte comme une erreur.
  assert.equal(judge('cafe', acc, at('B1')).note, 'accent'); assert.deepEqual(judge('terasse', act, at('B2')), { retry: true, accent: false });
  assert.deepEqual(judge('terasse', act, at('B2'), true), { ok: false, near: true }); assert.ok(judge('terrasse', act, at('B2'), true).ok);
  // C1 et C2 : orthographe exacte, accents compris.
  assert.deepEqual(judge('cafe', acc, at('C1')), { retry: true, accent: true }); assert.deepEqual(judge('cafe', acc, at('C2'), true), { ok: false, near: true });
  assert.ok(judge('Café ', acc, at('C2')).ok);
  // La forme de base à la place de la forme de la phrase est acceptée et signalée, à tous les niveaux.
  assert.equal(judge('une terrasse', act, at('C1')).note, 'article'); assert.ok(judge('', act, at('B1')).empty);
  assert.equal(judge('bosser', { type: 'cloze-type', answer: 'bosse', accepted: ['bosse'], lemmas: ['bosser'] }, at('B1')).note, 'form');
  assert.equal(hintOf('café', 'pattern'), 'c _ _ _'); assert.equal(hintOf('il y a', 'pattern'), 'i _   _   _'); assert.equal(hintOf('café', 'first'), 'c…'); assert.equal(hintOf('café', ''), '');
  for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) { assert.ok(SPEC[lv].options >= 3); for (const k of ['words', 'def', 'ex', 'traps']) assert.ok(WRITING[lv][k].length > 20); }
  assert.deepEqual(diffParts('terrasse', 'terasse'), ['ter', 'r', 'asse']);
  assert.deepEqual(chunks('Tu as faim ? Il y a des croissants.', 4), ['Tu as', 'faim ? Il', 'y a', 'des croissants.']);
  assert.equal(chunks('Oui merci', 4), null);
});
t('session : difficulté ressentie, récapitulatif du jour, aperçu', () => {
  const now = Date.UTC(2026, 0, 1), P = {}; const s = new Session(demo, P, { now });
  let step, last = null; const kinds = [];
  while ((step = s.next(now))) { if (step.intro) continue; kinds.push(step.activity.type); last = step; s.answer(step, true, now, { hesitated: step.item.bonus }); }
  assert.equal(kinds.at(-1), 'match', 'la session se termine par un tableau des mots du jour'); assert.equal(last.activity.left.length, 3);
  for (const id of s.today) assert.equal(P[id].box, 2);
  const P2 = {}, s2 = new Session(demo, P2, { now }); while ((step = s2.next(now))) if (!step.intro) s2.answer(step, true, now);
  const mean = (Q, ids) => ids.reduce((x, id) => x + Q[id].fsrs.due, 0) / ids.length;
  assert.ok(mean(P2, s2.today) > mean(P, s.today), '« Facile » espace davantage que « J’ai hésité »');
  const tour = new Tour(demo, {}); const seen = []; while ((step = tour.next())) { seen.push(step.activity.type); tour.answer(step, true); }
  assert.deepEqual(seen, ['qcm', 'cloze-choice', 'qcm-rev', 'listen', 'cloze-type', 'listen-type', 'order', 'speak', 'situation-type', 'type', 'sentence', 'match', 'bank']);
});
t("défi d'étape : associer, compléter, employer ; aucune fiche ne bouge", () => {
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const P = Object.fromEntries(demo.cards.map(c => [c.id, { seen: true, box: 2 }])), before = JSON.stringify(P);
  const ch = new Challenge(demo, P, demo.cards.slice(0, 10), { rnd }); const kinds = []; let step;
  while ((step = ch.next())) {
    const a = step.activity; kinds.push(a.type);
    if (a.type === 'match') { assert.equal(a.left.length, 5); assert.deepEqual(a.left.map(p => p.id).sort(), a.right.map(p => p.id).sort()); }
    if (a.type === 'bank') { assert.equal(a.items.length, 4); assert.equal(a.bank.length, 6); for (const it of a.items) assert.ok(a.bank.includes(it.answer)); assert.equal(new Set(a.bank).size, 6); }
    ch.answer(step, a.type !== 'bank', undefined, a.type === 'bank' ? { missed: [a.items[0].id] } : {});
  }
  assert.deepEqual(kinds, ['match', 'match', 'bank', 'situation', 'situation', 'order']);
  assert.equal(ch.stats.answered, 6); assert.equal(ch.stats.ok, 5); assert.equal(ch.stats.missed.length, 1);
  assert.equal(JSON.stringify(P), before, 'le défi ne modifie pas la progression');
});
t('paquet donné par une IA : bloc de code, planches, niveau', () => {
  const json = '```json\n{"elefiches":1,"name":"Logement (B1)","lang":"fr","level":"B1","cards":[' + ['loyer', 'bail', 'caution'].map((w, i) =>
    `{"word":"Un ${w}","definition":"définition ${i}","translations":{},"examples":["Je paie un ${w} ici.","Le ${w} est signé."],"situation":"situation ${i}","distractors":["a${i}","b${i}"],"image":"${i ? '' : 'p1-3'}"}`).join(',') + ']}\n```\nPlanche 1 : case 3, un loyer…';
  assert.ok(looksJSON(json)); assert.ok(!looksJSON('Word;Definition'));
  const d = deckFromJSON(json);
  assert.equal(d.level, 'B1'); assert.equal(d.cards.length, 3); assert.equal(d.cards[0].sheet, 'P1-3'); assert.ok(!d.cards[0].image);
  assert.equal(d.cards[1].situation, 'situation 1'); assert.deepEqual(d.cards[2].distractors, ['a2', 'b2']); assert.equal(d.grid, '3x3');
  const back = deckFromJSON(deckToJSON(d)); assert.equal(back.cards[0].sheet, 'P1-3'); assert.equal(back.cards[0].situation, 'situation 0');
  assert.throws(() => deckFromJSON('{"cards": [oups'), /bad-json/);
  // Réponse de l'IA coupée en deux blocs : les fiches sont réunies. La grille des planches est lue dans le paquet.
  const two = deckFromJSON('```json\n{"name":"Deux (A2)","level":"A2","grid":"10x9","cards":[{"word":"Un a","definition":"x {y} \\"z\\""},{"word":"Un b","definition":"y"}]}\n```\nSuite :\n```json\n{"cards":[{"word":"Un c","definition":"z"}]}\n```');
  const mk = deckFromJSON('{"name":"m (B2)","level":"B2","lang":"en","cards":[{"word":"to stand out","pos":"verbe","definition":"to be noticeable","examples":["My application [stood out] among two hundred.","She always [stands out]."],"distractors":["stood up","showed off","gave in"]},{"word":"an applicant","pos":"nom","definition":"a person who applies","examples":["Every [applicant] waited outside.","No mark here for the applicant."],"distractors":["an employer","a recruiter","the manager"]},{"word":"a flaw","pos":"nom","definition":"a defect","examples":["It is a [flaw]."]}]}');
  assert.deepEqual(mk.cards[0].examples, ['My application stood out among two hundred.', 'She always stands out.']); assert.deepEqual(mk.cards[0].clozes.map(c => c.answer), ['stood out', 'stands out']);
  assert.deepEqual(new Set(buildActivity(mk, mk.cards[0], 1, Math.random, { force: 'cloze-choice' }).options), new Set(['stood out', 'stood up', 'showed off', 'gave in']), 'forme irrégulière : la marque fait foi');
  assert.deepEqual(new Set(buildActivity(mk, mk.cards[1], 1, Math.random, { force: 'cloze-choice' }).options), new Set(['applicant', 'employer', 'recruiter', 'manager']), 'article retiré des mots pièges');
  assert.equal(mk.cards[1].clozes.length, 2); assert.deepEqual(deckFromJSON(deckToJSON(mk)).cards[0].marks, mk.cards[0].marks);
  assert.equal(two.cards.length, 3); assert.equal(two.grid, '10x9'); assert.equal(two.cards[0].definition, 'x {y} "z"');
  assert.equal(deckFromJSON(json).cards[0].id, deckFromJSON(json.replace('"cards":[', '"cards":[{"word":"Un bail neuf","definition":"d"},')).cards[1].id, 'l’identifiant d’une fiche ne dépend pas de sa place');
  assert.equal(deckFromJSON(json, '', 'C1').level, 'C1', 'le niveau choisi par l’enseignant l’emporte');
  assert.ok(deckFromCSV(DEMO_CSV, 'Travail').levelGuessed, 'niveau absent : à demander');
  assert.ok(!deckFromCSV(DEMO_CSV, 'Travail (B1)').levelGuessed); assert.equal(levelIn('Travail (B1)'), 'B1'); assert.equal(levelIn('Travail'), ''); assert.equal(levelIn('d8fada29-A1SQ2_Week-end.apkg'), 'A1'); assert.equal(levelIn('BA12'), '');
  const csv = deckFromCSV('Mot;Définition;Exemple 1;Situation;Distracteurs\nUn loyer;a b;Je paie un loyer.;Fin du mois.;bail | garage\nUn bail;c d;Je signe un bail.;;\nUne caution;e f;Je verse une caution.;;', 'x (A2)');
  assert.equal(csv.cards[0].situation, 'Fin du mois.'); assert.deepEqual(csv.cards[0].distractors, ['bail', 'garage']);
});
t('prompts : langue, niveau, traductions, grille', () => {
  const es = buildPrompts({ lang: 'es', level: 'A2', topic: 'La ciudad', count: 10 });
  assert.ok(es.cards.includes('Niveau A2 du CECRL')); assert.ok(es.cards.includes('"lang":"es","level":"A2","grid":"3x3"')); assert.ok(es.cards.includes('"translations":{"fr":"","en":""}'));
  assert.ok(es.cards.includes('une phrase en français, à la deuxième personne'), 'situation en français jusqu’à B1'); assert.ok(es.cards.includes("enseignant d'espagnol"));
  assert.ok(es.cards.includes(WRITING.A2.ex) && es.cards.includes(WRITING.A2.traps), 'consignes du niveau');
  const b2 = buildPrompts({ lang: 'en', level: 'B2', topic: 'Work', words: 'a deadline\nto hand in\n', grid: '10x9' });
  assert.ok(b2.cards.includes('une phrase en anglais, à la deuxième personne')); assert.ok(b2.cards.includes('paquet de 2 fiches')); assert.ok(b2.cards.includes('- to hand in'));
  assert.ok(b2.cards.includes('"P1-90"') && b2.sheet.includes('10 colonnes et 9 rangées, soit 90 cases')); assert.ok(b2.cards.includes(WRITING.B2.traps));
  assert.ok(buildPrompts({ lang: 'fr', level: 'A1' }).cards.includes('"translations":{}'));
  for (const k of ['file', 'cards', 'sheet', 'next']) assert.ok(es[k].length > 40);
  assert.ok(es.file.includes('UN SEUL fichier ZIP') && es.file.includes('"images/loyer.png"') && !es.file.includes('P1-1'), 'fichier complet : une image par mot, pas de planche');
  assert.ok(buildPrompts({ lang: 'fr', level: 'A1', count: 250 }).file.includes('paquet de 250 fiches'), 'aucune limite au nombre de fiches');
});
t('session complète', () => {
  let now = Date.UTC(2026, 0, 1), seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const progress = {};
  for (let day = 0; day < 500; day++) {
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
  assert.equal(safeUrl('javascript:alert(1)'), ''); assert.equal(safeUrl('https://x.org/a.png'), '', 'aucune image d’un autre site'); assert.equal(safeUrl('//evil.example/x.png'), ''); assert.equal(safeUrl('%2e%2e/%2e%2e/x.png'), ''); assert.equal(safeUrl('/autre/x.png'), ''); assert.equal(safeUrl('images/salle-de-bains.png'), 'images/salle-de-bains.png'); assert.equal(safeUrl('data:text/html,<script>'), ''); assert.ok(safeUrl('data:image/png;base64,AAAA'));
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
  assert.deepEqual(types.slice(0, 6), ['intro', 'intro', 'intro', 'qcm', 'qcm', 'qcm'], 'la première question ne suit jamais immédiatement la découverte');
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
    const d = buildActivity(g, en1, 2); assert.equal(d.type, 'cloze-choice'); assert.ok(d.gated);
    const w = buildActivity(g, en1, 3); assert.equal(w.type, 'cloze-type'); assert.deepEqual(w.accepted, ['en']);
    assert.equal(buildActivity(g, en1, 4).type, 'order');
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

t('délai entre la découverte et la première question', () => {
  const big = prepare({ id: 'k', name: 'k', lang: 'fr', cards: Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, word: 'mot' + i + 'xx', definition: 'définition numéro ' + i, examples: [] })) });
  for (const maxNew of [3, 5, 8]) {
    const s = new Session(big, {}, { maxNew, now: Date.UTC(2026, 0, 1) });
    const order = s.queue.map(i => i.kind + ':' + i.id);
    for (const id of s.today) assert.ok(order.indexOf('quiz:' + id) - order.indexOf('intro:' + id) >= 3, `${maxNew} mots : ${order.join(' ')}`);
  }
  const t0 = Date.UTC(2026, 0, 1), s = new Session(big, {}, { maxNew: 3, now: t0 }); s.next(t0); s.next(t0); s.next(t0);
  const a = s.next(t0).activity;                      // les leurres sont les autres mots du jour
  assert.deepEqual([...a.options].sort(), ['définition numéro 0', 'définition numéro 1', 'définition numéro 2']);
});

t('anti-hasard : un mot nouveau ne monte pas sur une seule réussite', () => {
  const now = Date.UTC(2026, 0, 1), P = {}; const s = new Session(demo, P, { now });
  let step; const seen = {};
  while ((step = s.next(now))) {
    if (step.intro) continue;
    const id = step.card.id; seen[id] = (seen[id] || 0) + 1;
    if (seen[id] === 1) { s.answer(step, true, now); assert.equal(P[id].box, 1, 'après le seul choix du sens, le mot reste en boîte 1'); assert.ok(!P[id].fsrs); }
    else s.answer(step, false, now);                 // la phrase à trous est ratée : le mot n'est pas acquis
  }
  for (const id of s.today) { assert.equal(P[id].box, 1); assert.ok(P[id].fsrs && P[id].lastOk === false); }
  assert.equal(s.tamed.length, 0); assert.equal(s.stats.up.length, 0);
});

t('révisions d’abord : pas de nouveaux mots quand les révisions s’accumulent', () => {
  const now = Date.UTC(2026, 0, 1), big = prepare({ id: 'k', name: 'k (A2)', lang: 'fr', cards: Array.from({ length: 40 }, (_, i) => ({ id: 'c' + i, word: 'mot' + i + 'xx', definition: 'définition numéro ' + i, examples: [] })) });
  const due = n => Object.fromEntries(big.cards.slice(0, n).map(c => [c.id, { seen: true, box: 2, fsrs: { due: now - 1000 } }]));
  const few = new Session(big, due(4), { maxNew: 5, now }); assert.equal(few.today.length, 5); assert.ok(!few.held);
  const some = new Session(big, due(12), { maxNew: 5, now }); assert.equal(some.today.length, 2); assert.ok(some.held);
  const many = new Session(big, due(25), { maxNew: 5, now }); assert.equal(many.today.length, 0); assert.ok(many.held);
  assert.equal(many.queue.filter(i => i.kind === 'quiz').length, 25);
  // « J'en veux quand même » : l'étudiant lève le frein pour la session
  const forced = new Session(big, due(25), { maxNew: 5, now, force: true }); assert.equal(forced.today.length, 5); assert.ok(!forced.held);
  assert.deepEqual([roomFor(0, 5), roomFor(9, 5), roomFor(10, 5), roomFor(19, 8), roomFor(20, 8)], [5, 5, 2, 2, 0]);
});

t('écoute, oral et phrase libre : une fiche sur deux, avec repli quand le son manque', () => {
  const d = demoDeck(), rnd = () => 0.3, seen = { 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set() };
  for (const c of d.cards) for (const box of [2, 3, 4, 5]) for (const turn of [0, 1]) seen[box].add(buildActivity(d, c, box, rnd, { audio: true, vary: true, turn }).type);
  assert.ok(seen[2].has('listen') && seen[2].has('qcm-rev'), [...seen[2]].join());
  assert.ok(seen[4].has('speak') && seen[4].has('order'), [...seen[4]].join());
  assert.ok(seen[5].has('sentence') && seen[5].has('situation-type'), [...seen[5]].join());
  for (const c of d.cards) for (const box of [2, 3, 4]) for (const turn of [0, 1]) assert.ok(!['listen', 'listen-type', 'speak'].includes(buildActivity(d, c, box, rnd, { audio: false, vary: true, turn }).type), 'sans son : aucune forme d’écoute ni d’oral');
  const cafe = d.cards[0], li = buildActivity(d, cafe, 2, rnd, { force: 'listen' }), sp = buildActivity(d, cafe, 4, rnd, { force: 'speak' }), se = buildActivity(d, cafe, 5, rnd, { force: 'sentence' }), lt = buildActivity(d, cafe, 3, rnd, { force: 'listen-type' });
  assert.ok(li.listen && !li.gated && li.options.includes(li.answer)); assert.ok(sp.self && sp.model === cafe.examples[0]); assert.deepEqual(se.models, cafe.examples); assert.ok(lt.listen && lt.accepted.length);
  assert.ok(li.pics && Object.keys(li.pics).length === li.options.length || !li.pics, 'niveau A1 ou A2 avec images : le sens se choisit parmi des images');
  // une session entière avec le son : les nouvelles formes se jugent comme les autres
  const P = {}, now = Date.UTC(2026, 0, 1); let s = new Session(d, P, { maxNew: 5, now, audio: true }), n = 0, types = new Set();
  for (let day = 0; day < 500; day++) {
    const at = now + day * 86400000; s = new Session(d, P, { maxNew: 5, now: at, audio: true });
    for (let st = s.next(at); st && n < 20000; st = s.next(at)) { n++; types.add(st.activity?.type); if (st.activity) s.answer(st, true, at, {}); }
  }
  assert.ok(['listen', 'speak', 'sentence'].every(x => types.has(x)), [...types].join());
});

t('sauvegarde : aller-retour, et l’état le plus récent l’emporte', async () => {
  const { makeBackup, readBackup, mergeProgress } = await import('../js/backup.js');
  const d = demoDeck(), now = Date.UTC(2026, 0, 1), a = d.cards[0].id, b = d.cards[1].id;
  const old = { [a]: st(2, now), [b]: st(4, now + 5), _stages: { 1: now }, _race: { best: 9 } };
  const text = makeBackup({ decks: [serialize(d)], progress: { [d.id]: old }, settings: { minutes: 5 }, now });
  const back = readBackup(text);
  assert.equal(back.decks[0].cards.length, d.cards.length); assert.deepEqual(back.progress[d.id][a], old[a]);
  assert.equal(readBackup('{"elefiches":1,"cards":[]}'), null, 'un paquet n’est pas une sauvegarde'); assert.equal(readBackup('pas du json'), null);
  const newer = { [a]: st(3, now + 9), _race: { best: 4 }, _stages: { 2: now } };
  const m = mergeProgress(newer, old, now + 100);
  assert.equal(m[a].box, 3, 'le travail récent n’est pas écrasé par une vieille sauvegarde'); assert.equal(m[b].box, 4, 'une fiche absente est retrouvée');
  assert.deepEqual(Object.keys(m._stages).sort(), ['1', '2']); assert.equal(m._race.best, 9);
});

t('rappel : rendez-vous répété avec alarme, au format des agendas', async () => {
  const { buildICS } = await import('../js/remind.js');
  const ics = buildICS({ time: '18:30', days: 'three', url: 'https://exemple.test/elefiches/', title: 'Éléfiches : 5 minutes, promis', note: 'Ouvre Éléfiches.', now: new Date(2026, 10, 24, 20, 0) });   // un mardi soir
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')); assert.ok(ics.includes('DTSTART:20261125T183000'), 'premier rappel le mercredi suivant');
  assert.ok(ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:PT0M')); assert.ok(ics.includes('SUMMARY:Éléfiches : 5 minutes\\, promis'), 'virgule protégée');
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'aucune ligne de plus de 75 octets');
  assert.ok(buildICS({ time: 'n’importe quoi', now: new Date(2026, 0, 1, 9, 0) }).includes('DTSTART:20260101T180000'));
  assert.ok(buildICS({ days: 'daily' }).includes('RRULE:FREQ=DAILY'));
});

t('contrôle d’un paquet : images, longueur des définitions, exemples', () => {
  const mk = (level, cards) => prepare({ id: 'q', name: 'Q', lang: 'en', level, cards: cards.map((c, i) => ({ id: 'k' + i, examples: [], translations: {}, ...c })) });
  const a1 = mk('A1', [{ word: 'a sheep', definition: 'A farm animal that gives us wool and that we often see in fields in the countryside.', examples: ['The cow is big.'] }, { word: 'a cow', definition: 'A big farm animal.', image: 'data:image/png;base64,AA', examples: ['The cow gives milk.'], situation: 's', distractors: ['dog'] }, { word: 'a horse', definition: 'It is a horse animal.', image: 'data:image/png;base64,AA' }]);
  const found = Object.fromEntries(audit(a1).map(f => [f.key, f]));
  assert.equal(found.auNoImage.cards.length, 1); assert.ok(found.auNoImage.warn, 'A1 : chaque mot doit avoir son image');
  assert.deepEqual(found.auLongDef.cards.map(c => c.word), ['a sheep']); assert.deepEqual(found.auNoExample.cards.map(c => c.word), ['a horse']);
  assert.deepEqual(found.auNoCloze.cards.map(c => c.word), ['a sheep'], 'le mot « sheep » n’est pas dans son exemple'); assert.deepEqual(found.auDefHasWord.cards.map(c => c.word), ['a horse']);
  assert.ok(!found.auNoSituation.warn);
  assert.ok(!audit(mk('B2', [{ word: 'a lease', definition: 'A contract.', examples: ['I signed the lease.'] }])).find(f => f.key === 'auNoImage').warn, 'B2 : image facultative');
});

t('prompts : phrase qui n’admet qu’un mot, image pour chaque fiche en A1, prompt de correction', () => {
  const p = buildPrompts({ lang: 'en', level: 'A1', topic: 'farm animals', count: 12 }), b2 = buildPrompts({ lang: 'fr', level: 'B2', topic: 'le logement', count: 12 });
  assert.ok(p.file.includes('RÈGLES DES PHRASES D\'EXEMPLE') && p.file.includes('présent continu') && p.file.includes('n\'importe quel animal irait'));
  assert.ok(p.file.includes('CHAQUE fiche a une image') && p.cards.includes('CHAQUE fiche a une image')); assert.ok(!b2.file.includes('CHAQUE fiche a une image') && b2.file.includes('N\'illustre pas les mots abstraits'));
  assert.ok(p.review.includes('Livre ensuite de nouveau le paquet COMPLET') && p.review.includes('5. Chaque fiche a une image')); assert.ok(!b2.file.includes('présent continu'));
});

await (async () => {
  // Archive piégée : un petit fichier qui en annonce un petit mais se décompresse en 80 Mo.
  execFileSync('python3', ['-c', `import zipfile
z = zipfile.ZipFile('/tmp/elefiches-bombe.zip', 'w', zipfile.ZIP_DEFLATED); z.writestr('paquet.json', b'0' * 80_000_000); z.close()`]);
  let err = ''; try { await unzip(fs.readFileSync('/tmp/elefiches-bombe.zip')); } catch (e) { err = e.message; }
  t('fichiers piégés : archive trop grosse refusée, clés réservées écartées', () => {
    assert.equal(err, 'zip-big', 'une archive qui se décompresse en 80 Mo est refusée');
    const evil = JSON.stringify({ name: 'X', level: 'A1', cards: [{ id: '__proto__', word: 'a', definition: 'un', translations: { __proto__: 'x', constructor: 'y', fr: 'ok' } }, { id: 'constructor', word: 'b', definition: 'deux' }, { id: '<img src=x onerror=alert(1)>', word: 'c', definition: 'trois' }] });
    const d = deckFromJSON(evil);
    assert.ok(d.cards.every(c => /^[A-Za-z0-9_-]+$/.test(c.id) && !['__proto__', 'constructor'].includes(c.id)), d.cards.map(c => c.id).join());
    assert.deepEqual(Object.keys(d.cards[0].translations), ['fr']); assert.equal(({}).polluted, undefined);
  });
})();

t('sauvegarde forgée : aucune clé réservée ne passe', async () => {
  const { mergeProgress } = await import('../js/backup.js');
  const forged = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":1},"ok":{"seen":true,"box":2,"fsrs":{"state":2,"stability":5,"difficulty":5,"due":9,"last_review":5}},"bad":"texte","sansmemoire":{"seen":true,"box":3},"_stages":{"1":5,"__proto__":{"y":1},"zz":3}}');
  const m = mergeProgress({}, forged);
  assert.deepEqual(Object.keys(m).sort(), ['_stages', 'ok', 'sansmemoire']); assert.equal(m.sansmemoire.box, 1); assert.deepEqual(m._stages, { 1: 5 }); assert.equal(({}).polluted, undefined); assert.equal(m.polluted, undefined);
});

t('voix : ce qui est lu à voix haute', () => {
  assert.equal(spoken('Minuscule / minuscule').toLowerCase(), 'minuscule');   // une seule fois
  assert.equal(spoken('Petit / petite'), 'Petit, petite');
  assert.equal(spoken('Un loyer (mensuel)'), 'Un loyer');
  assert.equal(spoken('De... à...'), 'De à');
  assert.equal(spoken('Depuis…'), 'Depuis');
  assert.equal(spoken('To look for'), 'To look for');
});

t('nom de fichier d’un paquet partagé', () => {
  assert.equal(slug('Week-end à Londres'), 'week-end-a-londres');
  assert.equal(slug('chercher un logement (A2)'), 'chercher-un-logement-a2');
  assert.equal(slug('  ¿Qué tal? — España  '), 'que-tal-espana');
});

const apkg = '/tmp/elefiches-test.apkg';
execFileSync('python3', ['-c', `import sqlite3, zipfile, json, os
p = '/tmp/elefiches-test.anki21'
if os.path.exists(p): os.remove(p)
c = sqlite3.connect(p)
c.execute('create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)')
c.execute('create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)')
models = {'1730000000000': {'name': 'Vocabulaire', 'flds': [{'name': n, 'ord': i} for i, n in enumerate(['Word', 'Image', 'Definition', 'Example', 'Category'])], 'pad': 'x' * 9000}}
c.execute('insert into col values (1,0,0,0,11,0,0,0,?,?,?,?,?)', ('{}', json.dumps(models), json.dumps({'1': {'name': 'Default'}, '2': {'name': 'Week-end (A1)'}}), '{}', '{}'))
rows = [('Sale / sale', '<img src="card_001.png">', "Qui n'est pas propre.", 'La salle de bains est sale.', 'Hôtel'), ('Un oreiller', '<img src="card_002.png">', 'On pose la t&ecirc;te dessus pour dormir.'.replace('&ecirc;', 'ê'), "<div>Je voudrais un oreiller, s'il vous pla&icirc;t.</div>".replace('&icirc;', 'î'), 'Hôtel'), ('Une valise', '', 'Un grand sac rigide pour voyager.', 'Ma valise est &amp; reste trop lourde.', 'Voyage')]
for i, r in enumerate(rows * 60): c.execute('insert into notes values (?,?,?,0,0,?,?,?,0,0,?)', (i + 1, 'g%d' % i, 1730000000000, '', chr(31).join(r) + ('' if i < 3 else ' %d' % i), r[0], ''))
c.commit(); c.close()
z = zipfile.ZipFile('${apkg}', 'w', zipfile.ZIP_DEFLATED)
z.write(p, 'collection.anki21'); z.writestr('media', json.dumps({'0': 'card_001.png', '1': 'card_002.png'})); z.writestr('0', b'\\x89PNG0'); z.writestr('1', b'\\x89PNG1'); z.close()`]);
const ankiFiles = await unzip(fs.readFileSync(apkg));
const ankiDb = openSqlite(await ankiFiles.find(f => f.name === 'collection.anki21').blob.arrayBuffer());
t('paquet Anki : base lue sans bibliothèque, champs reconnus à leur nom', () => {
  assert.deepEqual(ankiDb.tables, ['col', 'notes']); assert.equal(ankiDb.table('notes').length, 180, 'table sur plusieurs pages');
  const d = deckFromAnki(ankiDb, '', 'fr', '');
  assert.equal(d.name, 'Week-end (A1)'); assert.equal(d.level, 'A1'); assert.ok(!d.levelGuessed);
  const [sale, oreiller, valise] = d.cards;
  assert.equal(sale.image, 'card_001.png'); assert.equal(sale.definition, "Qui n'est pas propre."); assert.equal(sale.theme, 'Hôtel'); assert.equal(sale.clozes[0].answer, 'sale');
  assert.equal(oreiller.examples[0], "Je voudrais un oreiller, s'il vous plaît."); assert.ok(!valise.image); assert.equal(valise.examples[0], 'Ma valise est & reste trop lourde.');
  assert.throws(() => openSqlite(new Uint8Array(200).buffer), /sqlite/);
});

// Fabrique un paquet Anki d'essai à partir d'une description : modèles, paquets, notes et cartes.
async function makeAnki(spec) {
  const out = '/tmp/elefiches-any.apkg';
  execFileSync('python3', ['-c', `import sqlite3, zipfile, json, os, sys
spec = json.loads(sys.argv[1]); p = '/tmp/elefiches-any.anki2'
if os.path.exists(p): os.remove(p)
c = sqlite3.connect(p)
c.execute('create table col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text)')
c.execute('create table notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld text, csum integer, flags integer, data text)')
c.execute('create table cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text)')
c.execute('insert into col values (1,0,0,0,11,0,0,0,?,?,?,?,?)', ('{}', json.dumps(spec['models']), json.dumps(spec['decks']), '{}', '{}'))
for i, n in enumerate(spec['notes']):
    c.execute('insert into notes values (?,?,?,0,0,?,?,?,0,0,?)', (i + 1, 'g%d' % i, n['mid'], n.get('tags', ''), chr(31).join(n['f']), n['f'][0], ''))
    c.execute('insert into cards values (?,?,?,0,0,0,0,0,0,0,0,0,0,0,0,0,0,?)', (i + 1, i + 1, n.get('did', 1), ''))
c.commit(); c.close()
z = zipfile.ZipFile('${out}', 'w', zipfile.ZIP_DEFLATED); z.write(p, 'collection.anki2'); z.writestr('media', '{}'); z.close()`, JSON.stringify(spec)]);
  const files = await unzip(fs.readFileSync(out));
  return openSqlite(await files.find(f => f.name === 'collection.anki2').blob.arrayBuffer());
}
const fl = (...names) => names.map((name, ord) => ({ name, ord }));

// Un paquet réel : champs « Picture, Expression, Definition, Category », sans phrase d'exemple.
const dbExpr = await makeAnki({ models: { 11: { id: 11, name: 'Vocabulaire illustré A1', flds: fl('Picture', 'Expression', 'Definition', 'Category') } }, decks: { 1: { name: 'Default' }, 5: { name: 'À boire et à manger – A1' } },
  notes: [['<img src="food_01.jpg">', 'Une pomme', 'Un fruit rond, souvent rouge, vert ou jaune.', 'Les fruits'], ['<img src="food_02.jpg">', 'Un champignon', 'Un aliment qui pousse dans la terre.', 'Les légumes'], ['<img src="food_03.jpg">', 'Un citron', 'Un fruit jaune, au goût très acide.', 'Les fruits']].map(f => ({ mid: 11, did: 5, tags: ' A1 Les_fruits ', f })) });
// Champs sans nom reconnu, apostrophes codées par l'outil qui a fabriqué le paquet, exemples réunis par des puces.
const dbOdd = await makeAnki({ models: { 12: { id: 12, name: 'Mon modèle', sortf: 1, flds: fl('Champ A', 'Champ B', 'Champ C', 'Champ D') } }, decks: { 1: { name: 'Default' }, 6: { name: 'Temps::Durée' }, 7: { name: 'Temps::Limite' } },
  notes: [{ did: 6, f: ['<img src="a.png">', 'En', 'Indique le temps n&#x27;&eacute;cessaire pour finir une action.'.replace('n&#x27;&eacute;', 'n&eacute;'), '• J&#x27;ai terminé cet exercice en vingt minutes. • Elle lit ce livre en deux jours.'] },
    { did: 7, f: ['[sound:b.mp3]<img src="b.png">', 'Jusqu&#x27;à', 'Indique la limite d&#39;une durée.', '<ul><li>La bibliothèque est ouverte jusqu&#x27;à 19 heures.</li><li>Je reste à Paris jusqu&#x27;à vendredi.</li></ul>'] },
    { did: 6, f: ['', 'Pendant', 'Indique la durée d&apos;une action &amp; rien d&rsquo;autre.', 'Il a dormi pendant deux heures.<br>Nous avons parlé pendant le dîner.'] }].map(n => ({ mid: 12, ...n })) });
// Types de notes d'Anki : « Basique » (Recto, Verso) et « Texte à trous », dans le même paquet.
const dbMix = await makeAnki({ models: { 13: { id: 13, name: 'Basique', flds: fl('Recto', 'Verso') }, 14: { id: 14, name: 'Texte à trous', type: 1, flds: fl('Texte', 'Verso supplémentaire') } }, decks: { 1: { name: 'Default' }, 8: { name: 'Mélange B1' } },
  notes: [{ mid: 13, f: ['Un bail', 'Contrat entre le propriétaire et le locataire.<br><img src="bail.jpg">'] }, { mid: 13, f: ['Un garant', '<div>Personne qui promet de payer à ta place.</div>'] }, { mid: 13, f: ['Un préavis', 'Délai à respecter avant de partir.'] },
    { mid: 14, f: ['Je paie mon {{c1::loyer}} le premier du mois.', 'Argent payé chaque mois pour un logement.'] }, { mid: 14, f: ['Elle a {{c1::déménagé::changer de logement}} hier.', ''] }].map(n => ({ did: 8, ...n })) });
t('paquet Anki : n’importe quels champs, apostrophes codées, puces, sous-paquets, texte à trous', () => {
  const a = deckFromAnki(dbExpr, '', 'fr', '');
  assert.equal(a.name, 'À boire et à manger – A1'); assert.equal(a.level, 'A1'); assert.ok(!a.levelGuessed); assert.equal(a.cards.length, 3);
  assert.deepEqual([a.cards[0].word, a.cards[0].definition, a.cards[0].theme, a.cards[0].image], ['Une pomme', 'Un fruit rond, souvent rouge, vert ou jaune.', 'Les fruits', 'food_01.jpg']);
  const b = deckFromAnki(dbOdd, '', 'fr', 'A2'), [en, jusqu, pendant] = b.cards;
  assert.equal(b.name, 'Temps'); assert.equal(en.word, 'En'); assert.equal(en.image, 'a.png'); assert.equal(en.theme, 'Durée'); assert.equal(jusqu.theme, 'Limite');
  assert.deepEqual(en.examples, ["J'ai terminé cet exercice en vingt minutes.", 'Elle lit ce livre en deux jours.']);
  assert.equal(jusqu.word, "Jusqu'à"); assert.equal(jusqu.definition, "Indique la limite d'une durée."); assert.equal(jusqu.audio, 'b.mp3'); assert.equal(jusqu.image, 'b.png');
  assert.deepEqual(jusqu.examples, ["La bibliothèque est ouverte jusqu'à 19 heures.", "Je reste à Paris jusqu'à vendredi."]);
  assert.equal(jusqu.clozes[0].answer.toLowerCase(), "jusqu'à", 'le mot entier est retrouvé dans la phrase');
  assert.equal(pendant.definition, "Indique la durée d'une action & rien d’autre."); assert.equal(pendant.examples.length, 2);
  assert.ok(!JSON.stringify(b.cards).includes('&#'), 'plus aucun code HTML dans les fiches');
  const c = deckFromAnki(dbMix, '', 'fr', ''), by = Object.fromEntries(c.cards.map(x => [x.word, x]));
  assert.equal(c.level, 'B1'); assert.equal(c.cards.length, 5);
  assert.equal(by['Un bail'].definition, 'Contrat entre le propriétaire et le locataire.'); assert.equal(by['Un bail'].image, 'bail.jpg');
  assert.equal(by.loyer.definition, 'Argent payé chaque mois pour un logement.'); assert.equal(by.loyer.examples[0], 'Je paie mon loyer le premier du mois.'); assert.equal(by.loyer.clozes[0].answer, 'loyer');
  assert.equal(by['déménagé'].definition, 'changer de logement');
  const m = mergeDecks([a, c, a], 'Tout');
  assert.equal(m.cards.length, 8, 'les doublons ne sont gardés qu’une fois'); assert.ok(m.levelGuessed, 'niveaux différents : l’enseignant devra choisir'); assert.equal(m.name, 'Tout');
});

t('codes HTML : décodés à l’import et dans les paquets déjà enregistrés', () => {
  assert.equal(decode('J&#x27;ai fini &amp; caf&eacute; &Agrave; jusqu&#39;&agrave; &laquo;&nbsp;oui&nbsp;&raquo; &amp;#x27; R&D &inconnu;'), "J'ai fini & café À jusqu'à « oui » ' R&D &inconnu;");
  const stored = prepare({ id: 'x', name: 'Vieux (A2)', lang: 'fr', cards: [{ id: 'c1', word: 'Jusqu&#x27;à', definition: 'Limite d&#x27;une durée.', examples: ['Je reste jusqu&#x27;à vendredi.'], distractors: ['d&#x27;ici'], translations: { en: 'until &amp; up to' } }] });
  const k = stored.cards[0];
  assert.deepEqual([k.word, k.definition, k.examples[0], k.distractors[0], k.translations.en, k.id], ["Jusqu'à", "Limite d'une durée.", "Je reste jusqu'à vendredi.", "d'ici", 'until & up to', 'c1']);
  const csv = deckFromCSV('Expression;Definition;Picture\n"Un caf&eacute;";"Boisson d&#x27;adulte.";\nUn thé;Boisson chaude.;\nUn jus;Boisson de fruits.;', 'Essai', 'fr', 'A1');
  assert.equal(csv.cards[0].word, 'Un café'); assert.equal(csv.cards[0].definition, "Boisson d'adulte.");
  const js = deckFromJSON(JSON.stringify({ name: 'J', level: 'A1', cards: [1, 2, 3].map(i => ({ word: 'mot' + i, definition: 'J&#x27;ai le sens ' + i, examples: ['C&#x27;est [mot' + i + '] ici.'] })) }));
  assert.equal(js.cards[0].definition, "J'ai le sens 1"); assert.equal(js.cards[0].examples[0], "C'est mot1 ici."); assert.equal(js.cards[0].clozes[0].answer, 'mot1');
});

const zipFile = '/tmp/elefiches-test.zip';
execFileSync('python3', ['-c', `import zipfile
z = zipfile.ZipFile('${zipFile}', 'w', zipfile.ZIP_DEFLATED)
z.writestr('paquet.json', '{"cards": []}' + ' ' * 2000)
z.writestr('images/planche1.png', b'\\x89PNG' + bytes(range(256)) * 4)
z.writestr('__MACOSX/._x', 'x')
z.close()`]);
const zipped = await unzip(fs.readFileSync(zipFile));
t('archive zip : paquet et images dans un seul fichier', () => {
  assert.deepEqual(zipped.map(f => f.name), ['paquet.json', 'images/planche1.png']);
  assert.equal(zipped[0].blob.size, 2013); assert.equal(zipped[1].blob.size, 4 + 1024); assert.equal(zipped[1].blob.type, 'image/png');
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
t('sécurité : progression forgée reconstruite, paquet démesuré refusé, texte à trous piégé lu vite', async () => {
  const { cleanProgress, mergeProgress, countReplaced } = await import('../js/backup.js');
  const now = Date.UTC(2026, 10, 23), far = Date.UTC(2100, 0, 1);
  const forged = { abc: { seen: 1, box: 99, born: far, lastOk: 'oui', fsrs: { state: 2, stability: 30, difficulty: 4, due: far, last_review: far, note: '<img src=x>', reps: 3 } }, casse: { seen: true, box: 4, fsrs: { due: 1, last_review: 1, state: 99 } }, '<b>x</b>': st(2, now), _race: { best: '<meta http-equiv=refresh content=0;url=//evil>', runs: -5 }, _match: { best: 7.6 }, _autre: { x: 1 } };
  const c = cleanProgress(forged, now);
  assert.deepEqual(Object.keys(c).sort(), ['_match', '_race', 'abc', 'casse']); assert.equal(c.abc.box, 5); assert.equal(c.abc.born, now); assert.equal(c.abc.fsrs.last_review, now);
  assert.ok(c.abc.fsrs.due <= now + 5 * 366 * 86400000); assert.equal(c.abc.fsrs.note, undefined); assert.equal(c.abc.fsrs.reps, 3); assert.strictEqual(c.abc.lastOk, true);
  assert.deepEqual([c.casse.box, c.casse.fsrs], [1, undefined], 'état de mémoire invalide : la fiche redevient tout juste découverte');
  assert.deepEqual(cleanProgress({ neuve: { seen: true, box: 1, born: now - 5 } }, now).neuve, { seen: true, box: 1, lastOk: false, born: now - 5 }, 'fiche découverte, pas encore révisée : gardée');
  assert.deepEqual(c._race, { best: 0, runs: 0 }); assert.deepEqual(c._match, { best: 8, runs: 0 }); assert.ok(!JSON.stringify(c).includes('<'));
  // une sauvegarde datée du futur ne l'emporte pas sur un travail d'aujourd'hui fait après elle
  const mine = { abc: st(2, now) };
  assert.equal(mergeProgress(mine, forged, now).abc.box, 2); assert.equal(countReplaced(mine, forged, now), 0);
  assert.equal(countReplaced({ abc: st(1, now - 5) }, { abc: st(3, now - 1) }, now), 1);
  // un état illisible ne bloque jamais une réponse : le calendrier repart d'une fiche neuve
  const { review } = await import('../js/scheduler.js');
  assert.equal(review({ seen: true, box: 3, fsrs: { due: 1, last_review: 1, state: 99 } }, 'good', now).box, 4);
  // paquet démesuré : refusé d'emblée, ou réduit à 2 000 fiches ; champs coupés
  assert.throws(() => deckFromJSON(JSON.stringify({ name: 'X', level: 'A1', cards: Array.from({ length: 10001 }, (_, i) => ({ word: 'm' + i, definition: 'd' })) })), /too-many/);
  const big = deckFromJSON(JSON.stringify({ name: 'X', level: 'A1', cards: Array.from({ length: 2600 }, (_, i) => ({ word: 'mot' + i, definition: 'd'.repeat(3000), examples: Array.from({ length: 30 }, () => 'x '.repeat(900)), distractors: Array.from({ length: 40 }, (_, k) => 'p' + k) })) }));
  assert.equal(big.cards.length, 2000); assert.equal(big.cards[0].definition.length, 500); assert.equal(big.cards[0].examples.length, 6); assert.ok(big.cards[0].examples[0].length <= 300); assert.equal(big.cards[0].distractors.length, 6);
  // champ Anki piégé : des milliers de « {{c1:: » ne figent plus la lecture
  const t0 = Date.now(), evil = deckFromAnki(await makeAnki({ models: { 20: { id: 20, name: 'Texte à trous', type: 1, flds: fl('Texte', 'Extra') } }, decks: { 1: { name: 'Default' }, 2: { name: 'Piège A1' } },
    notes: [{ mid: 20, did: 2, f: ['{{c1::'.repeat(4000), 'x'] }, { mid: 20, did: 2, f: ['Je paie mon {{c1::loyer}}.', 'Argent du logement.'] }, { mid: 20, did: 2, f: ['Elle signe le {{c1::bail}}.', 'Contrat.'] }, { mid: 20, did: 2, f: ['Il donne son {{c1::préavis}}.', 'Délai.'] }] }), '', 'fr', '');
  assert.ok(Date.now() - t0 < 3000, 'lecture en moins de trois secondes'); assert.ok(evil.cards.some(c => c.word === 'loyer'));
});

// Version 11 : chaque retour d'essai devient un test, pour que l'erreur ne revienne pas.
const farm = () => prepare({ name: 'Farm (A1)', lang: 'en', level: 'A1', cards: [
  ['a cow', 'cow', 'gives us milk', 'Cows'], ['a sheep', 'sheep', 'gives us wool', 'Sheep'], ['a hen', 'hen', 'lays an egg every day', 'Hens'],
  ['a horse', 'horse', 'is pulling the cart', 'Horses'], ['a pig', 'pig', 'is rolling in the mud', 'Pigs'], ['a dog', 'dog', 'is barking at the postman', 'Dogs'],
].map(([word, w, pred, plural], i) => ({ word, definition: 'It is a farm animal.', translations: { fr: 'mot' + i },
  examples: [`The [${w}] ${pred}.`, `We have a [${w}] on our farm.`, `[${plural}] live on farms.`, `Where is my [${w}]?`], situation: 'Tu montres un animal.', image: 'data:image/png;base64,AAAA' })) });

t('phrase à reconstruire : ni majuscule ni ponctuation pour deviner le début et la fin', () => {
  assert.deepEqual(neutral(['A rabbit', 'eats carrots', 'in', 'the garden.'], 'en'), { parts: ['a rabbit', 'eats carrots', 'in', 'the garden'], lead: '', tail: '.' });
  assert.equal(neutral(['Paris', 'est', 'belle.'], 'fr').parts[0], 'Paris', 'un nom propre garde sa majuscule');
  assert.equal(neutral(['I', 'like', 'my dog.'], 'en').parts[0], 'I', 'le « I » anglais garde sa majuscule');
  assert.equal(neutral(["L'appartement", 'est', 'grand.'], 'fr').parts[0], "l'appartement");
  assert.deepEqual(neutral(['¿ Dónde', 'está', 'el baño ?'], 'es'), { parts: ['dónde', 'está', 'el baño'], lead: '¿', tail: '?' });
  assert.equal(neutral(['Marie', 'habite', 'ici.'], 'fr', new Set(['habite'])).parts[0], 'Marie');
  assert.equal(neutral(['Cows', 'give', 'milk.'], 'en', new Set(['cows'])).parts[0], 'cows', 'un mot vu en minuscules ailleurs dans le paquet');
  const deck = farm();
  for (let i = 0; i < 40; i++) {
    const a = buildActivity(deck, deck.cards[i % 6], 4, Math.random, { force: 'order' });
    assert.ok(a.chunks.every(c => !/[.!?]$/.test(c.text)), 'aucun morceau ne porte la ponctuation finale');
    assert.ok(a.chunks.filter(c => /^\p{Lu}/u.test(c.text)).length === 0, 'aucun morceau ne porte une majuscule de début de phrase : ' + a.chunks.map(c => c.text).join(' | '));
  }
});

t('oral : la phrase entière dès le début, avec le mot repéré', () => {
  const deck = farm(), a = buildActivity(deck, deck.cards[0], 4, Math.random, { force: 'speak', audio: true });
  assert.equal(a.model, 'The cow gives us milk.'); assert.equal(a.cloze.answer, 'cow'); assert.ok(a.self);
  assert.equal(clozeParts(a.cloze).filter(p => p.blank).map(p => p.text).join(''), 'cow', 'le mot à mettre en gras');
});

t('phrase libre : quatre modèles, le mot repéré dans chacun, sous des formes variées', () => {
  const deck = farm(), a = buildActivity(deck, deck.cards[0], 5, Math.random, { force: 'sentence' });
  assert.equal(a.models.length, 4); assert.deepEqual(a.modelClozes.map(c => c.answer), ['cow', 'cow', 'Cows', 'cow']);
});

t('phrases à compléter : la première phrase de chaque fiche, celle qui porte l’indice propre au mot', () => {
  const deck = farm(), tour = new Tour(deck, {}, { rnd: Math.random }), steps = []; let step;
  while ((step = tour.next())) { steps.push(step); tour.answer(step, true); }
  const bank = steps.find(s => s.activity.type === 'bank');
  assert.ok(bank && bank.activity.multi, 'exercice à plusieurs fiches : pas de lecture automatique d’un seul mot');
  for (const it of bank.activity.items) assert.equal(it.cloze.text, deck.byId[it.id].examples[0].replace(/[\[\]]/g, ''));
  const match = steps.find(s => s.activity.type === 'match'); assert.ok(match.activity.multi);
});

t('contrôle automatique : phrase de manuel et fiches à moins de quatre phrases', () => {
  for (const e of ['A [rabbit] eats carrots in the garden.', 'A [sheep] lives on this farm.', "A [pig] lives on my uncle's farm."]) assert.ok(bookish(e), e);
  for (const e of ['The [rabbit] is eating a carrot.', '[Rabbits] eat carrots.', 'There is a [rabbit] in the garden.', 'A [cow] has four legs.', 'A [dog] is a good friend.', 'A glass of [milk], please.',
    'A [nurse] helps sick people.', 'A [cow] gives us milk.', 'A [rabbit] eats carrots.', 'A [teacher] works in a school.']) assert.ok(!bookish(e), 'définition ou vérité générale, non signalée : ' + e);
  assert.ok(bookish('A [sheep] eats next to us.'));
  // second repérage, moins sûr : sujet précis + verbe d'action au présent simple, sans repère d'habitude
  for (const e of ['The [dog] plays with my friends.', 'My [cat] sleeps on the sofa.']) assert.ok(sceneLike(e) && !bookish(e), e);
  for (const e of ['The [dog] sleeps in the kitchen every night.', 'The [hen] lays an egg every day.', 'The [cow] gives us milk.', 'The [dog] is playing with my friends.', 'The [dog] always barks.']) assert.ok(!sceneLike(e), e);
  assert.ok(!audit(farm()).some(a => a.key === 'auBookish' || a.key === 'auFewExamples'));
  const bad = prepare({ name: 'x', lang: 'en', level: 'A1', cards: [{ word: 'a rabbit', definition: 'It is an animal.', examples: ['A [rabbit] eats carrots in the garden.'] }, { word: 'a cat', definition: 'It is an animal.', examples: ['The [cat] is sleeping.'] }] });
  assert.equal(audit(bad).find(a => a.key === 'auBookish').cards.length, 1); assert.deepEqual(audit(bad).find(a => a.key === 'auBookish').lines, ['A rabbit eats carrots in the garden.']); assert.equal(audit(bad).find(a => a.key === 'auFewExamples').cards.length, 2);
  const fr = prepare({ name: 'x', lang: 'fr', level: 'A1', cards: [{ word: 'un lapin', definition: 'C’est un animal.', examples: ['A [lapin] eats carrots.'] }] });
  assert.ok(!audit(fr).some(a => a.key === 'auBookish'), 'alerte réservée aux paquets d’anglais');
});

t('prompt : quatre phrases variées, phrases de manuel interdites, contrôle de substitution', () => {
  for (const lang of ['en', 'fr', 'es']) {
    const p = buildPrompts({ lang, level: 'A1', topic: 'Les animaux', count: 12 });
    for (const k of ['file', 'cards']) {
      assert.ok(p[k].includes('"examples":["","","",""]'), k + ' : quatre phrases dans le modèle');
      assert.ok(p[k].includes('QUATRE ou CINQ phrases'), k); assert.ok(p[k].includes('Même début') && p[k].includes('Même thème') && p[k].includes('Même catégorie grammaticale'), k + ' : règles des mots pièges'); assert.ok(p[k].includes('Contrôle de substitution'), k); assert.ok(p[k].includes('phrase de manuel'), k);
    }
    assert.ok(p.review.includes('quatre ou cinq phrases d\'exemple'), 'le prompt de correction complète les fiches'); assert.ok(p.review.includes('commence comme lui'));
  }
  const en = buildPrompts({ lang: 'en', level: 'A1', topic: 'Animals', count: 12 }).file;
  for (const bad of ['A rabbit eats carrots in the garden.', 'A sheep lives on this farm.', 'The dog plays with my friends.']) assert.ok(en.includes(bad), 'contre-exemple cité : ' + bad);
});

t('mots pièges : même nature, même début, même genre, même thème ; rien ne s’élimine par la grammaire ou l’orthographe', () => {
  assert.equal(startOf("l'appartement", 'fr'), 'V'); assert.equal(startOf('un hôtel', 'fr'), 'V'); assert.equal(startOf('une maison', 'fr'), 'C'); assert.equal(startOf('an hour', 'en'), 'C'); assert.equal(startOf('an owl', 'en'), 'V');
  assert.equal(kindOf({ word: 'to run' }), 'verbe'); assert.equal(kindOf({ word: 'a cow' }), 'nom'); assert.equal(kindOf({ word: 'vite', pos: 'adverbe' }), 'adverbe');
  assert.equal(genderOf({ word: 'une maison' }), 'f'); assert.equal(genderOf({ word: 'un loyer' }), 'm'); assert.equal(genderOf({ word: "l'appartement" }), '');
  const mk = (word, ex, theme = 'logement', pos = 'nom') => ({ word, pos, theme, definition: 'définition de ' + word, translations: {}, examples: [ex] });
  const deck = prepare({ name: 'Logement (A2)', lang: 'fr', level: 'A2', cards: [
    mk("un appartement", "J'habite dans l'[appartement] du troisième étage."), mk("un immeuble", "L'[immeuble] a six étages."), mk("un étage", "Je monte à l'[étage] à pied."), mk("un ascenseur", "L'[ascenseur] est en panne."),
    mk("un escalier", "L'[escalier] est très raide."), mk("une cuisine", "La [cuisine] est petite."), mk("une chambre", "Ma [chambre] donne sur la cour."), mk("un loyer", "Le [loyer] est cher."),
    mk("payer", "Je dois [payer] demain.", 'logement', 'verbe'), mk("déménager", "Je vais [déménager] en juin.", 'logement', 'verbe'), mk("une pomme", "Je mange une [pomme].", 'nourriture'), mk("un orage", "L'[orage] arrive.", 'météo'),
  ] });
  const appart = deck.cards[0]; assert.ok(tightGap(appart.clozes[0], 'fr'), 'le trou suit « l’ » : le début est imposé');
  for (let i = 0; i < 30; i++) {
    const a = buildActivity(deck, appart, 1, Math.random, { force: 'cloze-choice' }), others = a.options.filter(o => o !== 'appartement');
    assert.ok(others.every(o => startOf(o, 'fr') === 'V'), 'après « l’ », que des mots à voyelle : ' + others.join(', '));
    assert.ok(others.every(o => !['payer', 'déménager'].includes(o)), 'aucun verbe face à un nom');
    assert.ok(!others.includes('orage') || others.length === 3, 'le thème passe après la grammaire');
    const cuisine = buildActivity(deck, deck.cards[5], 1, Math.random, { force: 'cloze-choice' }).options.filter(o => o !== 'cuisine');
    assert.ok(cuisine.includes('chambre'), 'après « la », le féminin d’abord : ' + cuisine.join(', ')); assert.ok(cuisine.every(o => startOf(o, 'fr') === 'C'));
    const rev = buildActivity(deck, deck.cards[8], 2, Math.random, { force: 'qcm-rev' }).options.filter(o => o !== 'payer');
    assert.ok(rev.includes('déménager'), 'un verbe face au seul autre verbe du paquet : ' + rev.join(', '));
  }
  // un mot piège écrit pour la fiche est écarté s'il ne commence pas comme la réponse alors que l'élision le trahirait
  const own = prepare({ name: 'x (A2)', lang: 'fr', level: 'A2', cards: [{ ...mk("un appartement", "J'habite dans l'[appartement]."), distractors: ['immeuble', 'studio', 'étage'] }, mk("un hôtel", "L'[hôtel] est complet."), mk("un avion", "L'[avion] décolle.")] });
  for (let i = 0; i < 10; i++) assert.ok(!buildActivity(own, own.cards[0], 1, Math.random, { force: 'cloze-choice' }).options.includes('studio'), '« l’studio » se verrait tout de suite');
  // regroupement : les mots associés ensemble sont de même nature
  for (let i = 0; i < 20; i++) { const g = cluster(deck, deck.cards, 5, Math.random); assert.equal(new Set(g.map(kindOf)).size, g[0].pos === 'verbe' ? 2 : 1, g.map(c => c.word).join(', ')); }
});

t('phrase libre : jusqu’à cinq modèles', () => {
  const d = prepare({ name: 'x', lang: 'en', level: 'A1', cards: [{ word: 'a cow', definition: 'It is an animal.', examples: ['The [cow] gives us milk.', 'We have a [cow].', '[Cows] eat grass.', 'Where is my [cow]?', 'I can see two [cows].', 'A sixth [cow] sentence.'] }] });
  assert.equal(buildActivity(d, d.cards[0], 5, Math.random, { force: 'sentence' }).models.length, 5);
});

t('code d’accès enseignant : seule l’empreinte est gardée, un mauvais code ou une ligne abîmée ne laisse entrer personne', async () => {
  const { ACCESS, makeAccess, checkAccess, validAccess } = await import('../js/acces.js');
  assert.ok(ACCESS === '' || validAccess(ACCESS), 'la ligne du dépôt est vide ou bien formée');
  const line = await makeAccess('quatre mots bien choisis', 1000), other = await makeAccess('quatre mots bien choisis', 1000);
  assert.ok(validAccess(line)); assert.ok(!line.includes('quatre')); assert.notEqual(line, other, 'sel aléatoire : deux lignes différentes pour le même code');
  assert.equal(await checkAccess('quatre mots bien choisis', line), true); assert.equal(await checkAccess('  quatre mots bien choisis ', line), true);
  for (const bad of ['quatre mots', 'Quatre mots bien choisis', '', null]) assert.equal(await checkAccess(bad, line), false);
  for (const broken of ['', null, 'pbkdf2$1$00$00', line.slice(0, -1), line.replace('pbkdf2', 'md5'), 'pbkdf2$99999999$' + '0'.repeat(32) + '$' + '0'.repeat(64)]) assert.equal(await checkAccess('quatre mots bien choisis', broken), false);
  await assert.rejects(() => makeAccess('court'), /short/); await assert.rejects(() => makeAccess('123456789012'), /weak/); await assert.rejects(() => makeAccess('1234 5678 9012'), /weak/); await assert.rejects(() => makeAccess('aaaaaaaaaaaab'), /weak/);
  for (const it of ['0000', '9999999']) assert.ok(!validAccess(line.replace('$1000$', '$' + it + '$')), 'une ligne qui ne pourrait jamais s’ouvrir n’active pas la porte');
});

await Promise.all(pending);
console.log(`${n} groupes de tests réussis`);
