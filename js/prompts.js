// Éléfiches — prompts que l'enseignant copie dans une IA (ChatGPT, Gemini, Claude…) pour faire fabriquer un paquet.
// Ils sont écrits en français : les enseignants qui utilisent l'application sont francophones.
import { WRITING, LIMITS } from './levels.js';

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
  const head = `Tu es enseignant ${de}${target} langue étrangère à l'université et concepteur de tests de langue. Crée un paquet de ${n} fiches de vocabulaire pour l'application Éléfiches.

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
- "examples" : deux phrases en ${target}, tirées de la vie d'un étudiant. Format : ${W.ex}. Voir les règles des phrases ci-dessous. Dans chaque phrase, entoure de crochets le mot tel qu'il apparaît, sans son article : « Je paie mon [loyer] demain. », « Elle a [déménagé] hier. »
- "situation" : une phrase en ${sitLang}, à la deuxième personne, qui décrit le moment où l'on dirait la PREMIÈRE phrase d'exemple. Elle ne contient pas le mot. Elle ne peut convenir à aucune autre fiche du paquet.
- "distractors" : trois mots pièges pour la question « quel mot remplace les crochets de la première phrase d'exemple ? ». Voir les règles ci-dessous.
- "theme" : le sous-thème, en deux ou trois mots, en ${sitLang}.
- "register" : courant, familier ou soutenu${sitLang === 'français' ? '' : ' (écris-le en ' + target + ')'}.
- "family" : le même mot-clé pour deux fiches de sens très proche (elles ne seront pas apprises le même jour) ; sinon "".
- "ipa" : la transcription phonétique du mot seul, sans son article, entre barres obliques.`;
  const every = !!LIMITS[level]?.image;       // A1, A2 : une image pour chaque mot
  const natural = lang === 'en' ? ' En anglais : le présent continu pour une action en cours (« The sheep is eating. »), le présent simple pour une habitude ou une vérité générale, « the » pour un être ou un objet précis.' : lang === 'es' ? ' En espagnol : « estar » + gérondif pour une action en cours, l\'article défini pour un être ou un objet précis.' : '';
  const rules = `RÈGLES DES PHRASES D'EXEMPLE
1. Chaque phrase est celle qu'un locuteur natif dirait vraiment dans cette situation, avec le temps et le déterminant naturels.${natural} N'écris jamais une phrase artificielle pour respecter le format.
2. Chaque phrase est grammaticalement irréprochable : relis-la à voix haute.
3. La PREMIÈRE phrase contient un indice propre au mot : si l'on remplace le mot par un autre mot du paquet ou du même domaine, la phrase devient fausse ou bizarre. « The [sheep] gives us wool. » convient ; « The [sheep] is in the field. » ne convient pas, car n'importe quel animal irait.
4. Chaque phrase contient le mot (conjugué ou accordé si besoin) une seule fois, et n'admet qu'un seul ordre des mots.

RÈGLES DES MOTS PIÈGES ("distractors")
Ce sont des mots qui existent en ${target}, correctement orthographiés. Jamais de faute d'orthographe, jamais de mot inventé.
1. Chaque mot piège s'écrit exactement comme il apparaîtrait à la place des crochets de la première phrase d'exemple : sans article si l'article est hors des crochets, à la même forme conjuguée ou accordée, avec le même nombre de mots autant que possible. La phrase reste grammaticalement correcte : même nature, même genre, même nombre, même construction.
2. Avec le mot piège, la phrase ne correspond plus à la définition : il n'existe qu'une seule bonne réponse. Écarte tout synonyme et tout mot qui conviendrait aussi.
3. Le mot piège est plausible pour un apprenant de niveau ${level} : ${W.traps}.
4. Il n'est pas plus rare ni plus difficile que le mot de la fiche, et sa longueur est comparable.
5. Il n'est ni absurde ni drôle, et ne se devine pas par élimination.
6. Les trois mots pièges d'une fiche sont différents les uns des autres, et classés du plus trompeur au moins trompeur.

MÉTHODE
Travaille en deux temps, sans montrer ton brouillon. D'abord, rédige toutes les fiches. Ensuite, relis-les une à une comme un relecteur exigeant et corrige : le mot figure entre crochets dans ses deux exemples ; la définition ne contient pas le mot ; chaque phrase respecte les quatre règles des phrases (naturelle, correcte, premier exemple avec un indice propre au mot) et le format du niveau ${level} ; la définition est plus simple que le mot défini ;${every ? ' chaque fiche a son image ;' : ''} chaque mot piège respecte les six règles (remplace-le mentalement dans la phrase pour vérifier) ; chaque situation ne convient qu'à sa fiche.`;
  const json = `Règles du JSON : guillemets droits doubles pour les clés et les valeurs ; à l'intérieur d'un texte, n'utilise jamais de guillemet droit (écris « » ou une apostrophe) ; pas de commentaire ; pas de virgule après la dernière fiche.`;
  const drawable = `si le mot désigne un objet, un lieu, une personne ou une action que l'on reconnaît sur un dessin sans légende`;
  // Au niveau débutant, l'image porte le sens : chaque fiche en a une.
  const imgFile = every ? `le nom du fichier image de la fiche, par exemple "images/loyer.png" (voir IMAGES). Au niveau ${level}, CHAQUE fiche a une image : pour un mot que l'on ne peut pas montrer directement, dessine une petite scène qui le montre sans ambiguïté.`
    : `${drawable}, le nom de son fichier image, par exemple "images/loyer.png" (voir IMAGES). Sinon "". N'illustre pas les mots abstraits ou grammaticaux.`;
  const imgSheet = every ? `la case de son dessin : "P1-1", "P1-2"… jusqu'à "P1-${G.n}" (planche 1, cases 1 à ${G.n}), puis "P2-1"… Au niveau ${level}, CHAQUE fiche a une image : pour un mot que l'on ne peut pas montrer directement, prévois une petite scène qui le montre sans ambiguïté.`
    : `${drawable}, écris "P1-1", "P1-2"… jusqu'à "P1-${G.n}" (planche 1, cases 1 à ${G.n}), puis "P2-1"… Sinon "". N'illustre pas les mots abstraits ou grammaticaux.`;
  return {
    // Le chemin le plus simple : l'IA fabrique un seul fichier, avec les fiches et leurs images.
    file: `${head}
- "image" : ${imgFile}

${rules}

IMAGES
Pour chaque fiche qui a une image, crée un fichier PNG carré de 512 pixels : un seul dessin, simple et centré, sur un fond uni clair, sans texte, sans lettre et sans chiffre, dans le même style pour tout le paquet. Le dessin montre le sens du mot lui-même, pas un objet vaguement lié. Nomme le fichier d'après le mot, en minuscules, sans accent ni espace : images/salle-de-bains.png.

RÉPONSE ATTENDUE
Fabrique UN SEUL fichier ZIP, nommé d'après le thème et le niveau, qui contient :
- paquet.json : le paquet, en JSON valide, exactement sous cette forme :
${shape}
- le dossier images, avec les fichiers cités dans les fiches.
${json}
Écris toutes les fiches, même si elles sont nombreuses : travaille par lots si nécessaire, mais livre un seul fichier.
Donne-moi le lien de téléchargement du fichier. Dans la conversation, écris seulement : le nombre de fiches, le nombre d'images et la liste des mots sans image.
Les images font partie du travail demandé : ne livre pas le fichier sans elles. Si tu ne peux vraiment pas créer de fichier, dis-le en une phrase et donne à la place le paquet dans un seul bloc de code JSON, avec "image" vide.`,
    cards: `${head}
- "image" : ${imgSheet}

${rules}

RÉPONSE ATTENDUE
1. Le paquet, dans UN SEUL bloc de code, en JSON valide, une fiche par ligne, exactement sous cette forme :
${shape}
${json}
2. Sous le bloc, la liste des planches d'images : pour chaque planche, les cases 1 à ${G.n} dans l'ordre, avec pour chacune le mot et la description du dessin en une dizaine de mots (ce que l'on voit, sans texte).
N'ajoute rien d'autre : ni introduction, ni commentaire sur tes vérifications. Si ta réponse risque d'être coupée, arrête-toi à la fin d'une fiche, ferme le JSON, et propose de donner la suite dans un second bloc de même forme.`,
    sheet: `Dessine la planche 1 de la liste ci-dessus, en UNE SEULE image carrée.
Grille : ${G.cols} colonnes et ${G.rows} rangées, soit ${G.n} cases de même taille, alignées, séparées par de fines marges blanches. La case 1 est en haut à gauche ; on lit de gauche à droite, puis de haut en bas ; la case ${G.n} est en bas à droite.
Dans chaque case : un seul dessin, centré, qui ne touche pas les bords de sa case.
Style, identique pour toutes les cases : illustration plate, contours simples, couleurs douces, fond uni clair.
Interdits : texte, lettres, chiffres, numéros de case, légendes, cadres, logos.
Laisse blanches les cases qui n'ont pas de dessin.`,
    next: `Dessine maintenant la planche 2, avec exactement la même grille et le même style.`,
    // À coller dans la même conversation quand le paquet reçu contient des erreurs.
    review: `Relis le paquet que tu viens de produire, fiche par fiche, comme un correcteur ${de}${target} langue étrangère, puis corrige-le.
Pour chaque fiche, vérifie et corrige :
1. Chaque phrase d'exemple est celle qu'un locuteur natif dirait vraiment, avec le temps et le déterminant naturels.${natural}
2. Dans la première phrase d'exemple, aucun autre mot du paquet ne pourrait remplacer le mot entre crochets : ajoute un indice propre au mot si ce n'est pas le cas.
3. La définition respecte ce format : ${W.def}. Elle ne contient ni le mot ni un mot de sa famille.
4. Aucun des trois mots pièges ne conviendrait dans la première phrase.${every ? `
5. Chaque fiche a une image, qui montre le sens du mot sans ambiguïté.` : ''}
Donne d'abord la liste des fiches corrigées, avec ce que tu as changé, en une ligne par fiche. Livre ensuite de nouveau le paquet COMPLET, sous la même forme que la première fois (le même fichier, ou le même bloc de code JSON).`,
  };
}

