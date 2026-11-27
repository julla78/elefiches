// Tests du moteur : node tests/engine.test.mjs [chemin d'un CSV réel]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { check, slip, variants, findSpans, clozes, clozeParts } from '../js/match.js';
import { parseCSV, deckFromCSV, DEMO_CSV, serialize, prepare, demoDeck, MODELS, safeUrl, deckToJSON, deckFromJSON, mergeDecks, decode, audit, normGender } from '../js/deck.js';
import { review, isDue, inHerd, summary, stageOf } from '../js/scheduler.js';
import { guessLevel } from '../js/deck.js';
import { Session, Challenge, Tour, pickNew, buildActivity, meaning, gloss, chunks, judge, hintOf, roomFor, neutral } from '../js/session.js';
import { bookish, sceneLike } from '../js/deck.js';
import { kindOf, suggestKind, genderOf, needsGender, formsOf, startOf, cluster, tightGap, sameSense, SELF, genderGap, numberOf } from '../js/session.js';
// L'enseignant confirme le rangement suggéré (écran « Classer les mots ») : sans cela, aucune fiche n'a de catégorie.
const sorted = d => { for (const c of d.cards) if (!c.pos) { const k = suggestKind(c, d.lang); if (k !== 'autre') c.pos = k; } return prepare(d); };
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
  assert.equal(check('Etre recruté', variants('Être recruté(e)')).note, 'accent', 'majuscule sans accent : un écart, comme en minuscule');
  assert.deepEqual(check('Être recruté', variants('Être recruté(e)')), { ok: true }); assert.equal(check('Etre recruté', variants('Être recruté(e)')).cap, true);
  assert.equal(slip('Ecole', 'école'), 'accent'); assert.equal(slip('École', 'école'), ''); assert.equal(slip('ÉCOLE', 'école'), ''); assert.equal(slip('ecole', 'école'), 'accent'); assert.equal(slip('soeur', 'une sœur'), 'œ'); assert.equal(slip('ano', 'año'), 'ñ'); assert.equal(slip('francais', 'français'), 'ç');
  assert.deepEqual(check('hola', ['¡Hola!']), { ok: true, note: 'open' }); assert.deepEqual(check('¡Hola!', ['¡Hola!']), { ok: true }); assert.deepEqual(check('¡hola!', ['hola']), { ok: true });
  assert.equal(check('emploi', ['un emploi']).note, 'article');
  assert.equal(check('le emploi', ['un emploi']).ok, true);
  // Avec la langue du paquet, l'écart d'article est qualifié : oublié, ou qui ne va pas avec le mot.
  assert.deepEqual(check('emploi', ['un emploi'], 5, { lang: 'fr' }), { ok: true, note: 'article', art: 'missing' });
  assert.deepEqual(check('une emploi', ['un emploi'], 5, { lang: 'fr' }), { ok: true, note: 'article', art: 'wrong' });
  assert.deepEqual(check('le café', ['un café'], 5, { lang: 'fr' }), { ok: true }); assert.deepEqual(check('un café', ['café'], 5, { lang: 'fr' }), { ok: true });
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
  assert.equal(demo.cards.length, 15);
  const add = demo.cards.find(c => c.word === "L'addition"), note = demo.cards.find(c => c.word === 'La note');
  assert.equal(add.theme, 'Au café'); assert.equal(add.register, 'courant', 'le registre est ramené à l’un des sept');
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
    // Seul adjectif du paquet : jamais de choix.
    const lone = c.word === 'Cher / chère', odd = lone;      // « Un serveur / une serveuse » : une seule forme est proposée, la fiche a donc ses choix
    assert.equal(a.type, (box === 1 && lone) || (box === 2 && odd) ? 'cloze-type' : want[box], c.word);
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
    assert.equal(a.gated, box === 2 && !odd, 'rappel de tête avant les choix en boîte 2');
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
t('réponse écrite : forme exacte exigée à tous les niveaux, second essai pour une lettre ou un accent', () => {
  const act = { type: 'cloze-type', answer: 'terrasse', accepted: ['terrasse'], lemmas: ['une terrasse'] }, acc = { type: 'cloze-type', answer: 'café', accepted: ['café'], lemmas: ['un café'] };
  const at = (lv, lang = 'fr') => ({ level: lv, lang });
  for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) {
    // Un accent oublié n'est jamais accepté au premier essai : second essai, avec un message sur l'accent.
    assert.deepEqual(judge('cafe', acc, at(lv)), { retry: true, accent: true, slip: 'accent' }, lv);
    assert.deepEqual(judge('cafe', acc, at(lv), true), { ok: false, near: true }, lv + ' : le même écart au second essai est une erreur');
    assert.deepEqual(judge('café', acc, at(lv), true), { ok: true }, lv + ' : corrigé au second essai');
    // Une lettre d'écart : second essai aussi, y compris en A1 et A2 (plus d'acceptation d'une forme fausse).
    assert.deepEqual(judge('terasse', act, at(lv)), { retry: true, accent: false }, lv);
    assert.deepEqual(judge('terasse', act, at(lv), true), { ok: false, near: true }); assert.ok(judge('terrasse', act, at(lv), true).ok);
    assert.ok(!judge('tarase', act, at(lv)).ok && !judge('tarase', act, at(lv)).retry, 'deux lettres d’écart : faux');
    assert.deepEqual(judge('Café ', acc, at(lv)), { ok: true });
  }
  // Mot court : le second essai est plus généreux en A1 et A2 (quatre lettres) qu'au-delà (cinq).
  const chat = { type: 'type', answer: 'chat', accepted: ['chat'] };
  assert.ok(judge('chta', chat, at('A1')).retry === undefined && judge('chas', chat, at('A1')).retry); assert.ok(!judge('chas', chat, at('B1')).retry && !judge('chas', chat, at('B1')).ok);
  // Majuscules : aucune tolérance (décision du 26 novembre). La casse ne compte pas, mais une majuscule garde son accent :
  // « Ecole » donne un second essai comme « ecole », et le message rappelle la touche « Maj » (cap).
  const eco = { type: 'type', answer: 'école', accepted: ['école', 'une école'] }, one = w => ({ type: 'type', answer: w, accepted: [w] });
  assert.deepEqual(judge('Ecole', eco, at('A1')), { retry: true, accent: true, slip: 'accent', cap: true }); assert.deepEqual(judge('Une Ecole', eco, at('B2')), { retry: true, accent: true, slip: 'accent', cap: true });
  assert.deepEqual(judge('ECOLE', eco, at('B2')), { retry: true, accent: true, slip: 'accent', cap: true }); assert.deepEqual(judge('Ecole', eco, at('A1'), true), { ok: false, near: true });
  assert.deepEqual(judge('École', eco, at('A1')), { ok: true }); assert.deepEqual(judge('ÉCOLE', eco, at('C2')), { ok: true }); assert.deepEqual(judge('école', eco, at('A1')), { ok: true }); assert.deepEqual(judge('Une École', eco, at('B2')), { ok: true });
  assert.deepEqual(judge('Ca va', one('ça va'), at('A1')), { retry: true, accent: true, slip: 'ç', cap: true }); assert.deepEqual(judge('Ça va', one('ça va'), at('A1')), { ok: true });
  assert.deepEqual(judge('A bientôt', one('à bientôt'), at('A1')), { retry: true, accent: true, slip: 'accent', cap: true }); assert.deepEqual(judge('À bientôt', one('à bientôt'), at('A1')), { ok: true });
  assert.deepEqual(judge('ecole', eco, at('A1')), { retry: true, accent: true, slip: 'accent' });
  assert.deepEqual(judge('Ecole', one('élève'), at('A1')), { ok: false }, 'un autre mot reste faux');
  assert.deepEqual(judge('Eleve', one('élève'), at('A1')), { retry: true, accent: true, slip: 'accent', cap: true });
  assert.deepEqual(judge('El', one('él'), at('A1', 'es')), { retry: true, accent: true, slip: 'accent', cap: true }, 'plus de majuscule excusée, dans aucune langue');
  // Tout écrire en majuscules ne dispense pas des accents, et « ñ » est exigé même en majuscule (relecture de sécurité, C1).
  assert.equal(judge('ELEVE', one('élève'), at('A1')).slip, 'accent'); assert.equal(judge('GARCON', one('garçon'), at('A1')).slip, 'ç'); assert.equal(judge('NOEL', one('noël'), at('A1')).slip, 'ë');
  assert.equal(judge('ANO', one('año'), at('A1', 'es')).slip, 'ñ'); assert.equal(judge('NINO', one('niño'), at('A1', 'es')).slip, 'ñ'); assert.equal(judge('Ñu', one('ñu'), at('A1', 'es')).ok, true); assert.equal(judge('Nu', one('ñu'), at('A1', 'es')).slip, 'ñ');
  assert.equal(judge('SI', one('sí'), at('A1', 'es')).slip, 'accent'); assert.equal(judge('OU', one('où'), at('A1')).slip, 'accent'); assert.equal(judge('SOEUR', one('sœur'), at('A1')).slip, 'œ');
  // Accent en trop ou confondu : même traitement.
  assert.equal(judge('ecolé', eco, at('A2')).slip, 'accent'); assert.equal(judge('ècole', eco, at('A2')).slip, 'accent');
  // Cédille, « ñ », « œ », tréma : le message peut nommer la lettre.
  assert.equal(judge('garcon', one('garçon'), at('A1')).slip, 'ç'); assert.equal(judge('soeur', one('sœur'), at('A1')).slip, 'œ');
  assert.equal(judge('ano', one('año'), at('A1', 'es')).slip, 'ñ'); assert.equal(judge('pinguino', one('pingüino'), at('B2', 'es')).slip, 'ü');
  assert.equal(judge('noel', one('noël'), at('B1')).slip, 'ë'); assert.equal(judge('nino', one('niño'), at('A1', 'es'), true).ok, false);
  assert.deepEqual(judge('sœur', one('sœur'), at('A1')), { ok: true }); assert.deepEqual(judge('sœur', one('soeur'), at('A1')), { ok: true }, 'paquet écrit sans ligature : la bonne graphie de l’étudiant est acceptée'); assert.deepEqual(judge('año', one('año'), at('A1', 'es')), { ok: true });
  // Article oublié et accent oublié ensemble : c'est l'accent qui est signalé (il était pris pour un simple oubli d'article).
  // (depuis la 15a bis, l'article oublié est dit en même temps : voir le groupe « version 15a bis ».)
  assert.deepEqual(judge('cafe', { type: 'type', answer: 'un café', accepted: ['un café'] }, at('A1')), { retry: true, accent: true, slip: 'accent', article: 'missing' });
  assert.deepEqual(judge('café', { type: 'type', answer: 'un café', accepted: ['un café'] }, at('A1')), { retry: true, article: 'missing' });
  // Une lettre d'écart sans l'article : second essai aussi (« chot » pour « un chat »). « à » n'est pas un article.
  assert.deepEqual(judge('chot', one('un chat'), at('A1')), { retry: true, accent: false, article: 'missing' }); assert.deepEqual(judge('adition', { type: 'type', answer: "l'addition", accepted: ["l'addition"] }, at('B1')), { retry: true, accent: false, article: 'missing' });
  assert.deepEqual(judge('un chot', one('un chat'), at('A1')), { retry: true, accent: false });
  assert.deepEqual(judge('côté', one('à côté'), at('A1')), { ok: false }); assert.deepEqual(judge('À côté', one('à côté'), at('A1')), { ok: true }); assert.deepEqual(judge('chat', one('un chat'), at('A1')), { retry: true, article: 'missing' });
  // « œ » tapé n'avale pas un accent attendu (« nœl » n'est pas « noël »), mais reste accepté quand le paquet écrit « oe ».
  assert.equal(judge('nœl', one('noël'), at('A1')).slip, 'ë'); assert.equal(judge('pœte', one('poète'), at('A1')).slip, 'è'); assert.deepEqual(judge('cœur', one('coeur'), at('A1')), { ok: true });
  // Espagnol : le signe qui ouvre la question n'est pas exigé (la ponctuation finale ne l'est pas non plus), mais il est rappelé.
  const que = { type: 'type', answer: '¿Qué tal?', accepted: ['¿Qué tal?'] };
  assert.deepEqual(judge('qué tal', que, at('A1', 'es')), { ok: true, note: 'open' }); assert.deepEqual(judge('¿Qué tal?', que, at('A1', 'es')), { ok: true });
  assert.deepEqual(judge('que tal?', que, at('A1', 'es')), { retry: true, accent: true, slip: 'accent' });
  // le rappel du signe ne vaut que pour la forme reconnue
  assert.deepEqual(check('hola', ['hola', '¿qué tal?']), { ok: true }); assert.deepEqual(check('buenos días', ['buenos días', '¡buenos días!']), { ok: true }); assert.deepEqual(check('qué tal', ['hola', '¿qué tal?']), { ok: true, note: 'open' });
  // Anglais : « café » et « cafe » sont deux graphies admises, sans second essai ; une lettre d'écart reste un second essai.
  assert.deepEqual(judge('cafe', acc, at('A1', 'en')), { ok: true, note: 'variant' }); assert.deepEqual(judge('cafe', acc, at('C2', 'en-GB')), { ok: true, note: 'variant' });
  assert.deepEqual(judge('café', acc, at('B1', 'en')), { ok: true }); assert.deepEqual(judge('terasse', act, at('B1', 'en')), { retry: true, accent: false });
  // Fiche à deux formes : l'accent oublié sur la forme demandée donne le message de l'accent, pas celui de la forme.
  const cher = { type: 'type', answer: 'chère', accepted: ['chère'], both: ['cher', 'chère'], ask: 'f' };
  assert.deepEqual(judge('chere', cher, at('A1')), { retry: true, accent: true, slip: 'accent' }); assert.deepEqual(judge('chère', cher, at('A1')), { ok: true });
  assert.deepEqual(judge('cher', cher, at('A1')), { retry: true, form: 'f' }); assert.deepEqual(judge('cher, chère', cher, at('A1')), { ok: true, note: 'both' });
  assert.deepEqual(judge('cher, chere', cher, at('A1')), { retry: true, accent: true, slip: 'accent' });
  assert.deepEqual(judge('chere', { ...cher, answer: 'cher', accepted: ['cher'], ask: 'm' }, at('A1')), { retry: true, form: 'm' }, 'l’autre forme, même sans son accent : message de la forme');
  // La forme de base avec un accent oublié : second essai sur l'accent.
  assert.deepEqual(judge('preferer', { type: 'cloze-type', answer: 'préfère', accepted: ['préfère'], lemmas: ['préférer'] }, at('B1')), { retry: true, accent: true, slip: 'accent' });
  assert.equal(judge('préférer', { type: 'cloze-type', answer: 'préfère', accepted: ['préfère'], lemmas: ['préférer'] }, at('B1')).note, 'form');
  for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) assert.ok(SPEC[lv].near >= 4 && SPEC[lv].lenient === undefined);
  assert.deepEqual(judge('une terrasse', act, at('C1')), { ok: true }, 'phrase à trou : l’article écrit en plus n’est pas une faute'); assert.ok(judge('', act, at('B1')).empty);
  assert.equal(judge('bosser', { type: 'cloze-type', answer: 'bosse', accepted: ['bosse'], lemmas: ['bosser'] }, at('B1')).note, 'form');
  assert.equal(hintOf('café', 'pattern'), 'c _ _ _'); assert.equal(hintOf('il y a', 'pattern'), 'i _   _   _'); assert.equal(hintOf('café', 'first'), 'c…'); assert.equal(hintOf('café', ''), '');
  for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) { assert.ok(SPEC[lv].options >= 3); for (const k of ['words', 'def', 'ex', 'traps']) assert.ok(WRITING[lv][k].length > 20); }
  assert.deepEqual(diffParts('terrasse', 'terasse'), ['ter', 'r', 'asse']);
  assert.deepEqual(chunks('Tu as faim ? Il y a des croissants.', 4), ['Tu as', 'faim ? Il', 'y a', 'des croissants.']);
  assert.equal(chunks('Oui merci', 4), null);
});
t('session : difficulté ressentie, récapitulatif du jour, aperçu', () => {
  const now = Date.UTC(2026, 0, 1), P = {}; const s = new Session(demo, P, { now, maxNew: 4 });      // quatre mots du jour, dont trois noms
  let step, last = null; const kinds = [];
  while ((step = s.next(now))) { if (step.intro) continue; kinds.push(step.activity.type); last = step; s.answer(step, true, now, { hesitated: step.item.bonus }); }
  assert.equal(kinds.at(-1), 'match', 'la session se termine par un tableau des mots du jour'); assert.equal(last.activity.left.length, 3);
  assert.deepEqual([...new Set(last.activity.left.map(p => kindOf(demo.byId[p.id])))], ['nom'], 'tableau du jour : une seule catégorie');
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
    if (a.type === 'match') { assert.ok(a.left.length >= 3 && a.left.length <= 5); assert.deepEqual(a.left.map(p => p.id).sort(), a.right.map(p => p.id).sort()); assert.equal(new Set(a.left.map(p => kindOf(demo.byId[p.id], demo.lang))).size, 1, 'association : une seule catégorie grammaticale'); }
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
  assert.ok(demoDeck().cards.filter(c => c.image).length === 15);
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
Pendant;Indique la durée complète d'une action.;J'ai dormi pendant huit heures.;Temps · Grammaire`, 'g'); sorted(g);
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
  assert.equal(back.cards.length, 15); assert.equal(back.id, d.id);
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
  const big = prepare({ id: 'k', name: 'k', lang: 'fr', cards: Array.from({ length: 20 }, (_, i) => ({ id: 'c' + i, word: 'mot' + i + 'xx', definition: 'définition numéro ' + i, pos: 'nom', examples: [] })) });
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
  const { cleanProgress, mergeProgress, countReplaced, countAdded } = await import('../js/backup.js');
  const now = Date.UTC(2026, 10, 23), far = Date.UTC(2100, 0, 1);
  const forged = { abc: { seen: 1, box: 99, born: far, lastOk: 'oui', fsrs: { state: 2, stability: 30, difficulty: 4, due: far, last_review: far, note: '<img src=x>', reps: 3 } }, casse: { seen: true, box: 4, fsrs: { due: 1, last_review: 1, state: 99 } }, '<b>x</b>': st(2, now), _race: { best: '<meta http-equiv=refresh content=0;url=//evil>', runs: -5 }, _match: { best: 7.6 }, _autre: { x: 1 } };
  const c = cleanProgress(forged, now);
  assert.deepEqual(Object.keys(c).sort(), ['_match', '_race', 'abc', 'casse']); assert.equal(c.abc.box, 5); assert.equal(c.abc.born, now); assert.equal(c.abc.fsrs.last_review, now);
  assert.ok(c.abc.fsrs.due <= now + 5 * 366 * 86400000); assert.equal(c.abc.fsrs.note, undefined); assert.equal(c.abc.fsrs.reps, 3); assert.strictEqual(c.abc.lastOk, true);
  assert.deepEqual([c.casse.box, c.casse.fsrs], [1, undefined], 'état de mémoire invalide : la fiche redevient tout juste découverte');
  assert.deepEqual(cleanProgress({ neuve: { seen: true, box: 1, born: now - 5 } }, now).neuve, { seen: true, box: 1, lastOk: false, born: now - 5 }, 'fiche découverte, pas encore révisée : gardée');
  // Pas choisi sur un paquet sans jours conseillés : seules les valeurs 3, 5 et 8 passent, et le réglage de l'appareil l'emporte sur celui d'une sauvegarde.
  assert.deepEqual(cleanProgress({ _new: { n: 8, autre: 1 } }, now)._new, { n: 8 }); assert.equal(cleanProgress({ _new: { n: 4 } }, now)._new, undefined); assert.equal(cleanProgress({ _new: { n: '<img>' } }, now)._new, undefined);
  assert.equal(mergeProgress({ _new: { n: 5 } }, { _new: { n: 8 } }, now)._new.n, 5); assert.equal(mergeProgress({}, { _new: { n: 8 } }, now)._new.n, 8);
  assert.deepEqual(c._race, { best: 0, runs: 0 }); assert.deepEqual(c._match, { best: 8, runs: 0 }); assert.ok(!JSON.stringify(c).includes('<'));
  // une sauvegarde datée du futur ne l'emporte pas sur un travail d'aujourd'hui fait après elle
  const mine = { abc: st(2, now) };
  assert.equal(mergeProgress(mine, forged, now).abc.box, 2); assert.equal(countReplaced(mine, forged, now), 0);
  // ni sur un travail de la semaine dernière (version 15a : auparavant la date forgée, ramenée à maintenant, gagnait)
  const old3 = { abc: st(3, now - 7 * 86400000) };
  assert.equal(mergeProgress(old3, forged, now).abc.box, 3); assert.equal(countReplaced(old3, forged, now), 0);
  // deux minutes d'avance (deux appareils à l'heure automatique) ne sont pas un état forgé : la sauvegarde plus récente l'emporte normalement
  const skew = { abc: { ...st(4, now), fsrs: { ...st(4, now).fsrs, last_review: now + 120000 } } };
  assert.equal(mergeProgress(old3, skew, now).abc.box, 4); assert.equal(countReplaced(old3, skew, now), 1);
  // une heure d'avance : laissée de côté depuis la version 15c (tolérance ramenée de vingt-quatre heures à cinq minutes)
  const hour = { abc: { ...st(4, now), fsrs: { ...st(4, now).fsrs, last_review: now + 3600000 } } };
  assert.equal(mergeProgress(old3, hour, now).abc.box, 3); assert.equal(countReplaced(old3, hour, now), 0);
  // contre-vérification : une dernière révision absente ou illisible (ramenée à maintenant par cleanState) ne gagne pas non plus
  for (const lr of [undefined, null, 'abc', '', true, false, {}, [1, 2], -1e999, { valueOf: 9e15 }]) {
    const f = { abc: { seen: true, box: 5, fsrs: { state: 2, stability: 39999, difficulty: 4, due: far, ...(lr === undefined ? {} : { last_review: lr }) } } };
    assert.equal(mergeProgress(old3, f, now).abc.box, 3, 'last_review ' + JSON.stringify(lr)); assert.equal(countReplaced(old3, f, now), 0);
  }
  assert.equal(countAdded({}, { toString: st(2, now) }, now), 1); assert.equal(countReplaced({}, { toString: st(2, now) }, now), 0);
  // une fiche sans progression reprend l'état de la sauvegarde, même daté du futur (rien n'est écrasé)
  assert.equal(mergeProgress({}, forged, now).abc.box, 5);
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
].map(([word, w, pred, plural], i) => ({ word, pos: 'nom', definition: 'It is a farm animal.', translations: { fr: 'mot' + i },
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
      assert.ok(p[k].includes('EXACTEMENT QUATRE phrases'), k); assert.ok(p[k].includes('Même début') && p[k].includes('Même thème') && p[k].includes('Même catégorie grammaticale'), k + ' : règles des mots pièges'); assert.ok(p[k].includes('3. Substitution :'), k); assert.ok(p[k].includes('phrase de manuel'), k);
    }
    assert.ok(p.review.includes('exactement quatre phrases d\'exemple'), 'le prompt de correction complète les fiches'); assert.ok(p.review.includes('commence comme lui'));
  }
  const en = buildPrompts({ lang: 'en', level: 'A1', topic: 'Animals', count: 12 }).file;
  for (const bad of ['A rabbit eats carrots in the garden.', 'A sheep lives on this farm.', 'The dog plays with my friends.']) assert.ok(en.includes(bad), 'contre-exemple cité : ' + bad);
});

t('mots pièges : même nature, même début, même genre, même thème ; rien ne s’élimine par la grammaire ou l’orthographe', () => {
  assert.equal(startOf("l'appartement", 'fr'), 'V'); assert.equal(startOf('un hôtel', 'fr'), 'V'); assert.equal(startOf('une maison', 'fr'), 'C'); assert.equal(startOf('an hour', 'en'), 'C'); assert.equal(startOf('an owl', 'en'), 'V');
  assert.equal(suggestKind({ word: 'to run' }, 'en'), 'verbe'); assert.equal(suggestKind({ word: 'a cow' }, 'en'), 'nom'); assert.equal(kindOf({ word: 'vite', pos: 'adverbe' }), 'adverbe');
  assert.equal(kindOf({ word: 'to run' }, 'en'), 'autre', 'sans catégorie donnée, l’appli ne devine pas');
  assert.equal(genderOf({ word: 'une maison' }), 'f'); assert.equal(genderOf({ word: 'un loyer' }), 'm'); assert.equal(genderOf({ word: "l'appartement" }), '');
  const mk = (word, ex, theme = 'logement', pos = 'nom') => ({ word, pos, theme, definition: 'définition de ' + word, translations: {}, examples: [ex] });
  const deck = prepare({ name: 'Logement (A2)', lang: 'fr', level: 'A2', cards: [
    mk("un appartement", "J'habite dans l'[appartement] du troisième étage."), mk("un immeuble", "L'[immeuble] a six étages."), mk("un étage", "Je monte à l'[étage] à pied."), mk("un ascenseur", "L'[ascenseur] est en panne."),
    mk("un escalier", "L'[escalier] est très raide."), mk("une cuisine", "La [cuisine] est petite."), mk("une chambre", "Ma [chambre] donne sur la cour."), mk("un loyer", "Le [loyer] est cher."),
    mk("payer", "Je dois [payer] demain.", 'logement', 'verbe'), mk("déménager", "Je vais [déménager] en juin.", 'logement', 'verbe'), mk("louer", "Je veux [louer] un studio.", 'logement', 'verbe'), mk("une pomme", "Je mange une [pomme].", 'nourriture'), mk("un orage", "L'[orage] arrive.", 'météo'),
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
    assert.deepEqual(rev.sort(), ['déménager', 'louer'], 'un verbe n’est proposé qu’avec des verbes : ' + rev.join(', '));
  }
  // un mot piège écrit pour la fiche est écarté s'il ne commence pas comme la réponse alors que l'élision le trahirait
  const own = prepare({ name: 'x (A2)', lang: 'fr', level: 'A2', cards: [{ ...mk("un appartement", "J'habite dans l'[appartement]."), distractors: ['immeuble', 'studio', 'étage'] }, mk("un hôtel", "L'[hôtel] est complet."), mk("un avion", "L'[avion] décolle.")] });
  for (let i = 0; i < 10; i++) assert.ok(!buildActivity(own, own.cards[0], 1, Math.random, { force: 'cloze-choice' }).options.includes('studio'), '« l’studio » se verrait tout de suite');
  // regroupement : les mots associés ensemble sont de même nature
  for (let i = 0; i < 20; i++) { const g = cluster(deck, deck.cards, 5, Math.random); assert.ok(g.length >= 3); assert.equal(new Set(g.map(c => kindOf(c, 'fr'))).size, 1, 'une seule catégorie par groupe : ' + g.map(c => c.word).join(', ')); }
  // Règle absolue : sur tout le paquet, à toutes les boîtes, aucun exercice à choix ne mêle deux catégories, et toute fiche a un exercice.
  for (const c of deck.cards) for (let box = 1; box <= 5; box++) for (let turn = 0; turn < 4; turn++) {
    const a = buildActivity(deck, c, box, Math.random, { vary: true, turn, audio: true }); assert.ok(a, 'toujours un exercice : ' + c.word);
    if (a.options && a.from) for (const id of Object.values(a.from)) assert.equal(kindOf(deck.byId[id], 'fr'), kindOf(c, 'fr'), `${a.type} : « ${deck.byId[id].word} » proposé face à « ${c.word} »`);
  }
  // Une fiche seule de sa catégorie n'a pas de choix possibles : on lui fait écrire le mot, sans jamais mêler les catégories.
  const seul = prepare({ name: 'y (A2)', lang: 'fr', level: 'A2', cards: [mk("un loyer", "Le [loyer] est cher."), mk("une chambre", "Ma [chambre] est grande."), mk("un étage", "Je monte à l'[étage]."), mk("payer", "Je dois [payer] demain.", 'logement', 'verbe')] });
  for (let box = 1; box <= 5; box++) { const a = buildActivity(seul, seul.cards[3], box, Math.random, { vary: true, audio: true }); assert.ok(a && !a.options, 'verbe seul : pas de choix, forme ' + (a && a.type)); }
  // Catégorie écrite de plusieurs façons, ou absente : même classement.
  for (const [pos, k] of [['Nom masculin', 'nom'], ['n.', 'nom'], ['noun', 'nom'], ['Verbe', 'verbe'], ['v.', 'verbe'], ['verbo', 'verbe'], ['adj.', 'adjectif'], ['Adverbe', 'adverbe'], ['locution', 'expression']]) assert.equal(kindOf({ word: 'x', pos }, 'fr'), k, pos);
  const sans = prepare({ name: 'z', lang: 'fr', level: 'A2', cards: [{ word: 'embaucher', definition: 'Donner un travail à quelqu’un.', examples: ['Le patron veut [embaucher] deux personnes.'] }, { word: 'un salaire', definition: 'Argent reçu pour un travail.', examples: ['Mon [salaire] arrive le 30.'] }, { word: 'se lever', definition: 'Sortir du lit.', examples: ['Je [me lève] tôt.'] }] });
  assert.deepEqual(sans.cards.map(c => kindOf(c, 'fr')), ['autre', 'autre', 'autre'], 'catégorie jamais devinée quand le paquet ne la donne pas');
  assert.deepEqual(sans.cards.map(c => suggestKind(c, 'fr')), ['verbe', 'nom', 'verbe'], 'suggestion montrée à l’enseignant');
});

t('phrase libre : jusqu’à cinq modèles', () => {
  const d = prepare({ name: 'x', lang: 'en', level: 'A1', cards: [{ word: 'a cow', definition: 'It is an animal.', examples: ['The [cow] gives us milk.', 'We have a [cow].', '[Cows] eat grass.', 'Where is my [cow]?', 'I can see two [cows].', 'A sixth [cow] sentence.'] }] });
  assert.equal(buildActivity(d, d.cards[0], 5, Math.random, { force: 'sentence' }).models.length, 5);
});

t('questions à choix : sens jumeaux jamais opposés, forme du mot piège accordée à la réponse, toujours un exercice', () => {
  assert.ok(sameSense('Donner un travail à quelqu’un.', 'Donner un travail à quelqu’un')); assert.ok(sameSense('une vache', 'Une vache'));
  assert.ok(!sameSense('Quitter son travail.', 'Retirer son travail à quelqu’un.')); assert.ok(!sameSense('définition numéro 1', 'définition numéro 2')); assert.ok(!sameSense('', 'x'));
  const mk = (word, definition, ex, pos) => ({ word, definition, pos, examples: [ex] });
  const w = prepare({ name: 'Le travail (A2)', lang: 'fr', level: 'A2', cards: [
    mk('embaucher', 'Donner un travail à quelqu’un.', 'Le patron veut [embaucher] deux serveurs.', 'verbe'), mk('recruter', 'Donner un travail à quelqu’un.', 'L’entreprise va [recruter] dix personnes.', 'verbe'),
    mk('licencier', 'Retirer son travail à quelqu’un.', 'Il a peur de se faire [licencier].', 'verbe'), mk('démissionner', 'Quitter son travail.', 'Elle veut [démissionner] en juin.', 'verbe'),
    mk('travailler', 'Faire un métier.', 'Elle [travaille] le samedi.', 'verbe'), mk('un salaire', 'Argent reçu pour un travail.', 'Mon [salaire] arrive le 30.', 'nom'), mk('un patron', 'Personne qui dirige une entreprise.', 'Mon [patron] est sympa.', 'nom'),
    mk('un contrat', 'Document qui fixe les règles d’un travail.', 'Je signe mon [contrat] demain.', 'nom'), mk('fatigant', 'Qui demande beaucoup d’énergie.', 'Ce travail est très [fatigant].', 'adjectif'),
  ] });
  const [embaucher, recruter] = w.cards;
  assert.deepEqual(w.twins, [['embaucher', 'recruter']]); assert.deepEqual(audit(w).find(a => a.key === 'auTwins').lines, ['embaucher / recruter']);
  for (let i = 0; i < 40; i++) for (const [box, force] of [[1, 'qcm'], [2, 'qcm-rev'], [2, 'listen'], [1, 'cloze-choice']]) {
    const a = buildActivity(w, embaucher, box, Math.random, { force, audio: true });
    if (a.options) assert.ok(!Object.values(a.from || {}).includes(recruter.id), force + ' : embaucher n’est jamais opposé à recruter, qui a le même sens');
  }
  // la réponse est un infinitif : les mots pièges tirés du paquet sont des infinitifs, jamais une forme conjuguée d'une autre fiche
  for (let i = 0; i < 30; i++) { const a = buildActivity(w, embaucher, 1, Math.random, { force: 'cloze-choice' }); assert.ok(a.options.every(o => /er$/.test(o)), a.options.join(', ')); assert.ok(!a.options.includes('travaille')); }
  // la réponse est conjuguée (« travaille ») : aucune autre fiche n'a de forme qui se termine pareil, donc pas de choix bancal
  const t3 = buildActivity(w, w.cards[4], 1, Math.random, { force: 'cloze-choice' }); assert.ok(t3.type !== 'cloze-choice' || t3.options.every(o => o.endsWith('e')), t3.type + ' ' + JSON.stringify(t3.options));
  // l'adjectif est seul de sa catégorie : jamais de choix ; sans phrase et avec un mot en deux parties, il reste le rappel de tête
  for (let box = 1; box <= 5; box++) assert.ok(!buildActivity(w, w.cards[8], box, Math.random, { vary: true, audio: true }).options);
  const lone = prepare({ name: 'x', lang: 'fr', level: 'A2', cards: [{ word: 'De… à…', definition: 'Entre deux points.' }] });
  for (let box = 1; box <= 5; box++) { const a = buildActivity(lone, lone.cards[0], box, Math.random, { vary: true, audio: true }); assert.equal(a.type, 'recall'); assert.ok(SELF.includes('recall') && a.self && a.answer === 'De… à…'); }
  const s = new Session(lone, {}, { maxNew: 3, now: Date.UTC(2026, 0, 1) }); let step, n = 0; while ((step = s.next(Date.UTC(2026, 0, 1))) && n++ < 20) { assert.ok(step.intro || step.activity, 'aucune étape sans exercice'); if (!step.intro) s.answer(step, true, Date.UTC(2026, 0, 1)); }
  // mots grammaticaux reconnus par listes fermées ; une fiche de catégorie inconnue n'est jamais proposée avec d'autres
  const kd = (word, lang = 'fr', extra = {}) => suggestKind({ word, ...extra }, lang);
  for (const w of ['Depuis', 'Pendant', "Jusqu'à", 'En (durée nécessaire)', 'Dans (délai)', 'À (heure)', 'Au (siècle)', 'De… à…', 'Au mois de', 'Il y a', 'à partir de', 'près de', 'grâce à']) assert.equal(kd(w), 'préposition', w);
  assert.equal(kd('next to', 'en'), 'préposition'); assert.equal(kd('avoir besoin de'), 'verbe'); assert.equal(kd('un tas de'), 'nom');
  assert.equal(kd('Le (jour ou date)'), 'déterminant'); assert.equal(kd('De la paperasse'), 'nom'); assert.equal(kd('Un boulot'), 'nom'); assert.equal(kd('Avoir du travail'), 'verbe');
  assert.equal(kd('in front of', 'en'), 'préposition'); assert.equal(kd('since', 'en'), 'préposition'); assert.equal(kd('a cow', 'en'), 'nom'); assert.equal(kd('to hire', 'en'), 'verbe');
  assert.equal(kd('desde', 'es'), 'préposition'); assert.equal(kd('cerca de', 'es'), 'préposition'); assert.equal(kd('a menudo', 'es'), 'expression'); assert.equal(kd('el trabajo', 'es'), 'nom');
  const edited = { word: 'zzzq' }; assert.equal(kindOf(edited, 'fr'), 'autre'); edited.pos = 'adjectif'; assert.equal(kindOf(edited, 'fr'), 'adjectif', 'une fiche corrigée dans l’éditeur est réexaminée');
  const unk = prepare({ name: 'u', lang: 'fr', level: 'A2', cards: ['zzzq', 'wwwk', 'qqqj', 'xxxv'].map((word, i) => ({ word, definition: 'sens ' + i, examples: ['Voici [' + word + '] ici.'] })) });
  for (const c of unk.cards) for (let box = 1; box <= 5; box++) assert.ok(!buildActivity(unk, c, box, Math.random, { vary: true, audio: true }).options, 'catégorie inconnue : jamais de question à choix');
  // phrase à trou : ce que la phrase impose (genre, nombre, début, casse, terminaison du verbe) est un filtre, pas une préférence
  const nn = (word, definition, ex, extra = {}) => ({ word, definition, pos: 'nom', examples: [ex], ...extra });
  const g = prepare({ name: 'g', lang: 'fr', level: 'A2', cards: [
    nn('Un emploi', 'Travail payé, dans une entreprise.', 'Mon frère cherche un [emploi] stable.', { theme: 't', register: 'courant' }), nn('Une entreprise', 'Organisation qui vend des biens ou des services.', 'Mon frère travaille dans une grande [entreprise].'),
    nn('Une équipe', 'Groupe de personnes qui travaillent ensemble.', 'Notre [équipe] se réunit le lundi.'), nn('Une école', 'Lieu où l’on apprend.', 'Cette [école] ouvre à huit heures.'), nn('Un entretien', 'Rendez-vous pour obtenir un poste.', 'Elle passe un [entretien] demain.'),
    nn('Un avis', 'Ce que l’on pense de quelque chose.', 'Il donne son [avis] en réunion.'), nn('Les papiers', 'Documents à présenter.', 'J’ai oublié mes [papiers] à la maison.'), nn('Les loisirs', 'Activités du temps libre.', 'Quels sont tes [loisirs] préférés ?'),
    nn('Les animaux', 'Êtres vivants qui ne sont pas des plantes.', 'Il aime les [animaux] sauvages.'), nn('Un CV', 'Document qui présente un parcours.', 'J’envoie mon [CV] ce soir.'), nn('De la paperasse', 'Beaucoup de documents à remplir.', 'Il déteste la [paperasse].'),
    nn('Un job', 'Mot familier pour parler d’un emploi, souvent court.', 'Ce [job] étudiant paie son loyer.', { theme: 't', register: 'familier' }), nn('Un boulot', 'Mot familier qui signifie un emploi.', 'Son [boulot] est fatigant.', { theme: 't', register: 'familier' }),
    nn('Un taf', 'Mot très familier qui signifie un emploi.', 'Il cherche un [taf] pour l’été.', { theme: 't', register: 'très familier' }),
  ] });
  const W = Object.fromEntries(g.cards.map(c => [c.word, c])), opts = (c, k = 40) => { const all = new Set(); for (let i = 0; i < k; i++) { const a = buildActivity(g, c, 1, Math.random, { force: 'cloze-choice' }); if (a.type === 'cloze-choice') for (const o of a.options) all.add(o); } return [...all]; };
  assert.ok(genderGap(W['Une entreprise'].clozes[0], 'fr'), '« une grande ___ » impose le féminin'); assert.equal(numberOf(W['Les papiers']), 'p'); assert.equal(numberOf(W['Un CV']), 's');
  const ent = opts(W['Une entreprise']); assert.ok(ent.length >= 3 && ent.every(o => ['entreprise', 'équipe', 'école'].includes(o)), '« une grande ___ » : féminins seulement, ' + ent.join(', '));
  const pap = opts(W['Les papiers']); assert.ok(pap.every(o => ['papiers', 'loisirs', 'animaux'].includes(o)), '« mes ___ » : pluriels seulement, ' + pap.join(', '));
  const emp = opts(W['Un emploi']); assert.ok(emp.every(o => ['emploi', 'entretien', 'avis'].includes(o)), '« un ___ » : masculins qui commencent par une voyelle, ' + emp.join(', '));
  const cv = opts(W['Un CV']); assert.ok(cv.every(o => o === 'CV' || /^\p{Ll}/u.test(o)), 'la casse des mots pièges suit celle de la réponse, sigle à part : ' + cv.join(', '));
  assert.ok(!opts(W['Un emploi']).includes('De la paperasse') && !opts(W['Un CV']).some(o => /^de la/i.test(o)), 'article partitif retiré');
  // job, boulot et taf sont trois variantes de « emploi » : aucun ne sert de mot piège aux deux autres
  for (const [a, b] of [['Un job', 'Un boulot'], ['Un job', 'Un taf'], ['Un boulot', 'Un taf']]) assert.ok(W[a].neighbours.includes(W[b].id) && W[b].neighbours.includes(W[a].id), a + ' / ' + b);
  const job = opts(W['Un job']); assert.ok(!job.includes('boulot') && !job.includes('taf') && !job.includes('emploi'), job.join(', '));
  // coût borné : un paquet entier sous la même famille, ou aux définitions toutes identiques, se prépare vite
  const t0 = Date.now(), fam = prepare({ name: 'f', lang: 'fr', level: 'A2', cards: Array.from({ length: 400 }, (_, i) => ({ word: 'mot' + i, definition: 'Même définition pour tous.', family: 'tout', pos: 'nom', examples: [] })) });
  assert.ok(Date.now() - t0 < 4000, 'préparation de 400 fiches de même famille : ' + (Date.now() - t0) + ' ms'); assert.ok(fam.twins.length <= 200); assert.equal(fam.cards[0].neighbours.length, 399);
  // le prompt porte les mêmes règles
  const p = buildPrompts({ lang: 'fr', level: 'A2', topic: 'Le travail', count: 20 });
  for (const k of ['file', 'cards']) for (const must of ['OBLIGATOIRE', 'au moins quatre fiches', 'Elle ne convient qu\'à CE mot', 'embaucher et recruter', 'RÈGLES ÉLIMINATOIRES', 'RAPPORT DE CONTRÔLE', 'un infinitif face à un infinitif']) assert.ok(p[k].includes(must), k + ' : ' + must);
  assert.ok(p.review.includes('3 bis.') && p.review.includes('Lue seule'));
});

t('version 13 : catégorie jamais devinée, classement par l’enseignant, genre en champ', () => {
  const csv = `Word;Definition;Example 1;Category
Un emploi;Travail payé, régulier.;Elle cherche un [emploi] à Lyon.;Travail
Un stage;Période de formation dans une entreprise.;Il fait un [stage] de trois mois.;Travail
Un salaire;Argent reçu chaque mois pour un travail.;Mon [salaire] arrive le 30.;Travail
L'entreprise;Organisation qui produit ou vend quelque chose.;Cette [entreprise] fabrique des vélos.;Travail
Les horaires;Heures de début et de fin du travail.;Mes [horaires] changent chaque semaine.;Travail
Embaucher;Signer un contrat de travail avec une personne.;Le patron veut [embaucher] deux vendeurs.;Travail
Démissionner;Quitter son emploi de sa propre décision.;Elle va [démissionner] en juin.;Travail
Postuler;Envoyer sa candidature pour un emploi.;Je vais [postuler] à cette offre.;Travail`;
  const d = deckFromCSV(csv, 'Travail (A2)', 'fr', 'A2');
  assert.ok(d.cards.every(c => kindOf(c) === 'autre'), 'aucune catégorie devinée à l’import');
  for (const c of d.cards) for (let box = 1; box <= 5; box++) for (let k = 0; k < 6; k++) { const a = buildActivity(d, c, box, Math.random, { vary: true, audio: true }); assert.ok(a && !a.options, `fiche sans catégorie : pas de question à choix (${c.word}, ${a.type})`); }
  for (let k = 0; k < 10; k++) assert.deepEqual(cluster(d, d.cards, 5, Math.random), [], 'fiche sans catégorie : jamais dans un groupe');
  assert.deepEqual(d.cards.map(c => suggestKind(c, 'fr')), ['nom', 'nom', 'nom', 'nom', 'nom', 'verbe', 'verbe', 'verbe'], 'rangement suggéré à l’enseignant');
  sorted(d);       // l'enseignant confirme
  assert.deepEqual(d.cards.map(c => kindOf(c)), ['nom', 'nom', 'nom', 'nom', 'nom', 'verbe', 'verbe', 'verbe']);
  let choices = 0; for (const c of d.cards) for (let k = 0; k < 6; k++) if (buildActivity(d, c, 1, Math.random).options) choices++;
  assert.ok(choices > 0, 'une fois classées, les fiches retrouvent leurs questions à choix');
  // Genre : l'article le dit (un, une), ou le champ « gender » ; « l' » et « les » ne disent rien.
  const W = Object.fromEntries(d.cards.map(c => [c.word, c]));
  assert.equal(genderOf(W['Un emploi']), 'm'); assert.ok(!needsGender(W['Un emploi'], 'fr'));
  assert.ok(needsGender(W["L'entreprise"], 'fr') && needsGender(W['Les horaires'], 'fr'), 'nom sans genre : à compléter');
  assert.ok(!needsGender(W['Embaucher'], 'fr'), 'un verbe n’a pas de genre'); assert.ok(!needsGender({ word: 'the firm', pos: 'nom' }, 'en'), 'pas de genre demandé en anglais');
  W["L'entreprise"].gender = 'f'; W['Les horaires'].gender = 'm'; prepare(d);
  assert.equal(genderOf(W["L'entreprise"]), 'f'); assert.ok(!d.cards.some(c => needsGender(c, 'fr')));
  const back = deckFromJSON(deckToJSON(d)); assert.equal(back.cards.find(c => c.word === "L'entreprise").gender, 'f', 'le genre est gardé dans le fichier du paquet'); assert.equal(back.cards[0].pos, 'nom');
  // Écritures du genre dans un paquet, et colonnes « Genre », « Doute » d'un tableau.
  for (const [v, g] of [['m', 'm'], ['Masculin', 'm'], ['f', 'f'], ['féminin', 'f'], ['femenino', 'f'], ['mf', 'mf'], ['m/f', 'mf'], ['', ''], ['?', '']]) assert.equal(normGender(v), g, v);
  const t2 = deckFromCSV('Word;Definition;Nature;Genre;Doute\nL\'eau;Liquide que l\'on boit.;nom;féminin;\nL\'arbre;Grande plante avec un tronc.;nom masculin;;\nLes gens;Les personnes en général.;nom;m;pluriel seulement\nVite;En peu de temps.;adverbe;;', 't2', 'fr', 'A2');
  assert.deepEqual(t2.cards.map(c => [kindOf(c), c.gender || '']), [['nom', 'f'], ['nom', 'm'], ['nom', 'm'], ['adverbe', '']]);
  const doubt = audit(t2).find(a => a.key === 'auDoubt'); assert.ok(doubt && doubt.warn); assert.deepEqual(doubt.lines, ['Les gens : pluriel seulement']);
  const j = deckFromJSON(JSON.stringify({ elefiches: 1, name: 'j', lang: 'fr', level: 'A2', cards: [{ word: "l'hôtel", definition: 'a', pos: 'nom', gender: 'm', doubt: '<b>x</b>' }, { word: "l'école", definition: 'b', pos: 'nom', gender: 'zzz' }, { word: 'lent', definition: 'c', pos: 'adjectif', gender: 42 }] }));
  assert.deepEqual(j.cards.map(c => c.gender), ['m', undefined, undefined], 'genre illisible : ignoré, la fiche reste à compléter'); assert.equal(j.cards[0].doubt, '<b>x</b>', 'le doute reste un texte, affiché comme tel');
});

t('version 13 : identifiant réservé, stockage abîmé', () => {
  const d = prepare({ name: 'r (A2)', lang: 'fr', level: 'A2', cards: [{ id: 'new', word: 'un mot', definition: 'a', pos: 'nom' }, { id: '__proto__', word: 'un nom', definition: 'b', pos: 'nom', examples: 'pas une liste', translations: 'pas un objet' }, { word: 'un mur', definition: 'c', pos: '__proto__', gender: { x: 1 }, doubt: 7 }] });
  assert.ok(d.cards.every(c => c.id !== 'new' && c.id !== '__proto__'), 'identifiants réservés réécrits');
  assert.deepEqual(d.cards[1].examples, []); assert.deepEqual(d.cards[1].translations, {});
  for (const k of ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'new']) assert.equal(d.byId[k], undefined, 'table des fiches sans prototype : ' + k);
  assert.doesNotThrow(() => prepare({ name: 'x', cards: [null, 5, 'x', { word: 'un mot', definition: 'a', examples: [{ toString: 1 }, 'Voici un [mot].'] }] }));
  assert.equal(d.cards[2].gender, undefined); assert.equal(d.cards[2].doubt, undefined); assert.equal(kindOf(d.cards[2]), '__proto__'); assert.equal(({}).pos, undefined);
});

t('version 13 : fiche à deux formes, une seule forme demandée à la fois', () => {
  const d = demoDeck(), srv = d.cards.find(c => c.word === 'Un serveur / une serveuse'), cher = d.cards.find(c => c.word === 'Cher / chère');
  assert.deepEqual(formsOf(srv, 'fr'), [{ text: 'Un serveur', gender: 'm' }, { text: 'une serveuse', gender: 'f' }]);
  assert.deepEqual(formsOf(cher, 'fr').map(f => f.gender), ['m', 'f'], 'adjectif sans article : masculin d’abord');
  assert.deepEqual(formsOf({ word: 'Être recruté(e)', pos: 'verbe' }, 'fr'), []); assert.deepEqual(formsOf({ word: 'Un café', pos: 'nom' }, 'fr'), []);
  const seen = new Set();
  for (let turn = 0; turn < 4; turn++) for (const force of ['type', 'listen-type', 'qcm-rev', 'listen']) {
    const a = buildActivity(d, srv, 3, Math.random, { force, turn, audio: true });
    assert.equal(a.type, force);
    if (force === 'qcm-rev') { assert.ok(a.options.every(o => !o.includes('/')), 'jamais deux formes dans une proposition : ' + a.options); continue; }
    if (force === 'listen') { assert.ok(['Un serveur', 'une serveuse'].includes(a.say)); continue; }
    assert.ok(!a.answer.includes('/'), 'une seule forme attendue : ' + a.answer); seen.add(a.answer);
    const other = a.answer === 'Un serveur' ? 'une serveuse' : 'un serveur';
    assert.ok(judge(a.answer, a, d).ok); assert.ok(judge('un serveur, une serveuse', a, d).ok, 'les deux formes écrites ensemble : juste');
    assert.ok(judge('Un serveur / une serveuse', a, d).ok); assert.ok(judge('un serveur et une serveuse', a, d).ok);
    const r = judge(other, a, d); assert.ok(r.retry && r.form, 'l’autre forme : second essai, pas une erreur'); assert.ok(!judge(other, a, d, true).ok);
    assert.ok(!judge('un serveur, un café', a, d).ok, 'un autre mot ajouté : faux');
    if (force === 'type') assert.equal(a.ask, a.answer === 'Un serveur' ? 'm' : 'f', 'la forme demandée est annoncée'); else assert.equal(a.say, a.answer, 'la voix ne dit que la forme attendue');
  }
  assert.equal(seen.size, 2, 'les deux formes alternent d’une révision à l’autre');
  const p = buildPrompts({ lang: 'fr', level: 'A1', topic: 'Au café', count: 12 }); assert.ok(p.file.includes('« un serveur / une serveuse »') && p.cards.includes('masculin d\'abord'));
  assert.ok(!buildPrompts({ lang: 'en', level: 'A1', topic: 'x', count: 12 }).file.includes('masculin d\'abord'));
  assert.ok(d.cards.every(c => c.image), 'démonstration A1 : une image pour chaque fiche');
});

t('version 13 : propositions équilibrées, un mot seul jamais face à des groupes de mots', () => {
  const rows = [['Le (jour ou date)', 'Devant un jour précis ou une date.', 'Le cours commence [le] 3 mars.'], ['En (mois, saison, année)', 'Devant un mois ou une année.', 'Je suis né [en] 2004.'], ['Au (siècle)', 'Devant un siècle.', 'Ce château a été construit [au] XVIIe siècle.'],
    ['À (heure)', 'Devant une heure précise.', 'Le train part [à] huit heures.'], ['Depuis', 'Début d’une action qui continue.', 'J’habite ici [depuis] trois ans.'], ['Pendant', 'Durée complète d’une action.', 'J’ai dormi [pendant] huit heures.'],
    ['Au mois de', 'Devant le nom d’un mois.', 'Elle arrive [au mois de] mai.'], ['À partir de', 'Point de départ dans le temps.', 'Je travaille [à partir de] lundi.'], ['Au bout de', 'Après une durée.', 'Il est parti [au bout d’]une heure.'], ['Au début de', 'Dans les premiers moments.', 'On se voit [au début de] la semaine.']];
  const d = prepare({ name: 'Temps (A2)', lang: 'fr', level: 'A2', cards: rows.map(([word, definition, ex]) => ({ word, definition, examples: [ex], theme: 'Prépositions de temps', pos: 'préposition', translations: {} })) });
  assert.equal(suggestKind({ word: 'Le (jour ou date)', theme: 'Prépositions de temps' }, 'fr'), 'préposition', '« le » rangé avec « en », « à », « au » quand le thème le dit');
  assert.equal(suggestKind({ word: 'Le (jour ou date)' }, 'fr'), 'déterminant');
  const one = x => x.trim().split(/\s+/).length === 1; let seen = 0, le = 0;
  for (const c of d.cards) for (const box of [1, 2, 3, 4, 5]) for (const force of [null, 'qcm-rev', 'cloze-choice']) for (let k = 0; k < 12; k++) {
    const a = buildActivity(d, c, box, Math.random, { force });
    if (!a.options || !['qcm-rev', 'cloze-choice'].includes(a.type)) continue;
    seen++; if (a.options.some(o => o.toLowerCase() === 'le') && a.options.some(o => ['en', 'à', 'au', 'depuis', 'pendant'].includes(o.toLowerCase()))) le++;
    assert.equal(new Set(a.options.map(one)).size, 1, `${a.type} : propositions déséquilibrées ${JSON.stringify(a.options)}`);
  }
  assert.ok(seen > 50 && le > 0, '« le » est bien proposé face aux autres marqueurs de temps en un mot');
  // Un mot piège écrit pour la fiche est écarté s'il ne compte pas autant de mots que la réponse.
  const own = prepare({ name: 'o (A2)', lang: 'fr', level: 'A2', cards: [{ word: 'un loyer', pos: 'nom', definition: 'Argent payé chaque mois pour un logement.', examples: ['Je paie mon [loyer] le premier du mois.'], distractors: ['salaire', 'ticket de bus', 'voisin'], translations: {} },
    { word: 'un salaire', pos: 'nom', definition: 'Argent reçu pour un travail.', examples: ['Mon [salaire] arrive le 30.'], translations: {} }, { word: 'un voisin', pos: 'nom', definition: 'Personne qui habite à côté.', examples: ['Mon [voisin] fait du bruit.'], translations: {} }, { word: 'un bail', pos: 'nom', definition: 'Contrat de location.', examples: ['Je signe le [bail] demain.'], translations: {} }] });
  for (let k = 0; k < 30; k++) { const a = buildActivity(own, own.cards[0], 1, Math.random, { force: 'cloze-choice' }); assert.ok(a.options && !a.options.includes('ticket de bus'), JSON.stringify(a.options)); }
});

t('version 13 : prompts en deux étapes, genre, doutes, rapport de contrôle', () => {
  for (const lang of ['fr', 'es', 'en']) {
    const p = buildPrompts({ lang, level: 'A2', topic: 'Le travail', count: 20 });
    for (const k of ['file', 'cards']) {
      for (const must of ['ÉTAPE 1, maintenant', 'ARRÊTE-TOI et attends ma réponse', 'RÈGLES ÉLIMINATOIRES', 'RAPPORT DE CONTRÔLE', 'Un simple « oui » ne suffit pas', '"doubt"', 'lots de dix fiches', 'L\'application ne devine jamais la catégorie', 'jamais un mot seul à côté de groupes de mots', 'sont tous rangés dans « préposition »']) assert.ok(p[k].includes(must), `${lang} ${k} : ${must}`);
      assert.equal(p[k].includes('"gender":""'), lang !== 'en', lang + ' : champ du genre'); assert.equal(p[k].includes('"gender" : OBLIGATOIRE pour tout nom'), lang !== 'en');
      assert.ok(!p[k].includes('sans montrer ton brouillon'), 'les contrôles ne sont plus faits en silence');
    }
    assert.ok(p.go.includes('ÉTAPE 2') && p.go.includes('RAPPORT DE CONTRÔLE') && p.go.includes('"doubt"'));
    assert.ok(p.review.includes('4 bis.') && p.review.includes('compte le même nombre de mots')); assert.equal(p.review.includes('3 ter.'), lang !== 'en');
  }
});

t('version 14a : mode essai, avancer le temps recule toutes les dates sans toucher à l’original', async () => {
  const { shiftProgress, nextDueIn, review, isDue, boxOf } = await import('../js/scheduler.js');
  const { cleanProgress } = await import('../js/backup.js');
  const DAY = 86400000, now = Date.UTC(2026, 10, 25, 12);
  let st = review({ seen: true, box: 1, born: now }, 'good', now);
  const P = { a: st, b: { seen: true, box: 1, born: now }, _stages: { 1: now }, _race: { best: 7, runs: 2 } };
  const frozen = JSON.stringify(P);
  assert.equal(nextDueIn({ a: st }, now), st.fsrs.due - now); assert.ok(nextDueIn({ a: st }, now) > 0);
  assert.equal(nextDueIn(P, now), 0, 'une fiche découverte et jamais révisée est due tout de suite');
  assert.equal(nextDueIn({}, now), 0); assert.equal(nextDueIn(null, now), 0);
  const Q = shiftProgress(P, DAY);
  assert.equal(JSON.stringify(P), frozen, 'la progression d’origine n’est pas modifiée');
  assert.equal(Q.a.fsrs.due, st.fsrs.due - DAY); assert.equal(Q.a.fsrs.last_review, st.fsrs.last_review - DAY); assert.equal(Q.a.born, now - DAY);
  assert.equal(Q.b.born, now - DAY); assert.equal(Q._stages[1], now - DAY); assert.deepEqual(Q._race, { best: 7, runs: 2 });
  assert.equal(Q.a.box, st.box); assert.equal(Q.a.fsrs.stability, st.fsrs.stability);
  assert.equal(shiftProgress(P, 0), P); assert.equal(shiftProgress(P, -5), P); assert.equal(shiftProgress(null, DAY), null);
  assert.equal(shiftProgress({ a: { seen: true, box: 1, born: 5 } }, DAY).a.born, 0, 'jamais de date négative');
  assert.deepEqual(cleanProgress(Q, now), cleanProgress(JSON.parse(JSON.stringify(Q)), now), 'le résultat passe le nettoyage du stockage');
  // En avançant chaque fois jusqu'à la prochaine révision, une fiche atteint la boîte 5 en quelques tours, comme au fil des semaines.
  let R = { a: st }, turns = 0;
  while (boxOf(R.a) < 5 && turns++ < 10) {
    R = cleanProgress(shiftProgress(R, nextDueIn(R, now) + 60000), now);
    assert.ok(isDue(R.a, now), 'la fiche est due après le saut');
    R = { a: review(R.a, 'good', now) };
  }
  assert.equal(boxOf(R.a), 5); assert.ok(turns <= 4);
  assert.ok(R.a.fsrs.due - now > 7 * DAY, 'les intervalles ont grandi normalement : ' + Math.round((R.a.fsrs.due - now) / DAY) + ' j');
});

t('version 14a : en mode essai, la session ne retient aucun nouveau mot et ne s’arrête pas à l’heure', async () => {
  const { Session } = await import('../js/session.js'); const { review } = await import('../js/scheduler.js');
  const { deckFromJSON } = await import('../js/deck.js');
  const now = Date.UTC(2026, 10, 25, 12);
  const deck = deckFromJSON(JSON.stringify({ elefiches: 1, name: 'Essai', lang: 'fr', level: 'B1', cards: Array.from({ length: 40 }, (_, i) => ({ word: 'mot' + i, pos: 'nom', gender: 'm', definition: 'Définition numéro ' + i + ' du mot.', examples: ['Voici un [mot' + i + '] ici.'] })) }));
  const P = {}; for (const c of deck.cards.slice(0, 25)) P[c.id] = review({ seen: true, box: 1, born: now - 9e8 }, 'good', now - 9e8);
  const held = new Session(deck, P, { maxNew: 8, now }), free = new Session(deck, P, { maxNew: 8, now, force: true, minutes: 600 });
  assert.equal(held.today.length, 0, '25 révisions dues : hors mode essai, les nouveaux mots attendent');
  assert.equal(free.today.length, 8); assert.equal(free.endAt - now, 600 * 60000);
});

t('version 15a, sécurité : ponctuation en masse lue vite, traductions plafonnées, nom de paquet coupé avant calcul', async () => {
  const { norm } = await import('../js/match.js'), { deckFromJSON, DECK_LIMITS } = await import('../js/deck.js');
  let t0 = Date.now(); assert.equal(norm('!?'.repeat(200000) + 'a!'), '!?'.repeat(200000) + 'a'); assert.ok(Date.now() - t0 < 1500, 'norm reste linéaire : ' + (Date.now() - t0) + ' ms');
  assert.equal(norm(' Mot…  suite ?! '), 'mot suite ?!'); assert.equal(norm('Fin.;:,!?'), 'fin');
  const long = '!?'.repeat(10000) + 'a', cards = Array.from({ length: 30 }, (_, i) => ({ word: 'mot' + i, translations: { fr: long, en: 'word ' + i }, examples: ['Un mot' + i + ' ici.'] }));
  t0 = Date.now(); const d = deckFromJSON(JSON.stringify({ elefiches: 1, name: '!?'.repeat(40000) + ' (A1)', lang: 'es', cards })); const ms = Date.now() - t0;
  assert.ok(ms < 3000, 'import d’un paquet à traductions démesurées : ' + ms + ' ms');
  assert.ok(d.cards.every(c => c.translations.fr.length <= DECK_LIMITS.definition && c.translations.en.startsWith('word')) && d.name.length <= 120);
  assert.equal(d.id, deckFromJSON(JSON.stringify({ elefiches: 1, name: d.name, lang: 'es', cards })).id, 'même nom coupé, même identifiant');
  const big = deckFromJSON(JSON.stringify({ elefiches: 1, name: 'x', lang: 'fr', grid: '9'.repeat(20000) + 'x3', cards: cards.map(c => ({ ...c, sheet: 'P' + '1'.repeat(20000) + '-1' })) }));
  assert.equal(big.grid, '3x3'); assert.ok(big.cards.every(c => c.sheet === undefined));
  // la même borne par le champ « image » (JSON) : un repère démesuré n'est ni une planche ni une image
  const viaImage = deckFromJSON(JSON.stringify({ elefiches: 1, name: 'y', lang: 'fr', cards: cards.map((c, i) => ({ ...c, image: i ? 'P' + '1'.repeat(9999) + '-' + '2'.repeat(9999) : 'p12-7' })) }));
  assert.equal(viaImage.cards[0].sheet, 'P12-7'); assert.ok(viaImage.cards.slice(1).every(c => c.sheet === undefined && c.image === undefined)); assert.ok(JSON.stringify(viaImage.cards).length < 30 * 1200);
});
t('version 15a : l’orthographe exacte (accents, ç, ñ, œ) est demandée aux IA dans les trois prompts', () => {
  for (const [lang, word] of [['fr', '« sœur »'], ['es', '« ñ »'], ['en', '« café » et « cafe »']]) {
    const p = buildPrompts({ lang, level: 'A1', topic: 'x', count: 12 });
    for (const k of ['file', 'cards', 'review']) assert.ok(p[k].includes(word), lang + ' ' + k);
    for (const k of ['file', 'cards']) { assert.ok(p[k].includes('ORTHOGRAPHE EXACTE') && p[k].includes('\nG. Chaque mot') && p[k].includes('5 bis. Orthographe'), lang + ' ' + k); }
    assert.ok(p.go.includes('l\'orthographe exacte de chaque mot'));
    for (const k of Object.keys(p)) if (typeof p[k] === 'string') assert.ok(!p[k].includes('undefined') && !p[k].includes('${'), lang + ' ' + k);
  }
  assert.ok(buildPrompts({ lang: 'es', level: 'A1' }).file.includes('« ¿ » ou « ¡ »')); assert.ok(!buildPrompts({ lang: 'en', level: 'A1' }).file.includes('accents et signes compris'));
});
t('version 14c : une à cinq phrases d’exemple, nombre exact, dans les trois prompts', () => {
  for (const lang of ['fr', 'en', 'es']) {
    const words = ['', 'UNE', 'DEUX', 'TROIS', 'QUATRE', 'CINQ'];
    for (let n = 1; n <= 5; n++) {
      const p = buildPrompts({ lang, level: 'A2', topic: 'Le travail', count: 20, examples: n });
      for (const k of ['file', 'cards']) {
        assert.ok(p[k].includes(`EXACTEMENT ${words[n]} phrase${n === 1 ? ' ' : 's '}`), `${lang} ${k} ${n}`);
        assert.ok(p[k].includes('"examples":[' + Array(n).fill('""').join(',') + ']'), 'modèle JSON à ' + n + ' phrase(s)');
        assert.ok(!/quatre ou cinq/i.test(p[k]) && !p[k].includes('undefined'), 'plus de nombre fixe');
      }
      assert.ok(p.review.includes(`exactement ${words[n].toLowerCase()} phrase`));
    }
    const d = buildPrompts({ lang, level: 'A2', topic: 'x' }), odd = buildPrompts({ lang, level: 'A2', topic: 'x', examples: '9<b>' });
    assert.ok(d.file.includes('EXACTEMENT QUATRE phrases'), 'quatre par défaut'); assert.ok(odd.file.includes('EXACTEMENT QUATRE phrases') && !odd.file.includes('<b>'), 'valeur forgée : quatre');
    assert.ok(buildPrompts({ lang, level: 'A2', topic: 'x', examples: 7 }).file.includes('EXACTEMENT CINQ phrases'));
    assert.ok(d.file.includes('soutenu, courant, familier, très familier, vulgaire, argotique, jargon'), 'les sept registres sont dans le prompt');
  }
});

t('version 14c : sept registres, écritures variées ramenées à la liste, doute retiré du fichier exporté', async () => {
  const { REGISTERS, normRegister } = await import('../js/deck.js');
  assert.deepEqual(REGISTERS, ['soutenu', 'courant', 'familier', 'très familier', 'vulgaire', 'argotique', 'jargon']);
  for (const [a, b] of [['Registre courant', 'courant'], ['Neutral', 'courant'], ['Neutro', 'courant'], ['Coloquial', 'familier'], ['informal', 'familier'], ['Très familier', 'très familier'], ['very informal', 'très familier'],
    ['Formal', 'soutenu'], ['soutenu', 'soutenu'], ['slang', 'argotique'], ['Argot', 'argotique'], ['jerga', 'jargon'], ['vulgar', 'vulgaire'], ['littéraire', 'littéraire'], ['Vulgarisation scientifique', 'Vulgarisation scientifique'], ['Formalités', 'Formalités'], ['standardiste', 'standardiste'], ['technique de vente', 'technique de vente'], ['informel', 'familier'], ['fam.', 'familier'], ['', ''], [null, ''], [{}, '']]) assert.equal(normRegister(a), b, String(a));
  const d = deckFromJSON(JSON.stringify({ elefiches: 1, name: 'R (B1)', lang: 'fr', level: 'B1', cards: [
    { word: 'Un appart', pos: 'nom', gender: 'm', definition: 'Mot familier pour un appartement.', register: 'Registre familier', doubt: 'à vérifier', examples: ['Ton [appart] est grand.'] },
    { word: 'Un logis', pos: 'nom', gender: 'm', definition: 'Lieu où l’on habite, dans les livres.', register: '<img src=x onerror=1>', examples: ['Il regagne son [logis].'] },
    { word: 'Un studio', pos: 'nom', gender: 'm', definition: 'Petit logement d’une seule pièce.', register: 'Neutral', examples: ['Mon [studio] est petit.'] }] }));
  assert.equal(d.cards[0].register, 'familier'); assert.equal(d.cards[0].doubt, 'à vérifier');
  assert.ok(d.cards[1].register.length <= 40, 'un registre inconnu est gardé, borné');
  const out = JSON.parse(deckToJSON(d)); assert.ok(out.cards.every(c => !('doubt' in c)), 'le doute ne part pas dans le fichier'); assert.equal(out.cards[0].register, 'familier');
  assert.equal(serialize(d).cards[0].doubt, 'à vérifier', 'il reste dans le navigateur de l’enseignant');
  for (const k of Object.keys(MODELS)) { const m = deckFromCSV(MODELS[k].csv, MODELS[k].name, MODELS[k].lang); assert.ok(MODELS[k].csv.split('\n')[0].includes('Example 1;Example 2;Example 3;Example 4;Example 5')); assert.ok(m.cards.length >= 4 && m.cards.every(c => c.examples.length === 2 && REGISTERS.includes(c.register)), k + ' : ' + m.cards.map(c => c.register)); }
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

t('version 15a bis : article exigé en français et en espagnol (second essai), simple remarque en anglais', async () => {
  const at = (lv, lang = 'fr') => ({ level: lv, lang }), one = (w, extra = {}) => ({ type: 'type', answer: w, accepted: [w], ...extra });
  const miss = { retry: true, article: 'missing' }, bad = { retry: true, article: 'wrong' }, fine = { ok: true };
  for (const lv of ['A1', 'B1', 'C2']) {
    // Article oublié : second essai, puis erreur s'il manque encore ; corrigé, c'est juste (et compté comme aidé par l'appli).
    assert.deepEqual(judge('café', one('un café'), at(lv)), miss, lv); assert.deepEqual(judge('café', one('un café'), at(lv), true), { ok: false, near: true }); assert.deepEqual(judge('un café', one('un café'), at(lv), true), fine);
    // Article qui ne va pas avec le mot : autre genre, autre nombre, élision manquée ou en trop.
    for (const x of ['une café', 'la café', "l'café", 'des café', 'de la café']) assert.deepEqual(judge(x, one('un café'), at(lv)), bad, x);
    // Un autre article du même genre et du même nombre : accepté sans remarque.
    for (const x of ['le café', 'du café', 'Un café', 'LE CAFÉ']) assert.deepEqual(judge(x, one('un café'), at(lv)), fine, x);
  }
  // L'article ne dit pas le genre (« l' », « les », « des ») : il est exigé quand même, et le genre de la fiche départage.
  const add = one("l'addition", { gender: 'f' });
  assert.deepEqual(judge('addition', add, at('A1')), miss); assert.deepEqual(judge("l'addition", add, at('A1')), fine); assert.deepEqual(judge('L’addition', add, at('A1')), fine);
  assert.deepEqual(judge('une addition', add, at('A1')), fine); assert.deepEqual(judge("de l'addition", add, at('A1')), fine);
  assert.deepEqual(judge('un addition', add, at('A1')), bad); assert.deepEqual(judge('la addition', add, at('A1')), bad); assert.deepEqual(judge('les addition', add, at('A1')), bad);
  assert.deepEqual(judge('un addition', one("l'addition"), at('A1')), fine, 'genre inconnu de la fiche : l’appli ne tranche pas');
  assert.deepEqual(judge('un élève', one('un élève', { gender: 'mf' }), at('A1')), fine); assert.deepEqual(judge('une élève', one('un élève', { gender: 'mf' }), at('A1')), fine, 'nom des deux genres');
  assert.deepEqual(judge('toilettes', one('les toilettes'), at('A2')), miss); assert.deepEqual(judge('des toilettes', one('les toilettes'), at('A2')), fine); assert.deepEqual(judge('la toilettes', one('les toilettes'), at('A2')), bad);
  assert.deepEqual(judge('pain', one('du pain'), at('A1')), miss); assert.deepEqual(judge('le pain', one('du pain'), at('A1')), fine); assert.deepEqual(judge('un pain', one('du pain'), at('A1')), fine); assert.deepEqual(judge('la pain', one('du pain'), at('A1')), bad);
  assert.deepEqual(judge('la confiture', one('de la confiture'), at('A1')), fine); assert.deepEqual(judge('du confiture', one('de la confiture'), at('A1')), bad); assert.deepEqual(judge('confiture', one('de la confiture'), at('A1')), miss);
  // Fiche sans article : rien n'est exigé, et en écrire un n'est pas une faute. Un mot qui est lui-même un article reste un mot.
  assert.deepEqual(judge('un café', one('café'), at('A1')), fine); assert.deepEqual(judge('café', one('café'), at('A1')), fine); assert.deepEqual(judge('le', one('le'), at('A1')), fine);
  assert.deepEqual(judge('manger', one('manger'), at('A1')), fine); assert.ok(!judge('un thé', one('un café'), at('A1')).ok && !judge('un thé', one('un café'), at('A1')).retry, 'un autre mot reste faux');
  // Deux écarts à la fois : le message doit dire les deux, sinon l'étudiant corrige l'un et échoue sur l'autre.
  assert.deepEqual(judge('ecole', one('une école'), at('A1')), { retry: true, accent: true, slip: 'accent', article: 'missing' });
  assert.deepEqual(judge('Ecole', one('une école'), at('A1')), { retry: true, accent: true, slip: 'accent', cap: true, article: 'missing' });
  assert.deepEqual(judge('un ecole', one('une école'), at('A1')), { retry: true, accent: true, slip: 'accent', article: 'wrong' });
  assert.deepEqual(judge('teras', one('une terrasse'), at('A1')), { ok: false }); assert.deepEqual(judge('terasse', one('une terrasse'), at('A1')), { retry: true, accent: false, article: 'missing' });
  assert.deepEqual(judge('une terasse', one('une terrasse'), at('A1')), { retry: true, accent: false });
  // Espagnol : même règle. Nom féminin à « a » tonique : « el » obligatoire, « un » et « una » admis, « la » fautif.
  assert.deepEqual(judge('mesa', one('una mesa'), at('A1', 'es')), miss); assert.deepEqual(judge('la mesa', one('una mesa'), at('A1', 'es')), fine); assert.deepEqual(judge('un mesa', one('una mesa'), at('A1', 'es')), bad); assert.deepEqual(judge('unas mesa', one('una mesa'), at('A1', 'es')), bad);
  const agua = one('el agua', { gender: 'f' }), aula = one('un aula', { gender: 'f' });
  for (const x of ['el agua', 'un agua', 'una agua']) assert.deepEqual(judge(x, agua, at('A1', 'es')), fine, x);
  assert.deepEqual(judge('la agua', agua, at('A1', 'es')), bad); assert.deepEqual(judge('agua', agua, at('A1', 'es')), miss);
  assert.deepEqual(judge('una aula', aula, at('A1', 'es')), fine); assert.deepEqual(judge('la aula', aula, at('A1', 'es')), bad); assert.deepEqual(judge('el aula', aula, at('A1', 'es')), fine);
  assert.deepEqual(judge('las gafas', one('unas gafas'), at('A1', 'es')), fine); assert.deepEqual(judge('unos gafas', one('unas gafas'), at('A1', 'es')), bad);
  assert.deepEqual(judge('cafe', one('un café'), at('A1', 'es')), { retry: true, accent: true, slip: 'accent', article: 'missing' });
  // Anglais : article oublié ou mal choisi (« a apple »), « to » oublié : accepté avec une remarque, jamais de second essai.
  for (const x of ['apple', 'a apple']) assert.deepEqual(judge(x, one('an apple'), at('A1', 'en')), { ok: true, note: 'article', art: x === 'apple' ? 'missing' : 'wrong' }, x);
  assert.deepEqual(judge('the apple', one('an apple'), at('A1', 'en')), fine); assert.equal(judge('eat', one('to eat'), at('B2', 'en-GB')).note, 'article'); assert.deepEqual(judge('an apple', one('apple'), at('A1', 'en')), fine);
  // Langue sans règle d'article connue : la simple remarque d'avant.
  assert.equal(judge('caffè', one('un caffè'), at('A1', 'it')).note, 'article'); assert.equal(judge('caffè', one('un caffè'), at('A1', 'it')).retry, undefined);
  // Phrase à trou : seul ce que le trou contient est exigé. L'article écrit dans la phrase n'est pas demandé, et la forme de base reste reconnue.
  const gap = { type: 'cloze-type', answer: 'café', accepted: ['café'], lemmas: ['un café'] }, plural = { type: 'cloze-type', answer: 'cafés', accepted: ['cafés'], lemmas: ['un café'] };
  assert.deepEqual(judge('café', gap, at('A1')), fine); assert.deepEqual(judge('un café', gap, at('A1')), fine); assert.deepEqual(judge('café', plural, at('B1')), { ok: true, note: 'form' }); assert.deepEqual(judge('un café', plural, at('B1')), { ok: true, note: 'form' });
  // Fiche à deux formes : l'article de la forme demandée est exigé lui aussi.
  const srv = { type: 'type', answer: 'une serveuse', accepted: ['une serveuse'], both: ['un serveur', 'une serveuse'], ask: 'f', gender: 'f' };
  assert.deepEqual(judge('serveuse', srv, at('A1')), miss, 'la bonne forme sans article : message de l’article, pas celui de la forme');
  assert.deepEqual(judge('un serveuse', srv, at('A1')), bad); assert.deepEqual(judge('la serveuse', srv, at('A1')), fine); assert.deepEqual(judge('une serveuse', srv, at('A1')), fine);
  assert.deepEqual(judge('un serveur', srv, at('A1')), { retry: true, form: 'f' }); assert.deepEqual(judge('serveur', srv, at('A1')), { retry: true, form: 'f', article: 'missing' });
  assert.deepEqual(judge('un serveur, une serveuse', srv, at('A1')), { ok: true, note: 'both' }); assert.deepEqual(judge('serveur, serveuse', srv, at('A1')), miss);
  assert.deepEqual(judge('serveuse', srv, at('A1'), true), { ok: false, near: true }); assert.deepEqual(judge('serveur', srv, at('A1'), true), { ok: false, near: true });
  const cher = { type: 'type', answer: 'chère', accepted: ['chère'], both: ['cher', 'chère'], ask: 'f', gender: 'f' };
  assert.deepEqual(judge('chère', cher, at('A1')), fine); assert.deepEqual(judge('cher', cher, at('A1')), { retry: true, form: 'f' }, 'adjectif : aucun article en jeu');
  // Élision : elle se juge sur le début du nom, pas sur l'article de la fiche (relecture de sécurité, S1). Les prompts
  // demandent « une école » : « l'école » est donc la bonne réponse d'un étudiant qui sait, et « la école » une faute.
  const ecole = one('une école', { gender: 'f' }), ami = one('un ami', { gender: 'm' });
  for (const x of ["l'école", "L'école", 'une école', "de l'école"]) assert.deepEqual(judge(x, ecole, at('A1')), fine, x);
  for (const x of ['la école', 'le école', 'un école', 'de la école', 'du école']) assert.deepEqual(judge(x, ecole, at('A1')), bad, x);
  assert.deepEqual(judge("l'ami", ami, at('A1')), fine); assert.deepEqual(judge('le ami', ami, at('A1')), bad); assert.deepEqual(judge('du ami', ami, at('A1')), bad); assert.deepEqual(judge('une ami', ami, at('A1')), bad);
  assert.deepEqual(judge("l'ecole", ecole, at('A1')), { retry: true, accent: true, slip: 'accent' }); assert.deepEqual(judge('la ecole', ecole, at('A1')), { retry: true, accent: true, slip: 'accent', article: 'wrong' });
  // Devant « h » ou « y », la fiche tranche quand elle le montre ; sinon l'appli ne devine pas et admet les deux formes.
  for (const x of ["l'hôtel", 'le hôtel', 'un hôtel']) assert.deepEqual(judge(x, one('un hôtel', { gender: 'm' }), at('A1')), fine, x);
  assert.deepEqual(judge('le hôtel', one("l'hôtel", { gender: 'm' }), at('A1')), bad); assert.deepEqual(judge('un hôtel', one("l'hôtel", { gender: 'm' }), at('A1')), fine);
  assert.deepEqual(judge("l'haricot", one('le haricot'), at('A1')), bad); assert.deepEqual(judge('un haricot', one('le haricot'), at('A1')), fine); assert.deepEqual(judge('le yaourt', one('un yaourt'), at('A1')), fine);
  // L'apostrophe se colle au mot : « l' eau » n'est pas reconnu comme un article (une lettre d'écart : second essai).
  assert.ok(!judge("l' eau", one("l'eau", { gender: 'f' }), at('A1')).ok); assert.deepEqual(judge("de l'eau", one("de l'eau", { gender: 'f' }), at('A1')), fine); assert.deepEqual(judge("l'eau", one("de l'eau", { gender: 'f' }), at('A1')), fine); assert.deepEqual(judge('eau', one("de l'eau"), at('A1')), miss);
  // Seul un article de la langue du paquet se retire (S2) : « a » n'est un article qu'en anglais, « los » qu'en espagnol.
  for (const [x, w, l] of [['veces', 'a veces', 'es'], ['menudo', 'a menudo', 'es'], ['priori', 'a priori', 'fr'], ['bientôt', 'à bientôt', 'fr'], ['angeles', 'los angeles', 'fr'], ['miserables', 'les miserables', 'en'], ['the chat', 'un chat', 'fr']]) {
    const r = judge(x, one(w), at('B1', l)); assert.ok(!r.ok && !r.article, `${x} pour ${w} (${l}) : ce n'est pas un article oublié`);
  }
  assert.deepEqual(judge('a veces', one('a veces'), at('A1', 'es')), fine); assert.deepEqual(judge('a priori', one('a priori'), at('B2')), fine);
  // Anglais : « to » ne s'échange pas avec « the » (S3).
  assert.deepEqual(judge('the run', one('to run'), at('A1', 'en')), { ok: true, note: 'article', art: 'wrong' }); assert.deepEqual(judge('to run', one('to run'), at('A1', 'en')), fine); assert.deepEqual(judge('a cat', one('the cat'), at('A1', 'en')), fine);
  // Signes invisibles et accent en trop (S6, S7) : la réponse visible vaut le mot ; un second accent ne passe pas.
  assert.deepEqual(judge("l'école", one("L'\u202Eécole\u202C\u200B"), at('A1')), fine); assert.deepEqual(judge('é\u200Bcole', one('école'), at('A1')), fine);
  assert.deepEqual(judge('cafe\u0301', one('café'), at('A1')), fine); assert.deepEqual(judge('cafe\u0301\u0301', one('café'), at('A1')), { retry: true, accent: true, slip: 'accent' }); assert.deepEqual(judge('cafe\u0301\u0300', one('café'), at('A1'), true), { ok: false, near: true });
  // Contre-vérification (N1 à N7).
  // N1 : dans une phrase à trou aussi, seul un article de la langue du paquet se retire.
  assert.ok(!judge('veces', { type: 'cloze-type', answer: 'a veces', accepted: ['a veces'], lemmas: ['a veces'] }, at('A2', 'es')).ok);
  assert.ok(!judge('angeles', { type: 'cloze-type', answer: 'Los Angeles', accepted: ['Los Angeles'], lemmas: ['los angeles'] }, at('A2')).ok);
  // N2 : fiche ou trou sans article. En ajouter un n'est pas une faute, sauf s'il ne peut pas aller avec le mot.
  const bare = one('école', { gender: 'f' }), trou = { type: 'cloze-type', answer: 'café', accepted: ['café'], lemmas: ['un café'], gender: 'm', kind: 'nom' };
  for (const x of ['la école', 'le école', 'un école']) assert.deepEqual(judge(x, bare, at('A1')), bad, x);
  for (const x of ["l'école", 'une école', 'école']) assert.deepEqual(judge(x, bare, at('A1')), fine, x);
  for (const x of ['une café', "l'café", 'la café']) assert.deepEqual(judge(x, trou, at('A1')), bad, x);
  for (const x of ['café', 'un café', 'le café']) assert.deepEqual(judge(x, trou, at('A1')), fine, x);
  // N3 : une fiche qui n'est pas un nom n'a pas d'article qui s'échange. Son premier mot est exigé tel quel (second essai).
  const peu = one('un peu', { kind: 'adverbe' });
  assert.deepEqual(judge('un peu', peu, at('A1')), fine); assert.deepEqual(judge('le peu', peu, at('A1')), bad); assert.deepEqual(judge('du peu', peu, at('A1')), bad); assert.deepEqual(judge('peu', peu, at('A1')), miss);
  assert.deepEqual(judge('la fois', one('une fois', { kind: 'expression' }), at('A1')), bad); assert.deepEqual(judge('une plupart', one('la plupart', { kind: 'pronom' }), at('B1')), bad);
  assert.deepEqual(judge('el poco', one('un poco', { kind: 'adverbe' }), at('A1', 'es')), bad); assert.deepEqual(judge('le manger', one('manger', { kind: 'verbe' }), at('A1')), bad);
  assert.deepEqual(judge('the lot', one('a lot', { kind: 'adverbe' }), at('A1', 'en')), { ok: true, note: 'article', art: 'wrong' }); assert.deepEqual(judge('run', one('to run', { kind: 'verbe' }), at('A1', 'en')), { ok: true, note: 'article', art: 'missing' });
  assert.deepEqual(judge('le café', one('un café', { kind: 'nom' }), at('A1')), fine, 'pour un nom, un autre article du bon genre reste accepté');
  // N4 : trait d'union virtuel et autres signes invisibles, dans la fiche ou dans la réponse.
  assert.deepEqual(judge('café', one('ca\u00ADfé'), at('A1')), fine); assert.deepEqual(judge('ca\u00ADfé\uFE0F', one('café'), at('A1')), fine); assert.deepEqual(judge('ca\u0000fé', one('café'), at('A1')), fine);
  assert.ok(variants('ca\u00ADfé')[0].includes('\u00AD'), 'le mot enregistré n’est pas réécrit : les identifiants ne changent pas');
  // N5 : accent isolé placé avant le mot.
  assert.deepEqual(judge('\u0301café', one('café'), at('A1')), { retry: true, accent: true, slip: 'accent' }); assert.deepEqual(judge('\u0301un café', one('un café'), at('A1')), { retry: true, accent: true, slip: 'accent' });
  // N7 : la fiche tranche dès que son article montre l'élision ; la première lettre se lit sans son accent.
  assert.deepEqual(judge('de la ouate', one('la ouate'), at('B2')), fine); assert.deepEqual(judge("l'ouate", one('la ouate'), at('B2')), bad); assert.deepEqual(judge('du iota', one('le iota'), at('B2')), fine);
  assert.deepEqual(judge('la ola', one('une ola'), at('B2')), fine); assert.deepEqual(judge("l'ångström", one('un ångström'), at('C1')), fine); assert.deepEqual(judge('le ångström', one('un ångström'), at('C1')), bad);
  assert.deepEqual(judge("l'île", one('une île'), at('A1')), fine); assert.deepEqual(judge('la île', one('une île'), at('A1')), bad); assert.deepEqual(judge("l'œuf", one('un œuf'), at('A1')), fine); assert.deepEqual(judge('le œuf', one('un œuf'), at('A1')), bad);
  // Vérification finale : « ouïe » n'est pas « oui » ; un signe invisible ne casse ni les deux formes écrites ensemble, ni l'indice.
  assert.deepEqual(judge('la ouïe', one('une ouïe', { gender: 'f', kind: 'nom' }), at('B2')), bad); assert.deepEqual(judge("l'ouïe", one('une ouïe', { gender: 'f', kind: 'nom' }), at('B2')), fine); assert.deepEqual(judge('le oui', one('un oui'), at('B2')), fine);
  assert.deepEqual(judge('un serveur \u200Bet une serveuse', { ...srv, answer: 'un serveur', accepted: ['un serveur'], ask: 'm', gender: 'm' }, at('A1')), { ok: true, note: 'both' });
  // La consigne le dit : « Écris le mot avec son article » là où il est exigé, et seulement là.
  const d = demoDeck(), by = w => d.cards.find(c => c.word === w), make = (deck, c) => buildActivity(deck, c, 5, Math.random, { force: 'type' });
  assert.equal(make(d, by('Un café')).art, true); assert.equal(make(d, by("L'addition")).art, true); assert.equal(make(d, by("L'addition")).gender, 'f'); assert.equal(make(d, by('Payer')).art, false); assert.equal(make(d, by('Cher / chère')).art, false);
  const srvA = make(d, by('Un serveur / une serveuse')); assert.equal(srvA.art, true); assert.equal(srvA.gender, srvA.ask); assert.equal(srvA.kind, 'nom'); assert.equal(make(d, by('Payer')).kind, 'verbe');
  // Une locution qui commence par un mot-article n'est pas un nom : pas de consigne d'article. Fiche faite de signes invisibles (N6) : rien à écrire, pas d'exception.
  const odd = prepare({ id: 'odd1', name: 'x', lang: 'fr', level: 'B1', cards: [{ id: 'p', word: 'Un peu', definition: 'pas beaucoup', examples: ['Je parle [un peu] français.'], pos: 'adverbe' }, { id: 'q', word: '\u200B\u200B', definition: 'rien', examples: [], pos: 'nom' }, { id: 'r', word: 'Un café', definition: 'une boisson', examples: ['Je bois un [café].'], pos: 'nom', gender: 'm' }] });
  assert.equal(make(odd, odd.cards[0]).art, false); assert.equal(make(odd, odd.cards[0]).kind, 'adverbe'); assert.deepEqual(judge('le peu', make(odd, odd.cards[0]), odd), bad);
  const soft = prepare({ id: 'soft1', name: 'y', lang: 'fr', level: 'A1', cards: [{ id: 'a', word: 'Un ca\u00ADfé', definition: 'une boisson', examples: [], pos: 'nom', gender: 'm' }, { id: 'b', word: 'Un thé', definition: 'une autre boisson', examples: [], pos: 'nom' }, { id: 'c', word: 'Un jus', definition: 'une boisson de fruit', examples: [], pos: 'nom' }] });
  assert.equal(make(soft, soft.cards[0]).hint, 'u _   _ _ _ _', 'l’indice ne compte pas le trait d’union virtuel');
  const ghost = make(odd, odd.cards[1]); assert.ok(!ghost || ghost.type !== 'type', 'fiche invisible : pas d’exercice d’écriture impossible');
  const cz = buildActivity(odd, odd.cards[2], 3, Math.random, { force: 'cloze-type' }); assert.equal(cz.type, 'cloze-type'); assert.equal(cz.gender, 'm'); assert.deepEqual(judge('une café', cz, odd), bad); assert.deepEqual(judge('café', cz, odd), fine);
  assert.deepEqual(judge('addition', make(d, by("L'addition")), d), miss); assert.deepEqual(judge('un addition', make(d, by("L'addition")), d), bad); assert.deepEqual(judge('une addition', make(d, by("L'addition")), d), fine);
  const en = prepare({ id: 'en1', name: 'x', lang: 'en', level: 'A1', cards: [{ id: 'a', word: 'An apple', definition: 'a fruit', examples: ['I eat an [apple].'], pos: 'nom' }, { id: 'b', word: 'A pear', definition: 'another fruit', examples: [], pos: 'nom' }, { id: 'c', word: 'A plum', definition: 'a small fruit', examples: [], pos: 'nom' }] });
  assert.equal(make(en, en.cards[0]).art, false, 'anglais : l’article n’est pas exigé, la consigne ne le demande pas');
  const { STR } = await import('../js/i18n.js');
  for (const l of ['fr', 'en', 'es']) for (const k of ['shiftLabel', 'tryCap', 'tryArtMissing', 'tryArtWrong', 'alsoArtMissing', 'alsoArtWrong', 'qTypeArt']) assert.ok(typeof STR[l][k] === 'string' && STR[l][k].length > 8 && !STR[l][k].includes('—'), l + ' ' + k);
  // Prompts : l'IA écrit chaque nom avec l'article qui montre son genre, et les majuscules accentuées.
  const P = l => buildPrompts({ lang: l, level: 'A2', topic: 'x' });
  for (const k of ['file', 'cards', 'review']) {
    assert.ok(P('fr')[k].includes('jamais « l\' », qui cache le genre') && P('fr')[k].includes('article écrit dans "word"'), 'fr ' + k);
    assert.ok(P('es')[k].includes('« un aula »') && P('es')[k].includes('article écrit dans "word"') && P('es')[k].includes('« Él »'), 'es ' + k);
    assert.ok(!P('en')[k].includes('article écrit dans "word"'), 'en ' + k);
  }
});

t('version 15a bis : colonnes non reconnues d’un tableur gardées dans le navigateur, absentes du fichier exporté', () => {
  const csv = 'Mot;Définition;Exemple 1;Notes perso;Remarque secrète\nUn café;Une boisson chaude et noire.;Je bois un [café].;Vu avec le groupe B;à revoir avec Paul\nUn thé;Une boisson chaude aux feuilles.;Je bois un [thé].;;\nUne tasse;Un objet pour boire.;Je prends une [tasse].;perso;';
  const d = deckFromCSV(csv, 'Essai colonnes', 'fr');
  assert.ok(Object.values(d.cards[0].extra).includes('Vu avec le groupe B'), 'la colonne non reconnue reste dans le paquet du navigateur');
  assert.ok(JSON.stringify(serialize(d)).includes('Vu avec le groupe B') && d.fields.some(f => f.startsWith('extra:')), 'et dans ce que le navigateur enregistre');
  const out = deckToJSON(d), back = JSON.parse(out);
  for (const secret of ['Vu avec le groupe B', 'à revoir avec Paul', 'Notes perso', 'Remarque secrète', 'perso']) assert.ok(!out.includes(secret), 'absent du fichier exporté : ' + secret);
  assert.ok(back.cards.every(c => !('extra' in c) && !('doubt' in c)) && !('fields' in back), 'ni les colonnes, ni la liste des noms de colonnes');
  const withDoubt = deckFromCSV(csv.replace('Remarque secrète', 'Doute').replace('à revoir avec Paul', 'sens à vérifier'), 'Essai doute', 'fr');
  assert.equal(withDoubt.cards[0].doubt, 'sens à vérifier'); assert.ok(!/doubt|Doute|sens à vérifier/.test(deckToJSON(withDoubt)), 'le fichier ne dit même pas qu’une colonne « Doute » existait');
  const forged = deckFromJSON(JSON.stringify({ ...back, fields: ['Extra:Notes perso', ' extra:x', 'word'] })); assert.ok(!deckToJSON(forged).includes('Notes perso'), 'liste de colonnes forgée par un tiers : elle ne ressort pas');
  assert.deepEqual(back.cards.map(c => c.word), ['Un café', 'Un thé', 'Une tasse']); assert.equal(back.cards[0].examples.length, 1);
  const again = deckFromJSON(out); assert.equal(again.cards.length, 3); assert.equal(again.id, d.id, 'le paquet réimporté garde son identifiant, donc la progression');
  assert.ok(d.cards[0].extra && Object.keys(d.cards[0].extra).length === 2, 'l’export ne modifie pas le paquet lui-même');
});

// ---------- Version 15b : plan personnel, première partie ----------
const { PACES, paceDays, newToday, simulate, minutes, cleanMeasure, emptyMeasure, addTime, addTry, rates, startPlan, cleanPlan, missedNow, markWorked, today: planToday, stepsLeft, outlook, milestone, dayStart, dayEnd, dayIndex, DAY: PDAY } = await import('../js/plan.js');
const { adviseDays, PLAN_DAYS } = await import('../js/deck.js');
const { orderNew } = await import('../js/session.js');
const { cleanProgress, mergeProgress } = await import('../js/backup.js');
const { shiftProgress } = await import('../js/scheduler.js');
const T0 = new Date(2026, 10, 24, 10, 0, 0).getTime();      // un mardi matin, heure locale
// Paquet d'essai : la démonstration, sans ses familles de sens (elles ont leur propre groupe de tests), en A2.
const planDeck = (extra = {}) => { const d = demoDeck(); d.demo = false; for (const c of d.cards) delete c.family; Object.assign(d, { days: 6, seen: true, level: 'A2' }, extra); return prepare(d); };

t('15b : jours conseillés et « mots déjà vus en classe », deux champs facultatifs du paquet', () => {
  assert.equal(adviseDays(6), 6); assert.equal(adviseDays('6'), 6); assert.equal(adviseDays(' 12 '), 12); assert.equal(adviseDays(60), 60);
  for (const bad of [3, 0, -6, 61, 'six', '', null, undefined, true, '6 jours', 1e9, NaN, {}, [6], '6.5']) assert.equal(adviseDays(bad), 0, 'refusé : ' + JSON.stringify(bad));
  const d = planDeck(), out = deckToJSON(d), raw = JSON.parse(out);
  assert.equal(raw.days, 6); assert.equal(raw.seen, true, 'les deux champs partent dans le fichier donné aux étudiants');
  const back = deckFromJSON(out); assert.equal(back.days, 6); assert.equal(back.seen, true); assert.equal(back.id, d.id);
  assert.equal(serialize(d).days, 6); assert.equal(serialize(d).seen, true, 'et sont enregistrés dans le navigateur');
  const plain = demoDeck(), rawPlain = JSON.parse(deckToJSON(plain));
  assert.ok(!('days' in rawPlain) && !('seen' in rawPlain) && plain.days === undefined && plain.seen === undefined, 'paquet sans réglage : aucun champ, rien ne change');
  const forged = k => deckFromJSON(JSON.stringify({ ...rawPlain, ...k }));
  assert.equal(forged({ days: 3 }).days, undefined, 'moins de quatre jours : pas de plan'); assert.equal(forged({ days: '<img>' }).days, undefined); assert.equal(forged({ days: 9999 }).days, undefined);
  assert.equal(forged({ seen: 'true' }).seen, undefined, 'seul le booléen vrai compte'); assert.equal(forged({ seen: 1 }).seen, undefined);
  assert.equal(forged({ jours: 8, vus: true }).days, 8); assert.equal(forged({ jours: 8, vus: true }).seen, true, 'noms français acceptés');
  assert.equal(deckFromCSV(DEMO_CSV, 'Sans rythme', 'fr', 'A1').days, undefined);
});

t('15b : trois pas autour des jours conseillés, jamais moins de quatre jours', () => {
  assert.deepEqual(PACES, ['slow', 'mid', 'fast']);
  assert.deepEqual(paceDays(6), [['slow', 9], ['mid', 6], ['fast', 4]]);
  assert.deepEqual(paceDays(10), [['slow', 15], ['mid', 10], ['fast', 7]]);
  assert.deepEqual(paceDays(5), [['slow', 8], ['mid', 5], ['fast', 4]]);
  assert.deepEqual(paceDays(4), [['slow', 6], ['mid', 4]], 'le pas rapide retomberait sur le pas du cours : il n’est pas proposé');
  assert.deepEqual(paceDays(3), []); assert.deepEqual(paceDays(undefined), []);
  for (let D = PLAN_DAYS.min; D <= PLAN_DAYS.max; D++) for (const [, n] of paceDays(D)) assert.ok(n >= PLAN_DAYS.min && n <= PLAN_DAYS.long);
});

t('15b : découverte dans la première moitié du plan, retard étalé, tout le reste le dernier jour', () => {
  const run = (M, D, missed = 0, skip = []) => { let left = M; const out = []; for (let d = 0; d < D; d++) { if (skip.includes(d)) { out.push(0); continue; } const n = newToday(left, D, d, missed && d > skip[0] ? missed : 0); out.push(n); left -= n; } return out; };
  assert.deepEqual(run(60, 6), [20, 20, 20, 0, 0, 0]); assert.deepEqual(run(60, 9), [12, 12, 12, 12, 12, 0, 0, 0, 0], 'neuf jours : moitié arrondie au-dessus');
  assert.deepEqual(run(60, 4), [30, 30, 0, 0]); assert.deepEqual(run(85, 6), [29, 28, 28, 0, 0, 0]); assert.deepEqual(run(7, 1), [7]);
  assert.deepEqual(run(60, 6, 1, [1]), [20, 0, 20, 20, 0, 0], 'jour manqué : la découverte se prolonge d’un jour, le retard s’étale');
  assert.equal(newToday(10, 6, 5, 0), 10, 'dernier jour : tout ce qui reste'); assert.equal(newToday(10, 6, 9, 0), 10, 'plan dépassé : tout ce qui reste');
  assert.equal(newToday(0, 6, 0), 0); assert.equal(newToday(12, 4, 2, 3), 12, 'les jours manqués ne repoussent jamais la découverte sur le dernier jour');
});

t('15b : le calendrier joué à blanc donne des durées stables et plausibles', () => {
  const a = simulate({ fresh: 60, days: 6, now: T0 }), b = simulate({ fresh: 60, days: 6, now: T0 + 3600000 });
  assert.deepEqual(a.per, b.per, 'même plan, mêmes nombres : le tirage est à graine fixe');
  assert.equal(a.per.length, 6); assert.ok(Math.abs(a.total - a.per.reduce((x, y) => x + y, 0)) < 1e-9); assert.ok(a.max >= a.avg);
  const one = simulate({ fresh: 60, days: 6, single: true, now: T0 }), slow = simulate({ fresh: 60, days: 9, single: true, now: T0, mark: 6 }), fast = simulate({ fresh: 60, days: 4, single: true, now: T0 });
  assert.ok(one.total < a.total - 100, 'mots déjà vus en classe : pas d’écran de découverte, une question au lieu de deux');
  assert.ok(slow.avg < one.avg && one.avg < fast.avg, 'plus de jours, moins d’étapes par jour'); assert.ok(slow.total > one.total, 'et davantage de rappels en tout');
  assert.ok(one.total / 60 > 2 && one.total / 60 < 3.2, 'entre deux et trois réponses par mot sur six jours : ' + (one.total / 60).toFixed(2));
  assert.equal(slow.seen, 1, 'pas lent : tous les mots découverts au bout des jours conseillés'); assert.ok(slow.again > 0.4 && slow.again < 0.9, 'mais pas tous rappelés un autre jour : ' + slow.again.toFixed(2));
  const weak = simulate({ fresh: 60, days: 6, single: true, ok: 0.75, now: T0 }); assert.ok(weak.total > one.total, 'moins de réussite : plus de rattrapages');
  assert.equal(minutes(24, 15), 6); assert.equal(minutes(0, 15), 1, 'jamais « 0 minute »'); assert.equal(minutes(40, 30), 20);
  const t1 = performance.now(); for (const D of [9, 6, 4]) simulate({ fresh: 85, days: D, ok: 0.8, now: T0 + D }); assert.ok(performance.now() - t1 < 1500, 'assez rapide pour un téléphone');
});

t('15b : mesure locale de la vitesse et de la réussite', () => {
  const m = emptyMeasure(); assert.deepEqual(rates(m), { sec: 15, ok: 0.9, timed: false, measured: false });
  addTime(m, 500); addTime(m, 91000); addTime(m, NaN); assert.equal(m.t.length, 0, 'ni double appui, ni téléphone posé');
  for (let i = 0; i < 9; i++) addTime(m, 20000); assert.equal(rates(m).sec, 15, 'neuf mesures : pas encore'); addTime(m, 20000); assert.equal(rates(m).sec, 20);
  for (let i = 0; i < 80; i++) addTime(m, 8000); assert.equal(m.t.length, 60); assert.equal(rates(m).sec, 8, 'les soixante dernières : la médiane suit l’étudiant');
  for (let i = 0; i < 19; i++) addTry(m, i % 2 === 0); assert.equal(rates(m).ok, 0.9); addTry(m, true); assert.equal(rates(m).ok, 0.55); assert.equal(rates(m).measured, true);
  for (let i = 0; i < 400; i++) addTry(m, true); assert.ok(m.tries <= 200 && m.ok <= m.tries && rates(m).ok === 0.98, 'taux borné, anciennes réponses allégées');
  for (let i = 0; i < 400; i++) addTry(m, false); assert.equal(rates(m).ok, 0.5);
  assert.deepEqual(cleanMeasure({ t: [5, '9', -1, 500, null, 12.345], tries: 10, ok: 99 }), { t: [5, 12.3], tries: 10, ok: 10 });
  assert.deepEqual(cleanMeasure('<script>'), emptyMeasure()); assert.deepEqual(cleanMeasure({ t: '<img>', tries: '<b>', ok: {} }), emptyMeasure());
});

t('15b : programme du jour, en une ou deux fois, arrêté le matin', () => {
  const d = planDeck(), M = d.cards.length, P = {}; P._plan = startPlan('mid', 6, T0, 6);
  assert.equal(P._plan.start, dayStart(T0)); assert.equal(dayIndex(P._plan.start, T0 + 5 * PDAY), 5);
  let T = planToday(d, P, P._plan, T0); const perDay = Math.ceil(M / 3);
  assert.equal(T.d, 0); assert.equal(T.fresh, perDay); assert.equal(T.rev, 0); assert.equal(T.freshLeft, perDay); assert.equal(T.complete, false); assert.equal(T.done, 0);
  Object.assign(P._plan, T.snap);
  const s = new Session(d, P, { now: T0, rnd: () => 0.5, plan: { fresh: T.freshLeft, dueBy: dayEnd(T0) } });
  assert.equal(s.planned, true); assert.equal(s.endAt, Infinity, 'pas de minuteur qui coupe'); assert.equal(s.held, false);
  assert.deepEqual(s.today, d.cards.slice(0, perDay).map(c => c.id), 'découverte dans l’ordre des fiches'); assert.deepEqual(orderNew(d, P, 3).map(c => c.id), d.cards.slice(0, 3).map(c => c.id));
  assert.ok(s.queue.every(i => i.kind === 'quiz' && i.first && i.force === 'type'), 'mots déjà vus en classe : aucun écran de découverte, première question écrite');
  // Première moitié de la journée : deux mots, puis l'étudiant s'arrête.
  for (let k = 0; k < 2; k++) { const step = s.next(T0 + k * 20000); assert.equal(step.activity.type, 'type'); assert.ok(step.activity.accepted.length); s.answer(step, true, T0 + k * 20000 + 9000); markWorked(P._plan, T0 + k * 20000 + 9000); }
  assert.ok(d.cards.slice(0, 2).every(c => P[c.id].seen && P[c.id].born >= T0 && P[c.id].box === 2), 'le mot naît à sa première réponse, écrite et réussie : boîte 2');
  assert.equal(s.stats.fresh, 2); assert.equal(P._plan.last, 0); assert.equal(P._plan.missed, 0);
  T = planToday(d, P, P._plan, T0 + 6 * 3600000);
  assert.equal(T.fresh, perDay, 'le programme annoncé le matin ne bouge pas'); assert.equal(T.freshLeft, perDay - 2); assert.equal(T.done, 2); assert.equal(T.total, perDay); assert.equal(T.complete, false);
  // Seconde fois, le soir : le reste du programme, rien de plus.
  const s2 = new Session(d, P, { now: T0 + 6 * 3600000, rnd: () => 0.5, plan: { fresh: T.freshLeft, dueBy: dayEnd(T0) } });
  assert.deepEqual(s2.today, d.cards.slice(2, perDay).map(c => c.id)); assert.equal(s2.queue.filter(i => !i.first).length, 0, 'aucune révision : les mots du matin ne sont pas dus avant plusieurs jours');
  for (let step = s2.next(T0 + 7 * 3600000); step; step = s2.next(T0 + 7 * 3600000)) { if (!step.activity.multi) s2.answer(step, true, T0 + 7 * 3600000); }
  T = planToday(d, P, P._plan, T0 + 8 * 3600000); assert.equal(T.complete, true, 'journée faite'); assert.equal(T.done, perDay); assert.equal(T.freshLeft, 0);
  assert.ok(stepsLeft(T) === 0);
  // Le lendemain : nouveau programme, calculé sur ce qu'il reste.
  T = planToday(d, P, P._plan, T0 + PDAY); assert.equal(T.d, 1); assert.equal(T.fresh, Math.ceil((M - perDay) / 2)); assert.equal(T.done, 0); assert.equal(T.complete, false);
  // Programme refait en cours de journée (changement de pas) : ce qui est fait aujourd'hui reste compté.
  const Q = JSON.parse(JSON.stringify(P)); Q._plan.day = -1; const R = planToday(d, Q, Q._plan, T0 + 8 * 3600000);
  assert.equal(R.done, perDay); assert.ok(R.total >= R.done && R.fresh >= perDay, 'le total ne passe jamais sous ce qui est fait');
});

t('15b : première question écrite, et fiche ratée redemandée avec l’aide maximale', () => {
  const d = planDeck(), P = {}; P._plan = startPlan('mid', 6, T0);
  const s = new Session(d, P, { now: T0, rnd: () => 0.5, plan: { fresh: 3, dueBy: dayEnd(T0) } });
  const step = s.next(T0); assert.equal(step.intro, undefined); assert.equal(step.activity.type, 'type');
  s.answer(step, false, T0 + 5000);
  assert.equal(P[step.card.id].box, 1); assert.equal(P[step.card.id].lastOk, false); assert.ok(P[step.card.id].born >= T0);
  const retry = s.queue.find(i => i.retry && i.id === step.card.id); assert.ok(retry && retry.force === 'type' && retry.help === true, 'rattrapage sous la même forme, avec première lettre et longueur');
  assert.ok(!isDue(P[step.card.id], dayEnd(T0)), 'un mot raté n’est pas dû une seconde fois le même jour : seul le rattrapage de la séance le redemande');
  // Paquet à jours conseillés dont les mots n'ont PAS été vus en classe : l'écran de découverte reste, avec ses deux questions.
  const e = planDeck({ seen: undefined }), Pe = {}; assert.equal(e.seen, undefined);
  const se = new Session(e, Pe, { now: T0, rnd: () => 0.5, plan: { fresh: 4, dueBy: dayEnd(T0) } });
  assert.equal(se.noIntro, false); assert.equal(se.queue.filter(i => i.kind === 'intro').length, 4); assert.ok(se.next(T0).intro);
  // Paquet sans jours conseillés mais « vus en classe » : pas de plan, « Appétit du jour » garde la main, sans écran de découverte.
  const f = planDeck({ days: undefined }), sf = new Session(f, {}, { now: T0, maxNew: 3, rnd: () => 0.5 });
  assert.equal(f.days, undefined); assert.equal(sf.planned, false); assert.ok(Number.isFinite(sf.endAt)); assert.equal(sf.today.length, 3); assert.ok(sf.queue.every(i => i.kind === 'quiz' && i.force === 'type'));
});

t('15b : jour manqué constaté à la première réponse, plan recalculé, reste à faire rejoué', () => {
  const d = planDeck(), P = {}; P._plan = startPlan('mid', 6, T0, 6); const plan = P._plan;
  assert.equal(missedNow(plan, 0), 0, 'le premier jour n’est jamais manqué d’avance'); assert.equal(missedNow(plan, 1), 1, 'pas choisi, rien fait, retour le lendemain : un jour manqué'); assert.equal(missedNow(plan, 3), 3);
  markWorked(plan, T0); assert.equal(plan.last, 0); assert.equal(missedNow(plan, 1), 0); assert.equal(missedNow(plan, 3), 2, 'jours 1 et 2 sans séance');
  markWorked(plan, T0 + 3 * PDAY); assert.equal(plan.missed, 2); assert.equal(plan.last, 3); markWorked(plan, T0 + 3 * PDAY + 60000); assert.equal(plan.missed, 2, 'constaté une seule fois');
  const full = simulate({ fresh: 60, days: 6, single: true, now: T0 }), late = simulate({ fresh: 40, days: 6, from: 3, missed: 2, single: true, now: T0 + 3 * PDAY }), longer = simulate({ fresh: 40, days: 8, from: 3, missed: 2, single: true, now: T0 + 3 * PDAY });
  assert.equal(late.days, 3); assert.ok(late.avg > full.avg * 0.5 && longer.avg < late.avg, 'garder la fin coûte plus par jour que la reculer');
  const o = outlook(d, P, plan, T0 + 3 * PDAY, { single: true }); assert.equal(o.days, 3); assert.ok(o.total >= d.cards.length, 'ce qu’il reste : tous les mots encore nouveaux');
  const over = outlook(d, P, plan, T0 + 30 * PDAY, { single: true }); assert.equal(over.days, 1, 'plan dépassé : il reste aujourd’hui');
  const T = planToday(d, P, plan, T0 + 30 * PDAY); assert.equal(T.over, true); assert.equal(T.fresh, d.cards.length, 'plan dépassé : tout ce qui reste est proposé');
});

t('15b : le plan est sauvegardé, restauré et décalé comme le reste, jamais repris tel quel', () => {
  const plan = { ...startPlan('slow', 9, T0, 7), last: 2, missed: 1, ack: 1, day: 3, fresh: 12, rev: 20 }, now = T0 + 4 * PDAY;
  assert.deepEqual(cleanPlan(plan, now), plan); assert.deepEqual(cleanProgress({ _plan: plan }, now)._plan, plan);
  for (const bad of [null, 'slow', { pace: 'mammouth', days: 6, start: T0 }, { pace: 'mid', days: '<img>', start: T0 }, { pace: 'mid', days: 6 }, { pace: 'mid', days: 6, start: 'hier' }]) assert.equal(cleanPlan(bad, now), null);
  assert.ok(!('_plan' in cleanProgress({ _plan: { pace: '<img src=x onerror=alert(1)>', days: 6, start: T0 } }, now)), 'pas forgé : écarté');
  const odd = cleanPlan({ pace: 'fast', days: 1e9, start: now + 90 * PDAY, last: -50, missed: 3, ack: 99, est: -4, day: 'x', fresh: 1e9, rev: -3 }, now);
  assert.deepEqual(odd, { pace: 'fast', days: PLAN_DAYS.long, start: dayStart(now), last: -1, missed: 3, ack: 3, est: 0, day: -1, fresh: 2000, rev: 0, recap: -1, ask: -1, offer: 0, small: false }, 'chaque champ borné ; jamais un début dans le futur');
  assert.ok(Object.values(odd).every(v => typeof v === 'number' || typeof v === 'boolean' || PACES.includes(v)), 'rien d’autre que des nombres et un nom de pas connu : aucun texte ne peut atteindre l’écran');
  const shifted = shiftProgress({ _plan: plan }, 2 * PDAY)._plan; assert.equal(shifted.start, plan.start - 2 * PDAY, 'mode essai : avancer de deux jours fait avancer le plan de deux jours'); assert.equal(dayIndex(shifted.start, T0), 2); assert.equal(shifted.pace, 'slow');
  const mine = { _plan: plan }, saved = { _plan: startPlan('fast', 4, T0 - 9 * PDAY) };
  assert.equal(mergeProgress(mine, saved, now)._plan.pace, 'slow', 'restaurer une sauvegarde ne remplace pas le plan en cours'); assert.equal(mergeProgress({}, saved, now)._plan.pace, 'fast', 'mais le rend à un appareil qui n’en a pas');
});

t('15b, relecture de sécurité : un plan forgé ou très ancien ne ralentit ni ne trompe l’appli', () => {
  const now = T0 + 4 * PDAY, top = 2 * PLAN_DAYS.long;
  assert.equal(cleanPlan({ pace: 'slow', days: 180, start: T0, last: 0, missed: 3650 }, now).missed, top, 'jours manqués bornés à deux fois la durée la plus longue');
  assert.equal(cleanPlan({ pace: 'fast', days: 4, start: 0, missed: 3650 }, now), null, 'plan daté de 1970 : écarté, l’étudiant choisit de nouveau son pas');
  assert.equal(cleanPlan({ pace: 'mid', days: 6, start: now - (top + 2) * PDAY }, now), null); assert.ok(cleanPlan({ pace: 'mid', days: 6, start: now - (top - 2) * PDAY }, now));
  const t1 = performance.now(), big = simulate({ fresh: 2000, days: 180 + 3650, single: true, now: T0 + 7 }); const ms = performance.now() - t1;
  assert.ok(big.days <= top, 'jamais plus de ' + top + ' jours joués à blanc : ' + big.days); assert.ok(ms < 4000, 'paquet de deux mille fiches : ' + ms.toFixed(0) + ' ms');
  const d = planDeck(), P = { _plan: startPlan('mid', 6, T0) }, back = planToday(d, P, P._plan, T0 - 3 * PDAY);
  assert.equal(back.d, 0, 'horloge reculée après le choix du pas : jamais un jour négatif'); markWorked(P._plan, T0 - 3 * PDAY); assert.equal(P._plan.last, 0); assert.equal(P._plan.missed, 0);
  const mine = { _plan: startPlan('mid', 6, T0) }, forged = { _plan: { pace: 'fast', days: 4, start: T0 - 2 * PDAY, missed: 300, best: 1e9 } };
  assert.equal(mergeProgress(mine, forged, now)._plan.pace, 'mid', 'sauvegarde forgée, même avec un champ « best » : le plan en cours reste');
});

t('15b : deux mots de sens proche ne sont jamais découverts le même jour', () => {
  const d = planDeck(); d.cards[0].family = 'boisson'; d.cards[1].family = 'boisson'; prepare(d); const ids = d.cards.map(c => c.id), P = {};
  assert.deepEqual(orderNew(d, P, 5, T0).map(c => c.id), [ids[0], ids[2], ids[3], ids[4], ids[5]], 'le voisin cède sa place au mot suivant');
  P[ids[0]] = { seen: true, box: 2, born: T0 }; assert.ok(!orderNew(d, P, 5, T0 + 3600000).some(c => c.id === ids[1]), 'même en seconde partie de journée');
  assert.equal(orderNew(d, P, 5, T0 + PDAY)[0].id, ids[1], 'et passe en tête du lendemain');
  const all = orderNew(d, {}, 99, T0).map(c => c.id); assert.equal(all.length, d.cards.length); assert.equal(all.at(-1), ids[1], 'dernier jour : il entre quand même, en fin de séance, loin de son voisin');
  const s = new Session(d, { _plan: startPlan('mid', 6, T0) }, { now: T0, rnd: () => 0.5, plan: { fresh: 5, dueBy: dayEnd(T0) } }); assert.ok(!s.today.includes(ids[1]) && s.today.length === 5);
  // Relecture de sécurité : mille fiches d'une famille nées aujourd'hui, mille d'une autre encore nouvelles, une intruse en fin de paquet.
  const big = { cards: Array.from({ length: 2000 }, (_, i) => ({ id: 'k' + i, family: i < 1000 ? 'A' : 'B', neighbours: [] })) }, Pb = {};
  for (let i = 0; i < 1000; i++) Pb['k' + i] = { seen: true, box: 2, born: T0 }; Pb.k1999 = { seen: true, box: 2, born: T0 };
  const t1 = performance.now(), got = orderNew(big, Pb, 1, T0 + 60000), ms = performance.now() - t1;
  assert.ok(ms < 200, 'coût linéaire : ' + ms.toFixed(0) + ' ms'); assert.equal(got.length, 1, 'il ne reste que des voisins : un seul entre quand même');
  assert.deepEqual(orderNew({ cards: [{ id: 'a' }, { id: 'b', neighbours: null }] }, {}, 2, T0).map(c => c.id), ['a', 'b'], 'fiche sans liste de voisins : aucune exception');
});

t('15b : tous les mots vus dans le temps imparti, quel que soit le pas et malgré les jours manqués', () => {
  const run = (M, D, cap, skip = []) => { let left = M, missed = 0; const out = []; for (let d = 0; d < D; d++) { if (skip.includes(d)) { out.push(0); missed++; continue; } const n = newToday(left, D, d, missed, cap); out.push(n); left -= n; } return out; };
  for (const [D, skip] of [[9, []], [9, [0]], [9, [1, 2]], [9, [0, 1, 2, 3]], [6, [1]], [6, [0, 1, 2]], [4, [1]], [12, [2, 3]]]) {
    const days = run(60, D, 6, skip), by5 = days.slice(0, 5).reduce((a, b) => a + b, 0);
    assert.equal(by5, 60, `pas de ${D} jours, jours manqués ${skip} : tout est découvert avant le dernier jour conseillé (${days})`);
  }
  assert.deepEqual(run(60, 9, 6), [12, 12, 12, 12, 12, 0, 0, 0, 0]); assert.deepEqual(run(60, 9, 6, [1, 2]), [12, 0, 0, 24, 24, 0, 0, 0, 0], 'pas lent, deux jours manqués : la découverte se resserre, elle ne déborde pas');
  const sim = simulate({ fresh: 60, days: 9, cap: 6, perNew: 1, now: T0, mark: 6 }); assert.equal(sim.seen, 1);
  const d = planDeck(), P = { _plan: { ...startPlan('slow', 9, T0), last: 0, missed: 0 } }, T = planToday(d, P, P._plan, T0 + 4 * PDAY);
  assert.equal(T.fresh, d.cards.length, 'cinquième jour, rien de découvert : tout ce qui reste est au programme, avant la fin des jours conseillés');
  const m = milestone(d, P, P._plan, T0 + 2 * PDAY); assert.deepEqual([m.daysLeft, m.total, m.seen, m.again, m.unseen], [4, d.cards.length, 0, 0, d.cards.length]);
  P[d.cards[0].id] = { seen: true, box: 3, born: T0, fsrs: { last_review: T0 + 2 * PDAY, due: T0 + 9 * PDAY } }; P[d.cards[1].id] = { seen: true, box: 2, born: T0, fsrs: { last_review: T0 + 60000, due: T0 + 3 * PDAY } };
  const m2 = milestone(d, P, P._plan, T0 + 2 * PDAY); assert.deepEqual([m2.seen, m2.again], [2, 1], 'vu, et rappelé un autre jour que celui de sa découverte');
});

t('15b : niveau A1, mots vus en classe, choisir le mot puis l’écrire avec aide ; à partir de A2, écrire tout de suite', () => {
  const a1 = planDeck({ level: 'A1' }), P = { _plan: startPlan('mid', 6, T0) }, s = new Session(a1, P, { now: T0, rnd: () => 0.5, plan: { fresh: 3, dueBy: dayEnd(T0) } });
  assert.equal(s.ease, true); assert.ok(s.queue.every(i => i.first && i.force === 'qcm-rev'));
  const step = s.next(T0); assert.ok(step.activity.options && step.activity.type !== 'type' && !step.activity.gated, 'premier temps : un choix, sans écran de découverte');
  s.answer(step, true, T0 + 4000); assert.equal(P[step.card.id], undefined, 'le choix réussi ne prouve encore rien : le mot n’est pas né');
  const bonus = s.queue.find(i => i.bonus && i.id === step.card.id); assert.ok(bonus && bonus.force === 'type' && bonus.help === true);
  let b; do { b = s.next(T0 + 9000); if (b.item !== bonus) s.answer(b, true, T0 + 9000); } while (b.item !== bonus);
  assert.equal(b.activity.type, 'type'); assert.ok(/_/.test(b.activity.hint), 'second temps : écrire, avec première lettre et longueur');
  s.answer(b, true, T0 + 20000, {}); assert.equal(P[step.card.id].box, 2); assert.ok(P[step.card.id].born >= T0, 'c’est la réponse écrite qui fait naître le mot');
  const a2 = planDeck(), s2 = new Session(a2, {}, { now: T0, rnd: () => 0.5, plan: { fresh: 3, dueBy: dayEnd(T0) } }); assert.equal(s2.ease, false); assert.ok(s2.queue.every(i => i.force === 'type'));
  const b1 = planDeck({ level: 'B1' }), s3 = new Session(b1, {}, { now: T0, rnd: () => 0.5, plan: { fresh: 3, dueBy: dayEnd(T0) } }); assert.equal(s3.next(T0).activity.hint, '', 'B1 : aucune aide');
  const cost = (lv) => simulate({ fresh: 60, days: 6, perNew: lv === 'A1' ? 2 : 1, cap: 6, now: T0 }).total; assert.ok(cost('A1') > cost('A2') + 50, 'le plan compte l’étape de plus du niveau A1');
});

t('15b : prompts, ordre des fiches gardé et rien sur le rythme', () => {
  const withList = buildPrompts({ lang: 'fr', level: 'A2', topic: 'Le logement', words: 'un loyer\nun bail\nun voisin' }), free = buildPrompts({ lang: 'en', level: 'B1', topic: 'Work', count: 20 });
  for (const k of ['file', 'cards']) {
    assert.ok(withList[k].includes('ORDRE DES FICHES') && withList[k].includes('Ne la trie pas'), 'liste imposée : ordre gardé (' + k + ')');
    assert.ok(free[k].includes('ORDRE DES FICHES') && free[k].includes('des mots les plus utiles aux moins utiles'), 'sans liste : du plus utile au moins utile (' + k + ')');
    assert.ok(withList[k].includes('rien sur le rythme de travail') && free[k].includes('Ce rythme se règle dans l\'application'), 'aucun champ de rythme (' + k + ')');
    assert.ok(!/"days"|"seen"/.test(withList[k]), 'le modèle de paquet donné à l’IA ne contient ni « days » ni « seen »');
  }
  assert.ok(withList.review.includes('Ne change pas l\'ordre des fiches'));
});

// ---------- Version 15c : « déjà su », reprise générale, seconde séance, séances courtes, jours choisis ----------
const { known, KNOWN_DAYS, isNew: isNew15 } = await import('../js/scheduler.js');
const { Placement } = await import('../js/session.js');
const { isStale, staleIds, weakIds, OWN, SMALL, cleanPlan: cleanPlan15, startPlan: startPlan15, today: today15, simulate: simulate15, milestone: milestone15, newToday: newToday15, outlook: outlook15 } = await import('../js/plan.js');
const { countLate, LATE_MS, cleanState: cleanState15 } = await import('../js/backup.js');
const DAY15 = 86400000;

t('15c : « déjà su », un état prouvé par écrit, qui ne revient pas avant trente-cinq jours tant qu’il est réussi sans aide', () => {
  const st = known(T0);
  assert.equal(st.known, true); assert.equal(st.box, 4); assert.ok(inHerd(st), 'le mot rejoint le troupeau'); assert.equal(st.born, T0);
  assert.equal(st.fsrs.due, T0 + KNOWN_DAYS * DAY15); assert.ok(!isDue(st, T0 + 34 * DAY15) && isDue(st, T0 + 36 * DAY15));
  const good = review(st, 'good', T0 + 5 * DAY15); assert.equal(good.known, true); assert.ok(good.fsrs.due >= T0 + 40 * DAY15 - 1000, 'réussi à la reprise générale : pas avant trente-cinq jours de plus');
  const hard = review(st, 'hard', T0 + 5 * DAY15); assert.ok(!hard.known && hard.fsrs.due < T0 + 40 * DAY15, 'aidé ou hésitant : il redevient un mot comme les autres');
  const again = review(st, 'again', T0 + 5 * DAY15); assert.ok(!again.known && again.box === 3 && again.fsrs.due < T0 + 8 * DAY15, 'raté : circuit normal');
  const kept = cleanState15({ ...st, weak: T0, evil: '<img>' }, T0 + 1000); assert.equal(kept.known, true); assert.equal(kept.weak, T0); assert.ok(!('evil' in kept));
  assert.ok(!('known' in cleanState15({ ...st, known: 'oui' }, T0)) && !('weak' in cleanState15({ ...st, weak: '<b>' }, T0)) && !('weak' in cleanState15({ ...st, weak: true }, T0)), 'ni texte ni valeur étrangère');
  assert.equal(cleanState15({ ...st, weak: T0 + 9 * DAY15 }, T0).weak, T0, 'jamais dans le futur');
  assert.equal(shiftProgress({ a: { ...st, weak: T0 } }, DAY15).a.weak, T0 - DAY15, 'le mode essai décale aussi ce repère');
});

t('15c : test « déjà su », une question écrite sans indice par mot coché, réussite du premier coup exigée', () => {
  const d = planDeck(), P = {}, ids = d.cards.slice(0, 5).map(c => c.id), s = new Placement(d, P, [...ids, ids[0], 'inconnu'], { rnd: () => 0.3 });
  assert.equal(s.total, 5, 'ni doublon ni fiche étrangère'); assert.equal(s.placement, true);
  const a = s.next(); assert.equal(a.activity.type, 'type'); assert.equal(a.activity.hint, '', 'aucun indice : c’est une preuve'); assert.ok(a.activity.accepted.length > 0);
  s.answer(a, true, T0, {}); assert.ok(P[a.card.id].known && inHerd(P[a.card.id]), 'réussi du premier coup : déjà su');
  const b = s.next(); s.answer(b, true, T0, { assisted: true }); assert.equal(P[b.card.id], undefined, 'réussi au second essai : pas une preuve, le mot reste à apprendre');
  const c = s.next(); s.answer(c, false, T0, {}); assert.equal(P[c.card.id], undefined, 'raté : aucune pénalité, le mot reste nouveau');
  assert.deepEqual(s.stats.known, [a.card.id]); assert.deepEqual(s.stats.later, [b.card.id, c.card.id]); assert.equal(s.remaining, 2);
  assert.equal(new Placement(d, P, ids).total, 4, 'un mot déjà prouvé n’est pas redemandé');
  // Le plan se calcule sur les mots restants : un mot déjà su n’est ni un mot nouveau ni une révision du jour.
  const plan = startPlan15('mid', 6, T0), T = today15(d, P, plan, T0);
  assert.equal(T.left, d.cards.length - 1); assert.equal(T.done, 0); assert.equal(T.rev, 0); assert.equal(T.fresh, newToday15(d.cards.length - 1, 6, 0, 0, 6), 'programme du premier jour : seulement les mots à apprendre');
  const all = simulate15({ fresh: 60, days: 6, single: true, cap: 6, now: T0 }).total, less = simulate15({ fresh: 45, days: 6, single: true, cap: 6, now: T0 }).total; assert.ok(less < all * 0.8, 'quinze mots déjà sus : un plan plus léger');
  assert.equal(milestone15(d, P, plan, T0).again, 1, 'un mot déjà su compte comme rappelé');
});

t('15c : reprise générale le dernier jour du plan, une seule fois, et à la demande', () => {
  const d = planDeck(), P = {}, plan = startPlan15('mid', 6, T0), day = k => T0 + k * DAY15;
  // Jour 0 : dix mots découverts et réussis. Jour 3 : cinq d’entre eux revus.
  d.cards.slice(0, 10).forEach(c => { P[c.id] = { ...review(undefined, 'good', day(0)), born: day(0) }; P[c.id].fsrs.due = day(20); });
  d.cards.slice(0, 5).forEach(c => { P[c.id] = { ...review(P[c.id], 'good', day(3)), born: day(0) }; P[c.id].fsrs.due = day(20); });
  assert.ok(!isStale(P[d.cards[0].id], day(3)) && !isStale(P[d.cards[0].id], day(4)) && isStale(P[d.cards[0].id], day(5)), 'à reprendre : pas rappelé depuis deux jours');
  assert.ok(!isStale(P[d.cards[7].id], day(0)) && isStale(P[d.cards[7].id], day(1)), 'ou jamais rappelé un autre jour que celui de sa découverte');
  assert.ok(!isStale(undefined, day(5)) && !isStale({}, day(5)));
  const mid = today15(d, P, plan, day(4)); assert.equal(mid.recap, false); assert.equal(mid.stale, 5, 'en cours de plan : rien n’est ajouté, mais cinq mots pourraient être repris');
  const last = today15(d, P, plan, day(5)); assert.equal(last.recap, true); assert.equal(last.revLeft, 10, 'dernier jour : les dix mots à reprendre sont au programme'); assert.equal(last.snap.recap, 5);
  assert.deepEqual(staleIds(d, P, day(5)).sort(), d.cards.slice(0, 10).map(c => c.id).sort());
  Object.assign(plan, last.snap);
  const s = new Session(d, P, { now: day(5), rnd: () => 0.5, plan: { fresh: 0, dueBy: day(5), also: staleIds(d, P, day(5)) } }); assert.equal(s.queue.length, 10);
  const st = s.next(day(5)); s.answer(st, true, day(5), {}); assert.ok(P[st.card.id].fsrs.last_review === day(5), 'enregistrée comme une révision ordinaire');
  assert.equal(today15(d, P, plan, day(5)).revLeft, 9); assert.equal(today15(d, P, plan, day(6)).recap, false, 'le lendemain : la reprise a eu lieu, elle ne revient pas');
  const late = startPlan15('mid', 6, T0); assert.equal(today15(d, P, late, day(8)).recap, true, 'dernier jour manqué : la reprise attend le premier jour travaillé ensuite');
  const ask = startPlan15('mid', 6, T0); ask.ask = 4; const asked = today15(d, P, ask, day(4)); assert.equal(asked.recap, true); assert.equal(asked.snap.recap, -1, '« Tout revoir » : à la demande, sans consommer la reprise du dernier jour');
  assert.equal(today15(d, P, startPlan15(OWN, 1, T0), T0).recap, false, 'plan d’un seul jour : rien à reprendre');
  // La simulation la compte : plus d’étapes le dernier jour, et davantage de mots rappelés un autre jour.
  const on = simulate15({ fresh: 60, days: 6, single: true, cap: 6, now: T0, mark: 6 }), off = simulate15({ fresh: 60, days: 6, single: true, cap: 6, now: T0, mark: 6, recap: false });
  assert.ok(on.per[5] > off.per[5] && on.again >= off.again && on.again > 0.99, 'avec la reprise : tous les mots rappelés un autre jour au bout des six jours');
  const three = simulate15({ fresh: 60, days: 3, single: true, cap: 6, now: T0, mark: 3 }), threeOff = simulate15({ fresh: 60, days: 3, single: true, cap: 6, now: T0, mark: 3, recap: false });
  assert.ok(three.again > 0.99 && threeOff.again < 0.7, 'plan de trois jours : c’est la reprise qui donne à chaque mot un rappel un autre jour');
  plan.recap = 2; assert.ok(outlook15(d, P, plan, day(4)).total <= outlook15(d, P, { ...plan, recap: -1 }, day(4)).total, 'reprise déjà faite : elle n’est plus comptée');
});

t('15c : seconde séance, les mots ratés ou aidés du jour sont redemandés sans déplacer la fiche', () => {
  const d = planDeck(), P = {}, s = new Session(d, P, { now: T0, rnd: () => 0.5, plan: { fresh: 4, dueBy: dayEnd(T0) } });
  const a = s.next(T0); s.answer(a, false, T0 + 1000, {}); const b = s.next(T0 + 2000); if (b.item.retry) { s.answer(b, true, T0 + 2000, {}); }
  let x; const seenIds = new Set([a.card.id]); let aided = null, clean = null;
  while ((x = s.next(T0 + 3000))) { if (x.item.retry) { s.answer(x, true, T0 + 3000, {}); continue; } if (seenIds.has(x.card.id)) continue; seenIds.add(x.card.id); if (!aided) { aided = x.card.id; s.answer(x, true, T0 + 3000, { assisted: true }); } else { clean = x.card.id; s.answer(x, true, T0 + 3000, {}); } }
  assert.ok(P[a.card.id].weak >= T0 && P[aided].weak >= T0, 'raté ou aidé : marqué pour la seconde séance'); assert.ok(!('weak' in P[clean]), 'réussi sans aide : rien à redemander');
  assert.deepEqual(weakIds(d, P, T0 + 5000).sort(), [a.card.id, aided].sort()); assert.deepEqual(weakIds(d, P, T0 + DAY15), [], 'le lendemain, ils ne sont plus redemandés : le calendrier les ramène');
  assert.equal(today15(d, P, startPlan15('mid', 6, T0), T0 + 5000).weak, 2);
  const before = JSON.stringify(P[aided].fsrs), s2 = new Session(d, P, { now: T0 + 3600000, rnd: () => 0.5, plan: { fresh: 0, dueBy: 0, again: weakIds(d, P, T0 + 3600000) } });
  assert.equal(s2.queue.length, 2); assert.ok(s2.queue.every(i => i.retry && i.second && i.force === 'type'), 'à l’écrit, hors calendrier');
  const r = s2.next(T0 + 3600000); assert.equal(r.activity.type, 'type'); s2.answer(r, true, T0 + 3600000, {});
  assert.ok(!('weak' in P[r.card.id]), 'redemandé une fois : il ne le sera plus aujourd’hui'); if (r.card.id === aided) assert.equal(JSON.stringify(P[aided].fsrs), before, 'la fiche ne bouge pas');
  const r2 = s2.next(T0 + 3600000); s2.answer(r2, false, T0 + 3600000, {}); assert.equal(s2.queue.length, 1, 'raté encore : rattrapage dans la séance, comme d’habitude'); assert.deepEqual(weakIds(d, P, T0 + 3700000), []);
  const free = demoDeck(), Pf = {}, sf = new Session(free, Pf, { now: T0, rnd: () => 0.5 }); let y; while ((y = sf.next(T0))) { if (!y.intro && !y.activity.multi) sf.answer(y, false, T0, {}); }
  assert.ok(Object.values(Pf).every(st => !('weak' in st)), 'hors plan personnel : rien ne change');
});

t('15c : séances courtes du parcours adapté, cinq mots nouveaux et dix révisions au plus', () => {
  const d = planDeck(), P = {};
  d.cards.slice(0, 14).forEach(c => { P[c.id] = { ...review(undefined, 'good', T0 - 4 * DAY15), born: T0 - 4 * DAY15 }; });
  const full = new Session(d, P, { now: T0, rnd: () => 0.5, plan: { fresh: 9, dueBy: dayEnd(T0) } }), small = new Session(d, P, { now: T0, rnd: () => 0.5, plan: { fresh: 9, dueBy: dayEnd(T0), chunk: SMALL } });
  assert.equal(full.today.length, Math.min(9, d.cards.length - 14)); assert.equal(small.today.length, Math.min(5, d.cards.length - 14)); assert.ok(small.queue.filter(i => !i.first).length <= 10 && small.queue.length < full.queue.length);
  assert.deepEqual(small.today, full.today.slice(0, small.today.length), 'toujours dans l’ordre des fiches : les mots prioritaires d’abord');
  const plan = cleanPlan15({ ...startPlan15('mid', 6, T0), offer: 2, small: true }, T0); assert.equal(plan.small, true); assert.equal(plan.offer, 2);
  assert.equal(cleanPlan15({ ...startPlan15('mid', 6, T0), offer: 9, small: 'oui', recap: '<b>', ask: 1e9 }, T0).offer, 2); assert.equal(cleanPlan15({ ...startPlan15('mid', 6, T0), small: 'oui' }, T0).small, false);
});

t('15c : « J’ai moins de jours », un plan aux jours choisis par l’étudiant, annoncé honnêtement', () => {
  const own = startPlan15(OWN, 2, T0); assert.equal(own.pace, 'own'); assert.equal(own.days, 2); assert.equal(cleanPlan15(own, T0).pace, 'own'); assert.equal(cleanPlan15({ ...own, pace: 'turbo' }, T0), null);
  assert.equal(newToday15(60, 2, 0, 0, 6), 60, 'deux jours : tout le premier jour'); assert.equal(newToday15(60, 3, 0, 0, 6), 30); assert.equal(newToday15(60, 1, 0, 0, 6), 60);
  const two = simulate15({ fresh: 60, days: 2, single: true, cap: 6, now: T0, mark: 2 }), six = simulate15({ fresh: 60, days: 6, single: true, cap: 6, now: T0, mark: 6 });
  assert.ok(two.seen > 0.99 && two.again > 0.99 && two.avg > six.avg * 2, 'deux jours : tout est vu et repris une fois, au prix de journées bien plus lourdes');
  const one = simulate15({ fresh: 60, days: 1, single: true, cap: 6, now: T0, mark: 1 }); assert.ok(one.seen > 0.99 && one.again === 0, 'un seul jour : tout est vu, rien n’est rappelé un autre jour, et l’écran le dit');
});

t('15c : « dans les temps » ou en retard, d’après les mots qui devraient déjà être vus', () => {
  const d = planDeck(), n = d.cards.length, plan = startPlan15('mid', 6, T0), P = {};
  assert.equal(milestone15(d, P, plan, T0).behind, 0, 'premier jour : rien n’est attendu');
  assert.equal(milestone15(d, P, plan, T0 + DAY15).behind, Math.floor(n / 3), 'un jour sans rien : le tiers des mots manque (découverte sur trois jours)');
  d.cards.slice(0, Math.ceil(n / 3)).forEach(c => { P[c.id] = { ...review(undefined, 'good', T0), born: T0 }; });
  assert.equal(milestone15(d, P, plan, T0 + DAY15).behind, 0, 'programme fait : dans les temps'); assert.equal(milestone15(d, P, plan, T0 + 4 * DAY15).behind, n - Math.ceil(n / 3));
});

t('15c, sécurité : une sauvegarde datée de plus de cinq minutes dans le futur ne remplace rien, et l’appli le compte', () => {
  assert.equal(LATE_MS, 5 * 60000);
  const mine = { a: review(undefined, 'good', T0 - DAY15), b: review(undefined, 'good', T0 - DAY15) };
  const soon = { ...review(undefined, 'good', T0), box: 5 }; soon.fsrs.last_review = T0 + 6 * 3600000;      // « dans six heures » : acceptée jusqu’à la 15b
  const near = { ...review(undefined, 'good', T0), box: 4 }; near.fsrs.last_review = T0 + 2 * 60000;        // deux minutes d’avance : écart d’horloge ordinaire
  const out = mergeProgress(mine, { a: soon, b: near, c: soon }, T0);
  assert.equal(out.a.box, mine.a.box, 'datée dans le futur : la progression de l’appareil est gardée'); assert.equal(out.b.box, 4, 'deux minutes d’avance : acceptée'); assert.ok(out.c, 'fiche sans progression : reprise quand même, ramenée à maintenant'); assert.ok(out.c.fsrs.last_review <= T0);
  assert.equal(countLate(mine, { a: soon, b: near, c: soon, _plan: {} }, T0), 1); assert.equal(countLate(mine, null, T0), 0); assert.equal(countLate(mine, { a: { fsrs: { last_review: '<img>' } } }, T0), 1, 'date illisible : laissée de côté elle aussi');
});

t('15c : textes en trois langues, mêmes clés, sans tiret cadratin, et chaque clé appelée par l’interface existe', async () => {
  const { STR } = await import('../js/i18n.js'), app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const mine = Object.keys(STR.fr).filter(k => /^(pl[A-Z]|plc|pace_|chShort|bkAskLate)/.test(k));
  assert.ok(mine.length > 80);
  for (const l of ['fr', 'en', 'es']) for (const k of mine) assert.ok(typeof STR[l][k] === 'string' && STR[l][k].length > 1 && !STR[l][k].includes('—'), l + ' ' + k);
  const used = new Set([...app.matchAll(/\bt\('(pl[A-Za-z_]*|plc[A-Za-z]*|chShort[A-Za-z]*|bkAskLate)'/g)].map(m => m[1]));
  for (const k of used) if (!k.endsWith('_')) assert.ok(k in STR.fr, 'clé appelée mais absente : ' + k);      // « plNote_ » + pas : clé composée
  for (const k of ['plNewN', 'chShortNew']) for (const l of ['fr', 'en', 'es']) assert.ok(STR[l][k + '_1'] && STR[l][k + '_n'], 'singulier et pluriel : ' + k);
  for (const l of ['fr', 'en', 'es']) assert.ok(STR[l].fEstimate.includes('{4}') && !/\b15 (secondes|seconds|segundos)/.test(STR[l].fEstimate), 'l’estimation dit la vitesse de départ réellement utilisée');
});

t('15c : prompts, la définition doit suffire seule parce que l’appli la montre seule pour faire écrire le mot', () => {
  const pr = buildPrompts({ lang: 'fr', level: 'A2', topic: 'Le logement', words: 'un loyer\nun bail' }), en = buildPrompts({ lang: 'en', level: 'B1', topic: 'Work', count: 20 });
  for (const x of [pr, en]) { for (const k of ['file', 'cards']) assert.ok(x[k].includes('preuve d\'un mot qu\'il dit déjà savoir') && x[k].includes('une bonne réponse sera comptée fausse'), k); assert.ok(x.review.includes('la montre seule quand l\'étudiant doit écrire le mot de tête')); }
  assert.ok(!/déjà su|reprise générale|seconde séance/i.test(pr.file), 'rien d’autre sur le plan : il se règle dans l’appli');
});

t('15c, relecture de sécurité : identifiants de fiche réservés, « déjà su » d’un fichier, réponse rejouée, naissance négative', async () => {
  const { cardKey } = await import('../js/deck.js');
  for (const bad of ['_plan', '_stages', '_race', '_match', '_x', 'a*b', '__proto__', '', 'a b', null]) assert.equal(cardKey(bad), '', 'refusé : ' + bad);
  assert.equal(cardKey('abc-1_2'), 'abc-1_2');
  const raw = JSON.parse(deckToJSON(demoDeck())); raw.cards[0].id = '_plan'; raw.cards[1].id = '_stages'; raw.cards[2].id = 'a*b';
  const d = deckFromJSON(JSON.stringify(raw)); assert.ok(d.cards.every(c => cardKey(c.id) === c.id), 'aucune fiche ne peut porter une clé réservée de la progression');
  const P = { _plan: startPlan15('mid', 6, T0) }, s = new Session(Object.assign(d, { days: 6, seen: true }), P, { now: T0, rnd: () => 0.5, plan: { fresh: 5, dueBy: dayEnd(T0) } });
  let x; while ((x = s.next(T0))) { if (!x.intro && !x.activity.multi) s.answer(x, true, T0, {}); }
  assert.equal(P._plan.pace, 'mid'); assert.equal(P._plan.days, 6, 'le plan n’est jamais écrasé par une réponse');
  // « déjà su » venu d’un fichier : gardé pour une fiche sans progression, jamais posé sur une fiche déjà travaillée ici.
  const mine = { a: review(undefined, 'good', T0 - DAY15) }, forged = { ...known(T0 - 1000) };
  const merged = mergeProgress(mine, { a: forged, b: forged }, T0);
  assert.ok(merged.a.box === 4 && !('known' in merged.a), 'état plus récent repris, sans le drapeau'); assert.equal(merged.b.known, true, 'nouvel appareil : la preuve suit la sauvegarde');
  assert.equal(cleanState15({ ...mine.a, born: -1e308 }, T0).born, 0, 'naissance jamais négative');
  // Une réponse rejouée sur la même question du test « déjà su » ne change rien.
  const d2 = planDeck(), P2 = {}, pl = new Placement(d2, P2, d2.cards.slice(0, 2).map(c => c.id), { rnd: () => 0.3 }), st = pl.next();
  pl.answer(st, false, T0, {}); pl.answer(st, true, T0, {}); assert.equal(P2[st.card.id], undefined, 'raté puis rejoué juste : toujours pas une preuve'); assert.equal(pl.stats.answered, 1); assert.deepEqual(pl.stats.known, []);
  // Seconde séance : une échéance forgée à zéro n’y entre pas comme révision ordinaire.
  const P3 = {}; d2.cards.slice(0, 3).forEach(c => { P3[c.id] = { ...review(undefined, 'good', T0), born: T0 }; P3[c.id].fsrs.due = 0; }); P3[d2.cards[0].id].weak = T0;
  const sec = new Session(d2, P3, { now: T0 + 3600000, rnd: () => 0.5, plan: { fresh: 0, dueBy: -1, again: weakIds(d2, P3, T0 + 3600000) } }); assert.equal(sec.queue.length, 1); assert.ok(sec.queue[0].second && sec.queue[0].retry);
});

t('typographie française de l’interface', async () => {
  const { typoFr, typoDeep, typoFaults } = await import('../js/typo.js'), { STR } = await import('../js/i18n.js'), NB = ' ';
  assert.equal(typoFr('Mots à apprendre : 14. Prêt ? Oui ! Non ; « Au café » · 15 fiches, {0} min'), `Mots à apprendre${NB}: 14. Prêt${NB}? Oui${NB}! Non${NB}; «${NB}Au café${NB}» · 15${NB}fiches, {0}${NB}min`);
  assert.equal(typoFr('Jour 2 sur 6'), 'Jour 2 sur 6', 'un nombre suivi d’un mot qui n’est pas une unité reste libre');
  assert.equal(typoFr('https://exemple.fr/a?b=1'), 'https://exemple.fr/a?b=1', 'une adresse n’est pas touchée');
  assert.equal(typoFr('fine ?'), `fine${NB}?`, 'l’espace fine, absente de la police, devient une insécable simple');
  for (const x of ['Prêt ? Oui !', 'a : b', '« x »']) { const y = typoFr(x); assert.equal(typoFr(y), y, 'la passe ne change plus rien la seconde fois'); assert.equal(y.length, x.length, 'la longueur est gardée'); }
  assert.deepEqual(typoDeep({ a: 'x : y', b: [['t', 'u ?']], c: 3 }), { a: `x${NB}: y`, b: [['t', `u${NB}?`]], c: 3 });
  // Aucun texte français de l'interface ne garde une espace ordinaire devant « : ; ! ? » ni dans les guillemets.
  let seen = 0; const walk = (v, k) => { if (typeof v === 'string') { seen++; assert.deepEqual(typoFaults(v), [], 'espace ordinaire dans le texte « ' + k + ' »'); } else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, k + '.' + kk); };
  walk(STR.fr, 'fr'); assert.ok(seen > 600, 'tous les textes français sont parcourus');
  assert.ok(!STR.en.plLead.includes(NB) && !STR.es.plLead.includes(NB), 'l’anglais et l’espagnol ne reçoivent pas la typographie française');
});

t('une fiche écrite avec des espaces insécables se comporte comme la même fiche avec des espaces simples', () => {
  for (const sp of [' ', ' ']) {
    const nb = x => x.replace(/ ([?!:;»])/g, sp + '$1').replace(/« /g, '«' + sp);
    for (const [w, x] of [['un café', 'Tu veux un café ?'], ['cher / chère', 'Cette table est trop chère !'], ['la note', 'Monsieur, la note : douze euros.'], ['commander', '« Je voudrais commander », dit-elle.']])
      assert.deepEqual(findSpans(nb(x), w), findSpans(x, w), x);
    assert.deepEqual(clozes({ word: 'un café', examples: [nb('Tu veux un café ?')], clozes: [] }).map(c => c.answer), ['café']);
    assert.equal(check('un' + sp + 'café', ['un café']).ok, true); assert.equal(check('s\'il vous plaît', ['s\'il' + sp + 'vous plaît']).ok, true);
  }
});

await Promise.all(pending);
console.log(`${n} groupes de tests réussis`);
