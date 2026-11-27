// Éléfiches — typographie française des textes de l'interface.
// Aucune dépendance : ce module est testé seul dans tests/engine.test.mjs.
//
// En français, « : », « ; », « ! », « ? » et les guillemets demandent une espace insécable : sans elle, le signe peut se retrouver
// seul au début d'une ligne. La police de l'appli (Nunito) n'a pas d'espace fine insécable (U+202F) : on emploie donc partout
// l'espace insécable simple (U+00A0), pour ne pas dépendre de la police de secours de chaque appareil.
// Un nombre reste aussi lié à son unité (« 15 fiches », « 5 min ») : il ne finit jamais seul au bout d'une ligne.
//
// Cette passe ne sert qu'aux textes de l'interface. Elle n'est jamais appliquée à une fiche ni à une réponse : la comparaison des
// réponses (match.js) ramène de toute façon toute suite d'espaces, insécables comprises, à une espace simple.
const NB = '\u00a0';
const UNITS = 'mots?|jours?|j|fiches?|min|minutes?|séances?|fois|phrases?|essais?|heures?|secondes?|paquets?|éléphants?|conseils?|erreurs?|lettres?|questions?|images?|exercices?|exemples?|réponses?|nouveaux?|%';
const UNIT = new RegExp(`(\\d|\\{\\d\\}) (?=(?:${UNITS})(?![\\p{L}]))`, 'gu');
export function typoFr(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/[ \u202f]([:;!?»])/g, NB + '$1').replace(/«[ \u202f]/g, '«' + NB).replace(UNIT, '$1' + NB);
}
// Applique la passe à tout un dictionnaire de textes (chaînes, listes, objets), sans le modifier.
export const typoDeep = v => (typeof v === 'string' ? typoFr(v) : Array.isArray(v) ? v.map(typoDeep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typoDeep(x)])) : v);
// Ce qui resterait fautif dans un texte : sert au test qui interdit le retour d'une espace ordinaire.
export const typoFaults = s => (typeof s === 'string' ? s.match(/[ \u202f][:;!?»]|«[ \u202f]/g) || [] : []);
