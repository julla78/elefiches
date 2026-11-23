// Éléfiches — prompts que l'enseignant copie dans une IA (ChatGPT, Gemini, Claude…) pour faire fabriquer un paquet.
// Ils sont écrits en français : les enseignants qui utilisent l'application sont francophones.
import { WRITING } from './levels.js';

const NAMES = { fr: 'français', en: 'anglais', es: 'espagnol' };
// Traductions demandées selon la langue apprise (règle fixée par Julie) : aucune pour le français,
// français pour l'anglais, français et anglais pour l'espagnol.
export const TRANSLATIONS = { fr: [], en: ['fr'], es: ['fr', 'en'] };
// Planches d'images : colonnes x rangées.
export const GRIDS = ['3x3', '4x4', '5x5', '6x6', '10x9'];
export const gridOf = g => { const [cols, rows] = String(g || '3x3').split('x').map(Number); return { cols: cols || 3, rows: rows || 3, n: (cols || 3) * (rows || 3) }; };

export function buildPrompts({ lang = 'fr', level = 'A2', topic = '', count = 20, words = '', grid = '3x3' }) {
  const target = NAMES[lang] || lang, tr = TRANSLATIONS[lang] || ['fr'], W = WRITING[level] || WRITING.A2, G = gridOf(grid);
  const de = /^[aeiouh]/.test(target) ? "d'" : 'de ';
  const list = words.trim().split(/\n+/).map(w => w.trim()).filter(Boolean);
  const n = list.length || count, sitLang = ['B2', 'C1', 'C2'].includes(level) ? target : 'français';
  const theme = topic.trim() || '(à préciser)', title = `${topic.trim() || 'Thème'} (${level})`;
  const trJson = tr.length ? '{' + tr.map(k => `"${k}":""`).join(',') + '}' : '{}';
  const shape = `{"elefiches":1,"name":"${title}","lang":"${lang}","level":"${level}","grid":"${grid}","cards":[\n{"word":"","definition":"","translations":${trJson},"pos":"","examples":["",""],"situation":"","distractors":["","",""],"theme":"","register":"","family":"","ipa":"","image":""}\n]}`;
  return {
    cards: `Tu es enseignant ${de}${target} langue étrangère à l'université et concepteur de tests de langue. Crée un paquet de ${n} fiches de vocabulaire pour l'application Éléfiches.

PUBLIC
Étudiants d'université, jeunes adultes, francophones ou vivant en France. Niveau ${level} du CECRL.

CONTENU
Thème : ${theme}.
${list.length ? `Mots imposés, dans cet ordre :\n${list.map(w => '- ' + w).join('\n')}` : `Choisis ${n} mots ou expressions utiles pour ce thème à ce niveau : ${W.words}. Mélange noms, verbes, adjectifs et expressions.`}

CHAQUE FICHE
- "word" : le mot ou l'expression en ${target}, à la forme du dictionnaire, avec son article indéfini si c'est un nom.
- "definition" : en ${target}. ${W.def[0].toUpperCase() + W.def.slice(1)}. Elle ne contient ni le mot ni un mot de sa famille.
- "translations" : ${tr.length ? 'la traduction en ' + tr.map(k => NAMES[k]).join(' et en ') + ', telle qu\'un dictionnaire la donnerait, avec l\'article si le mot en a un.' : 'laisse {} : ce paquet est tout en français.'}
- "pos" : la nature du mot, en français, parmi : nom, verbe, adjectif, adverbe, expression.
- "examples" : deux phrases en ${target}, naturelles, tirées de la vie d'un étudiant. Format : ${W.ex}. Chaque phrase contient le mot (conjugué ou accordé si besoin), une seule fois, et n'admet qu'un seul ordre des mots. Dans chaque phrase, entoure de crochets le mot tel qu'il apparaît, sans son article : « Je paie mon [loyer] demain. », « Elle a [déménagé] hier. »
- "situation" : une phrase en ${sitLang}, à la deuxième personne, qui décrit le moment où l'on dirait la PREMIÈRE phrase d'exemple. Elle ne contient pas le mot. Elle ne peut convenir à aucune autre fiche du paquet.
- "distractors" : trois mots pièges pour la question « quel mot remplace les crochets de la première phrase d'exemple ? ». Voir les règles ci-dessous.
- "theme" : le sous-thème, en deux ou trois mots, en ${sitLang}.
- "register" : courant, familier ou soutenu${sitLang === 'français' ? '' : ' (écris-le en ' + target + ')'}.
- "family" : le même mot-clé pour deux fiches de sens très proche (elles ne seront pas apprises le même jour) ; sinon "".
- "ipa" : la transcription phonétique du mot seul, sans son article, entre barres obliques.
- "image" : si le mot désigne un objet, un lieu, une personne ou une action que l'on reconnaît sur un dessin sans légende, écris "P1-1", "P1-2"… jusqu'à "P1-${G.n}" (planche 1, cases 1 à ${G.n}), puis "P2-1"… Sinon "". N'illustre pas les mots abstraits ou grammaticaux.

RÈGLES DES MOTS PIÈGES ("distractors")
Ce sont des mots qui existent en ${target}, correctement orthographiés. Jamais de faute d'orthographe, jamais de mot inventé.
1. Chaque mot piège s'écrit exactement comme il apparaîtrait à la place des crochets de la première phrase d'exemple : sans article si l'article est hors des crochets, à la même forme conjuguée ou accordée, avec le même nombre de mots autant que possible. La phrase reste grammaticalement correcte : même nature, même genre, même nombre, même construction.
2. Avec le mot piège, la phrase ne correspond plus à la définition : il n'existe qu'une seule bonne réponse. Écarte tout synonyme et tout mot qui conviendrait aussi.
3. Le mot piège est plausible pour un apprenant de niveau ${level} : ${W.traps}.
4. Il n'est pas plus rare ni plus difficile que le mot de la fiche, et sa longueur est comparable.
5. Il n'est ni absurde ni drôle, et ne se devine pas par élimination.
6. Les trois mots pièges d'une fiche sont différents les uns des autres, et classés du plus trompeur au moins trompeur.

MÉTHODE
Travaille en deux temps, sans montrer ton brouillon. D'abord, rédige toutes les fiches. Ensuite, relis-les une à une comme un relecteur exigeant et corrige : le mot figure entre crochets dans ses deux exemples ; la définition ne contient pas le mot ; les phrases respectent le format du niveau ${level} ; chaque mot piège respecte les six règles (remplace-le mentalement dans la phrase pour vérifier) ; chaque situation ne convient qu'à sa fiche.

RÉPONSE ATTENDUE
1. Le paquet, dans UN SEUL bloc de code, en JSON valide, une fiche par ligne, exactement sous cette forme :
${shape}
Règles du JSON : guillemets droits doubles pour les clés et les valeurs ; à l'intérieur d'un texte, n'utilise jamais de guillemet droit (écris « » ou une apostrophe) ; pas de commentaire ; pas de virgule après la dernière fiche.
2. Sous le bloc, la liste des planches d'images : pour chaque planche, les cases 1 à ${G.n} dans l'ordre, avec pour chacune le mot et la description du dessin en une dizaine de mots (ce que l'on voit, sans texte).
N'ajoute rien d'autre : ni introduction, ni commentaire sur tes vérifications. Si ta réponse risque d'être coupée, arrête-toi à la fin d'une fiche, ferme le JSON, et propose de donner la suite dans un second bloc de même forme.`,
    sheet: `Dessine la planche 1 de la liste ci-dessus, en UNE SEULE image carrée.
Grille : ${G.cols} colonnes et ${G.rows} rangées, soit ${G.n} cases de même taille, alignées, séparées par de fines marges blanches. La case 1 est en haut à gauche ; on lit de gauche à droite, puis de haut en bas ; la case ${G.n} est en bas à droite.
Dans chaque case : un seul dessin, centré, qui ne touche pas les bords de sa case.
Style, identique pour toutes les cases : illustration plate, contours simples, couleurs douces, fond uni clair.
Interdits : texte, lettres, chiffres, numéros de case, légendes, cadres, logos.
Laisse blanches les cases qui n'ont pas de dessin.`,
    next: `Dessine maintenant la planche 2, avec exactement la même grille et le même style.`,
    zip: `Range dans une archive ZIP le paquet (un fichier nommé paquet.json) et les planches (planche1.png, planche2.png…), puis donne-moi le lien de téléchargement.`,
  };
}

// Ce que chaque IA sait faire, pour guider l'enseignant (état connu en novembre 2026 ; ces produits changent vite).
export const AIS = ['chatgpt', 'gemini', 'claude', 'autre'];
