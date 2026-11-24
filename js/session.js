// Éléfiches — déroulement d'une session : quelles fiches, dans quel ordre, sous quelle forme.
// Les questions se répondent par un choix ou par une réponse courte écrite (un mot ou une expression).
import { review, isNew, isDue, boxOf, HERD_BOX } from './scheduler.js';
import { check, variants } from './match.js';
import { spec, LIMITS } from './levels.js';

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
const apos = s => s.replace(/[’`´]/g, "'");
// Ce qui permet d'écarter un mot piège sans connaître le sens : sa nature (un verbe parmi des noms), son genre
// (« une ___ » devant un masculin) et son début (« l'___ » ou « an ___ » devant une consonne). Les mots proposés
// ensemble partagent donc ces trois traits, et de préférence le thème : il ne reste que le sens pour choisir.
const ARTS = /^(?:un|une|des|du|le|la|les|l'|a|an|the|to|el|los|las|una|unos|unas)(?:\s+|(?<=')\s*)/i;
// Catégorie grammaticale d'une fiche. Celle du paquet (« pos ») fait foi, quelle que soit son écriture ; à défaut elle
// est déduite du mot (article, « to »), puis de sa place dans ses phrases d'exemple, puis de sa terminaison.
// Deux mots ne sont proposés ensemble que s'ils ont la même catégorie : c'est une règle, pas une préférence.
const POS = [['nom', /^(n\b|nom|noun|sust|subst)/i], ['verbe', /^(v\b|verb)/i], ['adjectif', /^adj/i], ['adverbe', /^adv/i], ['expression', /^(expr|locution|phrase|idiom|frase)/i],
  ['préposition', /^pr[ée]p/i], ['conjonction', /^conj/i], ['pronom', /^pron/i], ['déterminant', /^(d[ée]t|article)/i], ['nombre', /^(num|nombre|chiffre|number)/i], ['interjection', /^interj/i]];
const BEFORE = {      // le mot qui précède la forme étudiée, dans une phrase d'exemple
  nom: /(?:^|[\s'’])(?:le|la|les|l|un|une|des|du|au|aux|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs|ce|cet|cette|ces|quel|quelle|the|a|an|my|your|his|her|its|our|their|this|that|these|those|some|el|los|las|unos|unas|mi|mis|tu|tus|su|sus|este|esta|del|al)['’]?\s*$/i,
  verbe: /(?:^|[\s'’])(?:je|j|tu|il|elle|on|nous|vous|ils|elles|ne|n|i|you|he|she|it|we|they|to|will|can|could|must|should|don't|doesn't|didn't|yo|tú|él|ella|nosotros|ellos|ellas|no|me|te|se)['’]?\s*$/i,
  adjectif: /(?:^|[\s'’])(?:très|trop|assez|plus|moins|si|est|sont|suis|es|êtes|sommes|était|very|too|so|quite|is|are|am|was|were|muy|más|menos|está|están|soy|eres|era)\s*$/i,
};
const VERB_END = { fr: /(?:er|ir|re|oir)$/i, es: /(?:ar|er|ir|arse|erse|irse)$/i, en: /^$/ };
// Mots grammaticaux : des listes fermées, donc reconnaissables sans se tromper. Une préposition (« depuis », « jusqu'à »,
// « au mois de ») n'est jamais proposée avec un nom ou un verbe, ni un article seul (« le ») avec une préposition.
const PREP = {
  fr: 'à au aux de du des d en dans sur sous vers chez pour par avec sans entre avant après depuis pendant durant dès jusque jusqu contre malgré selon envers parmi devant derrière',
  en: 'in on at for since during until till by from to with without before after between among under over above below into onto through across towards toward against near of off',
  es: 'a al de del en con sin por para desde durante hasta sobre entre hacia ante tras bajo contra según',
};
const PREP_END = { fr: ['de', 'd', 'à', 'au', 'aux', 'du', 'des'], en: ['of', 'to', 'from', 'with'], es: ['de', 'a', 'del', 'al'] };
const PREP_PHRASE = { fr: ['il y a'], en: [], es: ['hace'] };
// Premier mot des locutions prépositives courantes : « près de », « grâce à », « because of », « cerca de ».
const PREP_HEAD = { fr: 'près loin grâce lors afin autour hors face quant auprès', en: 'because instead out next close according due ahead', es: 'cerca lejos junto dentro fuera delante detrás encima debajo alrededor después antes frente' };
const DET = {
  fr: 'le la les l un une des du ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs quel quelle quels quelles chaque',
  en: 'the a an this that these those some any my your his her its our their each every',
  es: 'el la los las un una unos unas este esta estos estas ese esa mi mis tu tus su sus cada',
};
const sets = new Map(), setOf = (table, lang) => { const key = table === PREP ? 'p' + lang : 'd' + lang; if (!sets.has(key)) sets.set(key, new Set((table[lang] || table.fr).split(' '))); return sets.get(key); };
function closedClass(word, lang) {
  const w = word.toLowerCase().replace(/…|\.\.\./g, ' ').trim(), toks = w.split(/[\s']+/).filter(Boolean);
  if (!toks.length) return '';
  const prep = setOf(PREP, lang), det = setOf(DET, lang);
  if ((PREP_PHRASE[lang] || []).includes(toks.join(' '))) return 'préposition';
  if (toks.every(x => det.has(x)) && !toks.every(x => prep.has(x))) return 'déterminant';
  if (toks.every(x => prep.has(x))) return 'préposition';
  const head = (PREP_HEAD[lang] || PREP_HEAD.fr).split(' ');
  if (toks.length > 1 && (prep.has(toks[0]) || head.includes(toks[0])) && (PREP_END[lang] || PREP_END.fr).includes(toks.at(-1)) && !det.has(toks[1])) return 'préposition';   // « au mois de », « à partir de », « in front of »
  return '';
}
// L'article qui annonce un nom, langue par langue : « a menudo » n'est pas un nom en espagnol, « de la paperasse » en est un en français.
const ART_OF = { fr: /^(?:un|une|des|du|le|la|les|de la|de l'|l')(?:\s+|(?<=')\s*)\S/i, en: /^(?:a|an|the)\s+\S/i, es: /^(?:el|la|los|las|un|una|unos|unas)\s+\S/i };
const hints = new WeakMap();
const posOf = c => { const pos = typeof c.pos === 'string' ? c.pos.trim() : ''; return pos ? (POS.find(([, re]) => re.test(pos)) || [pos.toLowerCase()])[0] : ''; };
// Catégorie grammaticale d'une fiche : celle que le paquet ou l'enseignant a donnée, et rien d'autre. L'application ne
// devine jamais : une fiche sans catégorie reste « autre », n'a aucune question à choix, et l'enseignant est invité à la
// classer (écran « Classer les mots »).
export const kindOf = c => posOf(c) || 'autre';
// Suggestion de catégorie, montrée à l'enseignant dans l'écran de classement. Elle ne sert à aucun exercice tant qu'il
// ne l'a pas confirmée.
export function suggestKind(c, lang = 'fr') {
  const sig = `${c.word}|${c.theme || ''}|${lang}|${(c.clozes || []).length}`, known = hints.get(c);
  if (known && known.sig === sig) return known.kind;
  const put = kind => { hints.set(c, { sig, kind }); return kind; };
  const word = apos(String(c.word || '')).replace(/\s\([^)]*\)/g, '').trim(), parts = word.split(/\s+/);
  if (/^(?:to|se)\s/i.test(word) || /^s'/i.test(word)) return put('verbe');
  // « Le (jour ou date) », rangé par l'enseignant parmi les prépositions de temps : il se choisit contre « en », « à », « au ».
  const closed = closedClass(word, lang); if (closed) return put(closed === 'déterminant' && /pr[ée]posi/i.test(c.theme || '') ? 'préposition' : closed);
  if ((ART_OF[lang] || ARTS).test(word)) return put('nom');      // « de la paperasse » : article partitif
  const end = VERB_END[lang] || VERB_END.fr;
  if (parts.length > 1) return put(end.test(parts[0]) && end.source !== '^$' ? 'verbe' : 'expression');
  // Un seul mot, sans article : sa place dans les phrases d'exemple tranche.
  const votes = { nom: 0, verbe: 0, adjectif: 0 };
  for (const cl of (c.clozes || []).slice(0, 4)) { const before = apos(cl.text.slice(0, cl.spans[0].start)); for (const k in votes) if (BEFORE[k].test(before)) { votes[k]++; break; } }
  const best = Object.keys(votes).sort((x, y) => votes[y] - votes[x])[0];
  if (votes[best]) return put(best);
  if (lang === 'en' ? /ly$/i.test(word) : lang === 'es' ? /mente$/i.test(word) : /ment$/i.test(word)) return put('adverbe');
  if (end.test(word)) return put('verbe');
  const fr = apos(String(c.translations?.fr || ''));
  if (ARTS.test(fr)) return put('nom');
  if (lang !== 'fr' && /(?:er|ir|re|oir)$/i.test(fr.split(/\s+/)[0] || '')) return put('verbe');
  return put('autre');
}
// Genre d'un nom : le champ « gender » de la fiche d'abord ; sinon l'article écrit sur la fiche quand il le dit sans
// ambiguïté (« un », « une », « le », « la »). Avec « l' », « les » ou « des », l'article ne dit rien : le genre doit
// être donné par le paquet ou par l'enseignant.
export const genderOf = c => (c.gender === 'm' || c.gender === 'f' || c.gender === 'mf' ? c.gender : /^(?:un|le|el|los|unos)\s/i.test(c.word) ? 'm' : /^(?:une|la|una|las|unas)\s/i.test(c.word) ? 'f' : '');
// Fiche à deux formes : « Un serveur / une serveuse », « Cher / chère ». Une question n'en demande jamais qu'une, et dit
// laquelle (masculin, féminin) quand la fiche permet de le savoir : par l'article de chaque forme, sinon par l'ordre
// convenu (masculin d'abord) pour un nom ou un adjectif d'une langue à genre.
export function formsOf(c, lang) {
  const raw = apos(String(c.word || ''));
  if (/\([^)\s]+\)/.test(raw)) return [];      // « recruté(e) » : une seule forme écrite, les deux sont déjà acceptées
  const parts = raw.split(/\s+\/\s+/).map(x => x.replace(/\s\([^)]*\)/g, '').trim()).filter(Boolean);
  if (parts.length !== 2) return [];
  const g = parts.map(x => genderOf({ word: x }));
  const gs = g[0] && g[1] && g[0] !== g[1] ? g : !g[0] && !g[1] && ['fr', 'es'].includes(lang) && ['nom', 'adjectif'].includes(kindOf(c)) ? ['m', 'f'] : ['', ''];
  return parts.map((text, i) => ({ text, gender: gs[i] }));
}
// Langues où le genre d'un nom compte dans les exercices.
export const GENDERED_LANGS = ['fr', 'es'];
export const needsGender = (c, lang) => GENDERED_LANGS.includes(lang) && kindOf(c) === 'nom' && !genderOf(c);
export const startOf = (text, lang) => {
  const w = String(text || '').replace(/[’`´]/g, "'").replace(ARTS, '').trim().toLowerCase().normalize('NFD');
  return !w ? '' : /^[aeiouœæ]/.test(w) || (lang !== 'en' && w[0] === 'h') ? 'V' : 'C';
};
// Ressemblance entre deux fiches pour un même exercice : nature d'abord, puis début, genre, thème.
const alike = (deck, a, b, ta, tb) => (startOf(ta, deck.lang) === startOf(tb, deck.lang) ? 8 : 0)
  + (!genderOf(a) || !genderOf(b) || genderOf(a) === genderOf(b) ? 4 : 0) + (a.theme && a.theme === b.theme ? 2 : 0);
// Réunit jusqu'à n fiches de la MÊME catégorie grammaticale, de préférence de même début et de même thème, autour d'une
// fiche tirée au sort. S'il n'existe pas « min » fiches d'une même catégorie, renvoie une liste vide : mieux vaut pas
// d'exercice de groupe qu'un groupe où la grammaire donne la réponse.
export function cluster(deck, cards, n, rnd, min = 3) {
  const pool = shuffle(cards, rnd), by = new Map();
  for (const c of pool) { const k = kindOf(c, deck.lang); if (k !== 'autre') by.set(k, [...(by.get(k) || []), c]); }      // fiche sans catégorie : jamais dans un groupe
  const groups = [...by.values()].filter(g => g.length >= min); if (!groups.length) return [];
  const group = groups.find(g => g.includes(pool[0])) || groups.sort((x, y) => y.length - x.length)[0], seed = group[0];
  return [seed, ...group.slice(1).map((c, k) => ({ c, k, v: alike(deck, seed, c, seed.bare, c.bare) })).sort((x, y) => y.v - x.v || x.k - y.k).slice(0, n - 1).map(x => x.c)];
}
// Le mot qui précède le trou impose-t-il le début ou le genre du mot attendu ? « l'___ », « an ___ », « une ___ » : oui.
const TIGHT = { en: /(?:^|\s)an?\s$/i, fr: /(?:['’]|(?:^|\s)(?:le|la|de|je|ne|que|se|me|te|ce|cet|du|au|un|une|mon|ma|ton|ta|son|sa|cette|bel|nouvel|vieil|beau|nouveau|vieux)\s)$/i, es: /(?:^|\s)(?:el|la|un|una|del|al|este|esta)\s$/i };
// Ce que le mot placé juste avant le trou impose au mot manquant, en plus de son début : un genre (« un ___ », « sa ___ »).
const GENDERED = { fr: /(?:^|\s)(?:un|une|le|la|mon|ma|ton|ta|son|sa|ce|cet|cette|du|au|quel|quelle|aucun|aucune|tout|toute)\s(?:\S+\s){0,2}$/i, es: /(?:^|\s)(?:el|la|un|una|los|las|unos|unas|este|esta|ese|esa|del|al|mucho|mucha)\s(?:\S+\s){0,2}$/i };      // « une grande ___ » : l'adjectif entre les deux ne change rien
export const genderGap = (cloze, lang) => !!cloze && !!GENDERED[lang] && GENDERED[lang].test(apos(cloze.text.slice(0, cloze.spans[0].start)));
// Nombre d'une fiche, lu sur son article (« les papiers », « des loisirs ») ; sans article pluriel, c'est un singulier.
export const numberOf = c => (/^(?:les|des|mes|ses|los|las|unos|unas)\s/i.test(String(c.word || '')) ? 'p' : 's');
// Terminaison d'une forme verbale : « virée » et « recrutée » vont dans la même phrase, « travaille » non.
const SHAPES = { fr: ['ées', 'és', 'ée', 'é', 'er', 'ir', 'oir', 're', 'ons', 'ez', 'ent', 'aient', 'ait', 'ais', 'ant'], en: ['ing', 'ed', 's'],
  es: ['ando', 'iendo', 'ados', 'adas', 'idos', 'idas', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'amos', 'emos', 'imos', 'an', 'en', 'as', 'es'] };
const shapeOf = (form, lang, verb) => { const f = String(form).trim().toLowerCase(); return (verb && (SHAPES[lang] || []).find(x => f.endsWith(x))) || f.slice(-1); };
// Même casse que la réponse : un mot piège en majuscule parmi des minuscules se repère sans lire (les sigles restent tels quels).
const caseLike = (f, answer) => (!f || /^\p{Lu}{2}/u.test(f) ? f : /^\p{Ll}/u.test(answer) || /^\p{Lu}{2}/u.test(answer) ? f[0].toLowerCase() + f.slice(1) : /^\p{Lu}/u.test(answer) ? f[0].toUpperCase() + f.slice(1) : f);
export const tightGap = (cloze, lang) => !!cloze && !!TIGHT[lang] && TIGHT[lang].test(apos(cloze.text.slice(0, cloze.spans[0].start)));
// Deux sens qui s'affichent presque à l'identique (« donner un travail à quelqu'un » pour embaucher et pour recruter) :
// les opposer dans une question donnerait deux bonnes réponses.
const FILLER = new Set('un une des les le la de du et ou qui que pour dans sur avec par est sont pas plus tres the an of to and or that which for in on with is are not very el los las una y o para en con es son muy quelqu quelque chose something someone alguien algo'.split(' '));
const core = s => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => (w.length > 2 || /\d/.test(w)) && !FILLER.has(w)));
export function sameSense(a, b) {
  if (!a || !b) return false;
  const x = core(a), y = core(b);
  if (!x.size || !y.size) return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return n === x.size && n === y.size || (x.size >= 2 && y.size >= 2 && n / (x.size + y.size - n) >= 0.75);
}
// form : les options sont des mots de la langue étudiée (et non des sens) ; le début et le genre comptent alors.
// sense : fonction qui donne le sens affiché d'une fiche ; une fiche de sens presque identique n'est jamais proposée.
// strict : le mot d'avant le trou les impose ; un mot piège qui ne s'y plie pas se verrait tout de suite, il passe en dernier.
function distractors(deck, card, n, rnd, textOf, prefer = [], { form = false, strict = false, mixed = false, sense = null, gender = false, number = false } = {}) {
  const mine = textOf(card), used = new Set([mine]), out = [], kind = kindOf(card, deck.lang);
  // Règle : même catégorie grammaticale, toujours. « mixed » n'est qu'un dernier recours, quand aucune forme d'exercice
  // n'a pu être construite autrement (fiche seule de sa catégorie) : la fiche doit tout de même pouvoir être révisée.
  const same = d => mixed || (kind !== 'autre' && kindOf(d, deck.lang) === kind);
  // Dans une phrase à trou, ce que la phrase impose n'est pas une préférence mais un filtre : le début du mot après
  // « l' » ou « an » (strict), le genre après « un » ou « sa » (gender), le nombre d'un nom (number). Un mot piège qui
  // ne tiendrait pas dans la phrase s'élimine sans connaître son sens ; mieux vaut alors une autre forme d'exercice.
  const single = x => apos(String(x)).trim().replace(ARTICLE, '').trim().split(/\s+/).length === 1;      // l'article ne compte pas : « l'addition » et « un café » sont deux mots seuls
  // Propositions équilibrées : dans un choix entre des mots, un mot seul n'est jamais proposé avec des groupes de mots
  // (un « le » seul face à trois groupes se repère sans rien savoir). Dans une phrase à trou, la règle est plus stricte
  // encore : même nombre de mots que la réponse (voir formFor).
  const fits = (d, t) => (!form || single(t) === single(mine)) && (!strict || startOf(t, deck.lang) === startOf(mine, deck.lang)) && (!gender || (!!genderOf(card) && genderOf(d) === genderOf(card))) && (!number || (numberOf(d) === numberOf(card) && !(genderOf(card) && genderOf(d) && genderOf(d) !== genderOf(card))));      // un nom : jamais un genre contraire, l'accord peut être n'importe où dans la phrase
  const ok = d => d.id !== card.id && d.key !== card.key && same(d) && !(sense && sameSense(sense(d), sense(card)));
  const score = (d, t) => (form && startOf(t, deck.lang) === startOf(mine, deck.lang) ? (strict ? 100 : 8) : 0)
    + (form && genderOf(card) && genderOf(d) && genderOf(d) !== genderOf(card) ? 0 : strict ? 60 : 4) + (form && numberOf(d) === numberOf(card) ? 3 : 0) + (card.theme && d.theme === card.theme ? 2 : 0) + (prefer.includes(d.id) ? 1 : 0);
  const ranked = (pool) => shuffle(pool, rnd).map((d, k) => ({ d, k, t: textOf(d) })).filter(x => x.t).map(x => ({ ...x, v: score(x.d, x.t) })).sort((x, y) => y.v - x.v || x.k - y.k);
  // Les fiches de sens voisin (même famille, mots définis l'un par l'autre) ne sont jamais proposées
  // face à face : deux réponses seraient défendables. Mieux vaut moins de choix, ou une autre forme d'exercice.
  for (const pool of [deck.cards.filter(d => ok(d) && !card.neighbours.includes(d.id) && !d.neighbours.includes(card.id))]) for (const { d, t } of ranked(pool)) {
    if (used.has(t) || !fits(d, t)) continue;
    used.add(t); out.push({ text: t, id: d.id });
    if (out.length === n) return out;
  }
  return out;
}

const lowerFirst = (s, word) => (/^\p{Lu}/u.test(word.replace(/^\S+\s/, '')) || /^\p{Lu}{2}/u.test(s) ? s : s[0].toLowerCase() + s.slice(1));
// Article en tête d'un mot piège : retiré quand le trou de la phrase ne contient pas d'article.
const ARTICLE = /^(?:un|une|des|du|le|la|les|l'|a|an|the|to|el|los|las|una|unos|unas)(?:\s+|(?<=')\s*)/i;
const isNumber = s => /^\d[\d\s.,]*$/.test(s || '');

// Découpe une phrase en morceaux à remettre dans l'ordre (la ponctuation reste collée au mot qui la précède).
export function chunks(text, max) {
  const w = [];
  for (const tok of text.trim().split(/\s+/)) { if (/^[?!:;»]+$/.test(tok) && w.length) w[w.length - 1] += ' ' + tok; else if (w.length && /^[«¿¡]$/.test(w[w.length - 1])) w[w.length - 1] += ' ' + tok; else w.push(tok); }
  if (w.length < 3) return null;
  const k = Math.min(w.length, max), out = [];
  for (let i = 0; i < k; i++) out.push(w.slice(Math.round(i * w.length / k), Math.round((i + 1) * w.length / k)).join(' '));
  return out;
}

// Phrase à reconstruire « sans indices » : la majuscule du début et la ponctuation de la fin désigneraient le premier
// et le dernier morceau. On les retire des morceaux ; l'écran les remet tout seul autour de la phrase construite.
const STARTERS = {
  en: "the a an my your his her its our their this that these those there here we you he she it they what where when why who how is are do does did can will in on at for with from to some any many every all no yes please now today tomorrow yesterday sometimes often always never then if and but so because let's don't can't",
  fr: "le la les l' un une des du de d' mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs ce cet cette ces je j' tu il elle on nous vous ils elles c'est il y a qui que quand où comment pourquoi est-ce aujourd'hui demain hier parfois souvent toujours maintenant ici là dans sur à en pour avec chez sans chaque tous toutes quel quelle oui non merci et mais donc alors si ne n' quelques plusieurs beaucoup au aux",
  es: 'el la los las un una unos unas mi mis tu tus su sus nuestro nuestra este esta estos estas yo tú él ella nosotros vosotros ellos ellas hay qué quién cuándo dónde cómo por no hoy mañana ayer siempre nunca ahora aquí en con para sin cada todos todas sí y pero porque si cuando muchos muchas algunos algunas del al me te se nos le lo',
};
export function neutral(parts, lang, known = new Set()) {
  const out = [...parts]; let lead = '', tail = '';
  // Ponctuation finale cherchée depuis la fin. Les phrases d'exemple sont coupées à 300 caractères à l'import : le coût reste négligeable.
  const last = out[out.length - 1], end = last.match(/[.!?…]+["»”)]*$/), body = end ? last.slice(0, end.index).trimEnd() : '';
  if (end && body) { out[out.length - 1] = body; tail = end[0]; }
  const start = out[0].match(/^([¿¡«"“(]+\s*)(.+)$/);
  if (start) { lead = start[1].trim(); out[0] = start[2]; }
  // Le premier mot perd sa majuscule seulement si c'est sans risque : mot-outil courant, ou mot vu en minuscules ailleurs
  // dans le paquet. Un nom propre (« Paris », « Marie ») et le « I » anglais gardent la leur.
  const first = (out[0].match(/^[^\s'’]+['’]?/) || [''])[0], low = first.toLowerCase().replace('’', "'");
  const safe = first !== low && !/^I(['’]|$)/.test(first) && (` ${STARTERS[lang] || ''} `.includes(` ${low} `) || known.has(low) || (low.length > 4 && low.endsWith('s') && known.has(low.slice(0, -1))));
  if (safe) out[0] = first.toLowerCase() + out[0].slice(first.length);
  return { parts: out, lead, tail };
}
// Mots vus en minuscules à l'intérieur des phrases du paquet (donc pas des noms propres).
const lowerWords = deck => (deck._lower ??= new Set(deck.cards.flatMap(c => [...c.examples.flatMap(e => e.split(/\s+/).slice(1)), ...c.word.split(/\s+/), ...(c.definition || '').split(/\s+/).slice(1)]).map(w => w.replace(/[^\p{L}'’-]/gu, '')).filter(w => w && w === w.toLowerCase())));

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
  if (!r.ok && a.both) {
    // Fiche à deux formes. Les deux formes écrites ensemble (« un serveur, une serveuse ») : c'est juste. L'autre forme
    // seule : le bon mot, mais pas la forme demandée ; l'étudiant a droit à un second essai.
    const parts = String(value).replace(/\s+/g, ' ').trim().slice(0, 400).split(/\s*[\/,;]\s*|\s+(?:et|ou|and|or|y|o)\s+/i).map(x => x.trim()).filter(Boolean);
    if (parts.length > 1 && parts.length <= 3 && parts.every(x => check(x, a.both).ok) && parts.some(x => check(x, a.accepted).ok)) return { ok: true, note: 'both' };
    if (check(value, a.both).ok) return second ? { ok: false, near: true } : { retry: true, form: a.ask || 'other' };
  }
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
// Écoute (entendre le mot), oral (le dire, puis répéter une phrase avec la voix) et phrase libre alternent avec les
// formes écrites : une fiche sur deux, d'après son identifiant et le nombre de fois où elle a été revue (alt).
// audio = l'appareil peut lire le mot et l'étudiant peut écouter maintenant.
function ladder(deck, card, box, { audio = false, alt = false } = {}) {
  const cl = card.clozes.length > 0;
  // Mot grammatical avec glose (« Au (siècle) ») ou homographe (deux fiches « En ») : seule la phrase lève l'ambiguïté.
  const needsContext = (card.bare !== card.word || deck.homographs.has(card.key)) && cl;
  if (box <= 1) return needsContext ? ['cloze-choice'] : ['qcm'];
  if (box === 2) return needsContext ? ['cloze-choice', 'qcm-rev'] : audio && alt ? ['listen', 'qcm-rev'] : ['qcm-rev'];
  if (box === 3) return ['number', ...(audio && alt && !cl ? ['listen-type'] : []), 'cloze-type', 'type', 'cloze-choice', 'qcm-rev'];
  if (box === 4) return [...(audio && alt && !needsContext ? ['speak'] : []), 'order', 'cloze-type', 'type', 'cloze-choice', 'qcm-rev'];
  return ['number', ...(alt && !needsContext ? ['sentence'] : []), 'situation-type', 'type', 'cloze-type', 'cloze-choice', 'qcm-rev'];
}
const hashInt = id => [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
// Formes où l'étudiant se juge lui-même en comparant avec un modèle.
export const SELF = ['speak', 'sentence', 'recall'];

// opts.force : forme imposée (rattrapage, phrase « bonus » du jour, défi, aperçu). opts.contrast : {text, id} de la
// mauvaise réponse donnée juste avant ; le rattrapage oppose alors la bonne réponse à cette erreur précise.
// opts.help : aide maximale à l'écriture (rattrapage). opts.gate : impose le rappel de tête (aperçu des exercices).
export function buildActivity(deck, card, box, rnd = Math.random, { force = null, prefer = [], contrast = null, help = false, gate = false, audio = false, vary = false, turn = 0, mixed = false } = {}) {
  const mean = c => meaning(c, deck.help), L = spec(deck), lures = L.options - 1;
  const typable = c => c && !c.multi && c.n <= 3, discontinuous = /…|\.\.\./.test(card.word);
  const first = card.clozes.find(c => card.examples[0] && c.text === apos(card.examples[0]));      // phrase à trous du premier exemple
  const cl = card.clozes.length ? pick(card.clozes, rnd) : null;
  const surface = d => (d.clozes.length ? lowerFirst(pick(d.clozes, rnd).answer, d.word) : null);
  // Forme d'un mot piège pour le trou d'une phrase. Si la réponse est le mot à sa forme de base (« embaucher », « cow »),
  // le mot piège est donné à sa forme de base lui aussi. Si la réponse est fléchie (« embauché », « cows »), il faut une
  // forme du mot piège qui se termine de la même façon (« licencié », « pigs »). Aucune forme convenable : la fiche n'est
  // pas proposée, plutôt qu'un mot qui ne tiendrait pas dans la phrase.
  const lemma = c => apos(c.bare).replace(/^de (?:la\s+|l')/i, '').replace(ARTICLE, '').trim(), count = x => x.trim().split(/\s+/).length, verb = kindOf(card, deck.lang) === 'verbe', last = x => shapeOf(x, deck.lang, verb);
  const formFor = (answer, d) => {
    const base = answer.toLowerCase() === lemma(card).toLowerCase();
    const pool = base ? [lemma(d)] : d.clozes.filter(x => !x.multi).map(x => lowerFirst(x.answer, d.word)).filter(f => f.toLowerCase() !== lemma(d).toLowerCase() && last(f) === last(answer));
    return caseLike(pool.find(f => f && count(f) === count(answer)) || null, answer);
  };
  const hint = answer => hintOf(answer, help ? 'pattern' : L.hint);
  // Une seule forme par question pour une fiche qui en a deux ; elle alterne d'une révision à l'autre.
  const forms = formsOf(card, deck.lang), fi = forms.length ? (hashInt(card.id) + box + turn) % forms.length : 0, form = forms[fi] || null;
  const one = d => { const f = d.id === card.id ? forms : formsOf(d, deck.lang); return f.length ? f[Math.min(fi, f.length - 1)].text : d.bare; };
  const asked = form ? { both: variants(card.word), ask: form.gender, say: form.text } : {};
  const choice = (answer, ds, extra = {}) => {
    if (!answer || ds.length < (mixed || contrast ? 1 : Math.min(2, lures))) return null;
    const keep = contrast && contrast.text !== answer ? [contrast] : ds;
    return { answer, options: shuffle([answer, ...keep.map(d => d.text)], rnd), from: Object.fromEntries(keep.filter(d => d.id).map(d => [d.text, d.id])), ...extra };
  };
  const written = (c, extra = {}) => (typable(c) ? { cloze: c, answer: c.answer, accepted: [c.answer], lemmas: variants(card.word), hint: hint(c.answer), ...extra } : null);
  // Aux niveaux A1 et A2, le sens se choisit parmi des images quand le paquet en a assez : une définition en langue
  // apprise est elle-même difficile à lire pour un débutant.
  const meanings = extra => {
    const shown = c => /^data:image\//i.test(c.image || '');      // image intégrée au paquet : elle s'affichera à coup sûr
    if (LIMITS[deck.level]?.image && shown(card)) {
      const ds = distractors(deck, card, lures, rnd, d => (shown(d) ? mean(d) : null), prefer, { mixed, sense: mean });
      if (ds.length === lures) return choice(mean(card), ds, { pics: Object.fromEntries([[mean(card), card.image], ...ds.map(d => [d.text, deck.byId[d.id].image])]), ...extra });
    }
    return choice(mean(card), distractors(deck, card, lures, rnd, mean, prefer, { mixed, sense: mean }), extra);
  };
  const sayable = !isNumber(card.definition);
  const make = {
    qcm: () => meanings({}),
    // Écoute : le mot est entendu, pas montré. L'étudiant choisit son sens, ou l'écrit.
    listen: () => (sayable ? meanings({ listen: true, ...(form ? { say: form.text } : {}) }) : null),
    'listen-type': () => (discontinuous || !sayable ? null : (v => ({ answer: form ? form.text : card.word, accepted: v, hint: hint(v[0]), listen: true, ...asked, ask: '' }))(variants(form ? form.text : card.word))),      // la forme entendue : inutile de la nommer
    // Oral : l'étudiant dit le mot à partir de son sens, compare avec la voix, puis répète une phrase en même temps qu'elle.
    speak: () => {
      const cloze = card.clozes.find(c => !c.multi) || null, model = cloze ? cloze.text : card.examples[0] ? apos(card.examples[0]) : '';
      return sayable && model ? { answer: card.bare, model, cloze, self: true } : null;
    },
    // Phrase libre : l'étudiant compose une phrase avec le mot, puis la compare aux phrases modèles.
    sentence: () => {
      const models = card.examples.slice(0, 5).map(apos);
      return models.length ? { answer: card.bare, models, modelClozes: models.map(m => card.clozes.find(c => c.text === m) || null), self: true } : null;
    },
    'qcm-rev': () => choice(one(card), distractors(deck, card, lures, rnd, one, prefer, { form: true, mixed, sense: mean })),
    // Phrase à compléter par un choix. Quand la fiche fournit des mots pièges écrits pour son premier exemple, ce sont
    // eux les leurres : ils s'insèrent dans la phrase sans faute de grammaire. Sinon, les leurres sont des mots du paquet.
    'cloze-choice': () => {
      const fit = w => (first && !ARTICLE.test(first.answer) ? w.replace(ARTICLE, '') : w).trim();
      // Un mot piège écrit pour la fiche n'est gardé que s'il commence comme la réponse : sinon l'élision ou « a / an » le trahit.
      const own = first ? [...new Set((card.distractors || []).map(fit))].filter(w => w && w.toLowerCase() !== first.answer.toLowerCase() && w.trim().split(/\s+/).length === first.answer.trim().split(/\s+/).length && (!tightGap(first, deck.lang) || startOf(w, deck.lang) === startOf(first.answer, deck.lang))).slice(0, lures) : [];
      const c = own.length ? first : cl; if (!c) return null;
      const answer = lowerFirst(c.answer, card.word), mine = shuffle(own, rnd).map(text => ({ text }));
      const rest = distractors(deck, card, lures, rnd, d => (d.id === card.id ? answer : formFor(answer, d)), prefer, { form: true, strict: tightGap(c, deck.lang), gender: kindOf(card, deck.lang) === 'nom' && genderGap(c, deck.lang), number: kindOf(card, deck.lang) === 'nom', mixed, sense: mean }).filter(d => !own.includes(d.text));
      return choice(answer, [...mine, ...rest].slice(0, lures), { cloze: c });
    },
    'cloze-type': () => written(pick(card.clozes.filter(typable), rnd)),
    'situation-type': () => (card.situation ? written(first, { situation: card.situation }) : null),
    type: () => (discontinuous || isNumber(card.definition) ? null : (v => ({ answer: form ? form.text : card.word, accepted: v, hint: hint(v[0]), ...asked }))(variants(form ? form.text : card.word))),
    order: () => {
      for (const text of shuffle(card.examples.map(apos), rnd)) {
        const raw = chunks(text, L.chunks);
        if (!raw) continue;
        // Le mot de la fiche lui-même, en tête de phrase (« Horses live on farms. »), perd sa majuscule comme les autres.
        const all = lowerWords(deck), own = new Set(card.clozes.map(c => lowerFirst(c.answer, card.word).split(/\s+/)[0]).filter(w => w === w.toLowerCase()));
        const { parts, lead, tail } = neutral(raw, deck.lang, { has: w => all.has(w) || own.has(w) });
        let mixed = parts.map((t, k) => ({ k, text: t }));
        for (let i = 0; i < 6; i++) { mixed = shuffle(mixed, rnd); if (mixed.map(c => c.text).join(' ') !== parts.join(' ')) break; }
        return { answer: text, solution: parts, chunks: mixed, lead, tail };
      }
      return null;
    },
    situation: () => (card.situation && card.examples[0]
      ? (ds => (ds.length === 2 ? choice(card.examples[0], ds, { situation: card.situation }) : null))(distractors(deck, card, 2, rnd, d => d.examples[0], prefer, { mixed }))
      : null),
    number: () => (isNumber(card.definition) ? { answer: card.definition.trim(), accepted: [card.definition.trim()] } : null),
  };
  const alt = vary && (hashInt(card.id) + box + turn) % 2 === 0;     // vary : la session fait alterner les formes ; sinon l'échelle écrite seule
  for (const type of [force, ...ladder(deck, card, box, { audio, alt })]) {
    const a = type && make[type]?.();
    if (!a) continue;
    // gated : l'étudiant cherche d'abord la réponse de tête, les choix n'apparaissent qu'ensuite.
    const gated = !!a.options && type !== 'qcm' && type !== 'situation' && type !== 'listen' && !contrast && (gate || (box >= 2 && !force));
    return { type, cardId: card.id, gated, ...a };
  }
  // Aucune forme de l'échelle n'est possible en respectant la règle des catégories (fiche seule de sa catégorie) :
  // plutôt que de mêler les catégories, on demande d'écrire le mot (phrase à trou, sinon le mot d'après son sens).
  if (!mixed) for (const type of ['cloze-type', 'type']) { const a = make[type]?.(); if (a) return { type, cardId: card.id, gated: false, ...a }; }
  // Dernier recours, quand rien ne peut être choisi ni écrit (fiche seule de sa catégorie, sans phrase, mot en deux parties) :
  // un rappel de tête. L'étudiant retrouve le mot d'après son sens, le découvre, puis se juge. Aucune catégorie n'est mêlée
  // et aucune fiche ne reste sans exercice.
  return { type: 'recall', cardId: card.id, gated: false, answer: card.bare, self: true };
}

// Tableau d'association (mots et sens) et banque de mots : formes à plusieurs fiches, sans effet sur les boîtes.
function matchStep(deck, ids, rnd) {
  const pairs = ids.map(id => deck.byId[id]).map(c => ({ id: c.id, word: c.bare, meaning: gloss(c, deck.help) || meaning(c, deck.help) }));
  return { card: deck.byId[ids[0]], activity: { type: 'match', multi: true, left: shuffle(pairs, rnd), right: shuffle(pairs, rnd) } };
}
function bankStep(deck, ids, pool, rnd) {
  const items = ids.map(id => deck.byId[id]).map(c => { const cloze = c.clozes.find(x => !x.multi); return { id: c.id, cloze, answer: lowerFirst(cloze.answer, c.word) }; });
  const answers = items.map(i => i.answer), extra = [];
  const lead = deck.byId[ids[0]], near = shuffle(pool.filter(c => !ids.includes(c.id) && c.clozes.length), rnd).map((c, k) => ({ c, k, v: alike(deck, lead, c, lead.bare, c.bare) })).sort((x, y) => y.v - x.v || x.k - y.k).map(x => x.c);
  for (const c of near) {
    const s = lowerFirst(c.clozes[0].answer, c.word);
    if (!answers.includes(s) && !extra.includes(s)) extra.push(s);
    if (extra.length === 2) break;
  }
  return { card: deck.byId[ids[0]], activity: { type: 'bank', multi: true, items, bank: shuffle([...answers, ...extra], rnd) } };
}

// Nombre de nouveaux mots admis selon le nombre de révisions dues.
export const roomFor = (due, maxNew) => (due >= 20 ? 0 : due >= 10 ? Math.min(maxNew, 2) : maxNew);

export class Session {
  constructor(deck, progress, { minutes = 5, maxNew = 3, now = Date.now(), rnd = Math.random, force = false, audio = false } = {}) {
    Object.assign(this, { deck, progress, rnd, audio, startedAt: now, endAt: now + minutes * 60000 });
    this.stats = { answered: 0, ok: 0, fresh: 0, up: [], again: [], herd: [], streak: 0, best: 0 };
    this.served = 0; this.today = []; this.tamed = []; this.waiting = new Set();
    const due = deck.cards.filter(c => isDue(progress[c.id], now))
      .sort((a, b) => (progress[a.id].fsrs?.due ?? 0) - (progress[b.id].fsrs?.due ?? 0));
    const reviews = due.map(c => ({ id: c.id, kind: 'quiz' }));
    // Principe de Leitner : les révisions passent avant les nouveautés. Introduire trop de mots nouveaux quand les
    // révisions s'accumulent fait s'effondrer l'apprentissage (Reddy et al., 2016) ; les seuils (10 et 20) sont un choix pratique.
    // L'étudiant garde la main : « J'en veux quand même » (force) lève ce frein pour la session.
    const room = force ? maxNew : roomFor(due.length, maxNew);
    const fresh = pickNew(deck, progress, room);
    this.held = room < maxNew && pickNew(deck, progress, maxNew).length > fresh.length;
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
    if (!item && !this.recap && this.today.filter(id => !isNew(this.progress[id])).length >= 3) {
      // Comme tout exercice de groupe : une seule catégorie grammaticale, et jamais de fiche sans catégorie. Si les mots
      // du jour ne sont pas trois de la même catégorie, des mots déjà vus de cette catégorie complètent le tableau.
      this.recap = true; const day = this.today.filter(id => !isNew(this.progress[id])).map(id => this.deck.byId[id]).filter(c => c && kindOf(c) !== 'autre'), by = new Map();
      for (const c of day) by.set(kindOf(c), [...(by.get(kindOf(c)) || []), c]);
      const main = [...by.values()].sort((x, y) => y.length - x.length)[0] || [];
      const more = main.length && main.length < 3 ? shuffle(this.deck.cards.filter(c => !main.includes(c) && kindOf(c) === kindOf(main[0]) && this.progress[c.id] && !isNew(this.progress[c.id]) && !main.some(m => m.neighbours.includes(c.id) || c.neighbours.includes(m.id))), this.rnd).slice(0, 3 - main.length) : [];
      const ids = [...main, ...more].slice(0, 5).map(c => c.id);
      if (ids.length >= 3) item = { kind: 'match', ids };
    }
    if (!item) return null;
    this.served++;
    if (item.kind === 'match') return { item, ...matchStep(this.deck, item.ids, this.rnd) };
    const card = this.deck.byId[item.id];
    if (item.kind === 'intro') {
      this.progress[card.id] = { seen: true, box: 1, born: now };
      this.stats.fresh++;
      return { item, card, intro: true };
    }
    // Si l'étudiant a dit qu'il ne pouvait pas écouter, une forme d'écoute imposée (rattrapage) redevient une forme écrite.
    const force = !this.audio && ['listen', 'listen-type', 'speak'].includes(item.force) ? null : item.force;
    return { item, card, activity: buildActivity(this.deck, card, boxOf(this.progress[card.id]) || 1, this.rnd, { force, prefer: this.today, contrast: item.contrast, help: item.help, audio: this.audio, vary: true, turn: this.progress[card.id]?.fsrs?.reps || 0 }) };
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
    // Les mots associés ou proposés ensemble se ressemblent (nature, début, thème) : on ne peut pas trier par la grammaire.
    const g1 = cluster(deck, cs, 5, rnd), g2 = half < cs.length ? cluster(deck, cs.filter(c => !g1.includes(c)), 5, rnd) : [];
    for (const part of [g1, g2]) if (part.length >= 3) q.push({ kind: 'match', ids: part.map(c => c.id) });
    const gaps = cluster(deck, cards.filter(c => c.clozes.some(x => !x.multi)), 4, rnd);
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
    for (const [box, type] of [[1, 'qcm'], [1, 'cloze-choice'], [2, 'qcm-rev'], [2, 'listen'], [3, 'cloze-type'], [3, 'listen-type'], [4, 'order'], [4, 'speak'], [5, 'situation-type'], [5, 'type'], [5, 'sentence']]) {
      const fits = c => buildActivity(deck, c, box, rnd, { force: type })?.type === type;
      const some = deck.cards.slice(0, 200);      // sur un très gros paquet, les 200 premières fiches suffisent à trouver un exemple de chaque forme
      const card = some.find(c => !used.has(c.id) && fits(c)) || some.find(fits);       // petit paquet : une fiche peut servir deux fois
      if (card) { used.add(card.id); q.push({ kind: 'quiz', id: card.id, force: type, box }); }
    }
    const ids = cluster(deck, deck.cards, 5, rnd).map(c => c.id), gaps = cluster(deck, deck.cards.filter(c => c.clozes.some(x => !x.multi)), 4, rnd).map(c => c.id);
    if (ids.length >= 3) q.push({ kind: 'match', ids, box: 0 });
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
