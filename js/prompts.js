// Éléfiches — prompts que l'enseignant copie dans une IA (ChatGPT, Gemini, Claude…) pour faire fabriquer un paquet.
// Ils sont écrits en français : les enseignants qui utilisent l'application sont francophones.
import { WRITING, LIMITS } from './levels.js';

const NAMES = { fr: 'français', en: 'anglais', es: 'espagnol' };
// Traductions demandées selon la langue apprise (règle fixée par la responsable du projet) : aucune pour le français,
// français pour l'anglais, français et anglais pour l'espagnol.
export const TRANSLATIONS = { fr: [], en: ['fr'], es: ['fr', 'en'] };
// Planches d'images : colonnes x rangées.
export const GRIDS = ['3x3', '4x4', '5x5', '6x6', '10x9'];
export const gridOf = g => { const [cols, rows] = String(g || '3x3').split('x').map(Number); return { cols: cols || 3, rows: rows || 3, n: (cols || 3) * (rows || 3) }; };

export function buildPrompts({ lang = 'fr', level = 'A2', topic = '', count = 20, words = '', grid = '3x3', examples = 4 }) {
  // Nombre de phrases d'exemple par fiche, choisi par l'enseignant : de une à cinq, quatre par défaut. C'est un nombre exact.
  const nEx = Math.min(5, Math.max(1, Math.round(+examples) || 4)), oneEx = nEx === 1, numEx = ['', 'une', 'deux', 'trois', 'quatre', 'cinq'][nEx];
  const exShape = Array.from({ length: nEx }, () => '""').join(',');
  const target = NAMES[lang] || lang, tr = TRANSLATIONS[lang] || ['fr'], W = WRITING[level] || WRITING.A2, G = gridOf(grid);
  const de = /^[aeiouh]/.test(target) ? "d'" : 'de ';
  const list = words.trim().split(/\n+/).map(w => w.trim()).filter(Boolean);
  const n = list.length || count, sitLang = ['B2', 'C1', 'C2'].includes(level) ? target : 'français';
  const theme = topic.trim() || '(à préciser)', title = `${topic.trim() || 'Thème'} (${level})`;
  const trJson = tr.length ? '{' + tr.map(k => `"${k}":""`).join(',') + '}' : '{}';
  const gendered = lang === 'fr' || lang === 'es';      // langues où le genre d'un nom compte dans les exercices
  const slotEx = lang === 'en' ? '« on » (on Monday), « in » (in May) et « at » (at noon)' : lang === 'es' ? '« el » (el lunes), « en » (en mayo) et « a » (a las dos)' : '« le » (le lundi), « en » (en mai), « au » (au printemps) et « à » (à midi)';
  const twinsEx = lang === 'en' ? 'hire et recruit, job et work' : lang === 'es' ? 'contratar et emplear, trabajo et empleo' : 'embaucher et recruter, boulot et travail';
  const defForm = lang === 'en' ? 'par exemple, tous les verbes définis par « to + verbe », tous les noms par un groupe nominal' : 'par exemple, tous les verbes définis par un infinitif, tous les noms par un groupe nominal';
  const shape = `{"elefiches":1,"name":"${title}","lang":"${lang}","level":"${level}","grid":"${grid}","cards":[\n{"word":"","definition":"","translations":${trJson},"pos":""${gendered ? ',"gender":""' : ''},"examples":[${exShape}],"situation":"","distractors":["","",""],"theme":"","register":"","family":"","ipa":"","image":"","doubt":""}\n]}`;
  const head = `Tu es enseignant ${de}${target} langue étrangère à l'université et concepteur de tests de langue. Crée un paquet de ${n} fiches de vocabulaire pour l'application Éléfiches.

PUBLIC
Étudiants d'université, jeunes adultes, francophones ou vivant en France. Niveau ${level} du CECRL.

CONTENU
Thème : ${theme}.
${list.length ? `Mots imposés, dans cet ordre :\n${list.map(w => '- ' + w).join('\n')}` : `Choisis ${n} mots ou expressions utiles pour ce thème à ce niveau : ${W.words}. Mélange noms, verbes, adjectifs et expressions.`}

CHAQUE FICHE
- "word" : le mot ou l'expression en ${target}, à la forme du dictionnaire, avec son article indéfini si c'est un nom.${gendered ? ` Un nom ou un adjectif qui change de forme au féminin s'écrit avec ses deux formes, masculin d'abord, séparées par une barre oblique entourée d'espaces : ${lang === 'es' ? '« un camarero / una camarera », « caro / cara »' : '« un serveur / une serveuse », « cher / chère »'}. L'application n'en demandera jamais qu'une à la fois, en disant laquelle. N'emploie cette barre pour rien d'autre : deux synonymes font deux fiches.` : ''}
- "definition" : en ${target}. ${W.def[0].toUpperCase() + W.def.slice(1)}. Elle ne contient ni le mot ni un mot de sa famille. Elle ne convient qu'à CE mot : aucune autre fiche du paquet ne pourrait porter la même définition. Pour deux mots proches (${twinsEx}), chaque définition dit ce qui distingue le mot de son voisin : qui fait l'action, dans quelle situation, avec quel registre. Toutes les définitions d'une même catégorie ont la même forme (${defForm}), pour qu'aucune ne se repère à sa tournure.
- "translations" : ${tr.length ? 'la traduction en ' + tr.map(k => NAMES[k]).join(' et en ') + ', telle qu\'un dictionnaire la donnerait, avec l\'article si le mot en a un.' : 'laisse {} : ce paquet est tout en français.'}
- "pos" : OBLIGATOIRE, jamais vide. La catégorie grammaticale du mot, écrite exactement ainsi : nom, verbe, adjectif, adverbe, préposition, déterminant, pronom, conjonction ou expression. Une locution verbale (« avoir du travail ») est un verbe, un nom précédé de son article est un nom ; « expression » est réservé aux formules figées qui ne sont rien d'autre. Des mots grammaticaux que l'étudiant doit choisir l'un contre l'autre parce qu'ils occupent la même place dans la phrase reçoivent la même catégorie : ${slotEx} sont tous rangés dans « préposition ». L'application ne devine jamais la catégorie et ne propose jamais ensemble deux mots de catégories différentes : une fiche sans "pos", ou presque seule de sa catégorie, n'aurait aucune question à choix. Compose le paquet pour que chaque catégorie présente compte au moins quatre fiches, ou retire-la.
${gendered ? `- "gender" : OBLIGATOIRE pour tout nom, jamais vide : "m", "f", ou "mf" si le nom a les deux genres sans changer de forme. Donne-le aussi, et surtout, quand l'article ne le montre pas (« l' », « les », « des ») : vérifie-le, ne le déduis pas de la terminaison. Pour les autres catégories, écris "".
` : ''}- "examples" : EXACTEMENT ${numEx.toUpperCase()} phrase${oneEx ? '' : 's'} en ${target} par fiche, ni plus ni moins, tirée${oneEx ? '' : 's'} de la vie d'un étudiant${oneEx ? '. Elle sert aussi de modèle : quand l\'étudiant écrit sa propre phrase, il la compare à celle-ci.' : ', qui montrent le mot sous des formes différentes. Elles servent aussi de modèles : quand l\'étudiant écrit sa propre phrase, il la compare à celles-ci.'} Format : ${W.ex}. Voir les règles des phrases ci-dessous. Dans chaque phrase, entoure de crochets le mot tel qu'il apparaît, sans son article : « Je paie mon [loyer] demain. », « Elle a [déménagé] hier. »
- "situation" : une phrase en ${sitLang}, à la deuxième personne, qui décrit le moment où l'on dirait la PREMIÈRE phrase d'exemple. Elle ne contient pas le mot. Elle ne peut convenir à aucune autre fiche du paquet.
- "distractors" : trois mots pièges pour la question « quel mot remplace les crochets de la première phrase d'exemple ? ». Voir les règles ci-dessous.
- "theme" : le sous-thème, en deux ou trois mots, en ${sitLang}.
- "register" : exactement l'un de ces sept mots, écrit ainsi, en français, quelle que soit la langue du paquet : soutenu, courant, familier, très familier, vulgaire, argotique, jargon. « argotique » : mot propre à un groupe ; « jargon » : terme technique d'un métier ou d'une spécialité. Dans le doute : courant.
- "family" : le même mot-clé pour deux fiches de sens très proche (elles ne seront pas apprises le même jour, et jamais opposées dans une question) ; sinon "". Deux mots que l'on pourrait employer l'un pour l'autre dans la première phrase d'exemple portent TOUJOURS la même "family".
- "ipa" : la transcription phonétique du mot seul, sans son article, entre barres obliques.
- "doubt" : "" quand tu es sûr de la fiche. Sinon, une phrase courte en français qui dit ton doute : deux mots presque synonymes que tu n'arrives pas à séparer, un genre ou une catégorie incertains, un mot qui a deux sens, une phrase dont tu n'es pas certain qu'elle se dise. L'application montrera ce doute à l'enseignant avant que les étudiants voient la fiche. Un doute signalé vaut toujours mieux qu'une fiche fausse livrée sans rien dire.`;
  const every = !!LIMITS[level]?.image;       // A1, A2 : une image pour chaque mot
  // Ce qu'un locuteur natif dit vraiment : le défaut le plus fréquent des paquets générés est la « phrase de manuel »,
  // correcte mot à mot mais que personne ne dit (« A rabbit eats carrots in the garden. »).
  const natural = lang === 'en' ? ` En anglais, trois façons naturelles de parler d'un être ou d'un objet : pour une scène ou une action en cours, « the » ou un possessif avec le présent continu (« The rabbit is eating a carrot. ») ; pour une vérité générale, le pluriel sans article (« Rabbits eat carrots. ») ; pour dire que quelque chose existe ou qu'on le possède, « There is a… », « I have a… », « We have a… ». N'écris JAMAIS « A/An + nom + verbe au présent simple » pour décrire une scène, ni le présent simple pour une action en cours. Phrases refusées et leur correction : « A rabbit eats carrots in the garden. » → « The rabbit is eating a carrot in the garden. » ; « A sheep lives on this farm. » → « There are sheep on this farm. » ; « A pig lives on my uncle's farm. » → « My uncle has a pig on his farm. » ; « The dog plays with my friends. » → « The dog is playing with my friends. » ; « A sheep eats next to us. » → « The sheep is eating next to us. ». Les verbes d'état (like, love, want, have, know, need) restent au présent simple.`
    : lang === 'es' ? ` En espagnol : « estar » + gérondif pour une action en cours (« El conejo está comiendo una zanahoria. »), le pluriel avec l'article défini pour une vérité générale (« Los conejos comen zanahorias. »), « hay » ou « tengo » pour dire que quelque chose existe ou qu'on le possède. N'écris pas « Un + nom + verbe au présent » pour décrire une scène (« Un conejo come zanahorias en el jardín. ») : c'est une phrase de manuel.`
      : ` En français : « le, la, mon, ma » pour un être ou un objet précis (« Le lapin mange une carotte. »), le pluriel avec « les » pour une vérité générale (« Les lapins mangent des carottes. »), « il y a » ou « j'ai » pour dire que quelque chose existe ou qu'on le possède. Évite « Un + nom + verbe » pour décrire une scène (« Un lapin mange des carottes dans le jardin. ») : c'est une phrase de manuel.`;
  const articles = lang === 'en' ? 'a ou an, puis the ou un possessif (my, our), puis le pluriel sans article (« [Cows] give milk. »)' : lang === 'es' ? 'un ou una, puis el, la ou un possessif (mi, nuestro), puis le pluriel (los, las, unos, unas)' : 'un ou une, puis le, la, l\' ou un possessif (mon, notre), puis le pluriel (les, des)';
  const mass = lang === 'en' ? 'milk, water' : lang === 'es' ? 'leche, agua' : 'du lait, de l\'eau';
  const swap = lang === 'en' ? '« The [dog] is playing with my friends. » accepte aussi cat ou horse), réécris-la avec un indice que seul ce mot permet (« The [dog] is barking at the postman. »'
    : lang === 'es' ? '« El [perro] está jugando con mis amigos. » accepte aussi gato ou caballo), réécris-la avec un indice que seul ce mot permet (« El [perro] está ladrando al cartero. »'
      : '« Le [chien] joue avec mes amis. » accepte aussi chat ou cheval), réécris-la avec un indice que seul ce mot permet (« Le [chien] aboie quand le facteur arrive. »';
  const startCue = lang === 'en' ? 'le choix entre « a » et « an »' : lang === 'es' ? 'l\'article (« el », « la », « un », « una »)' : 'l\'article ou l\'élision (« l\' », « d\' », « j\' », « qu\' »)';
  // Orthographe : l'appli exige la forme exacte dans les réponses écrites (accents, cédille, « ñ », « œ »). Une fiche mal
  // accentuée ferait donc apprendre, puis exiger, une forme fausse. En anglais, l'appli accepte les deux graphies d'un emprunt.
  const spelling = lang === 'en' ? `Écris chaque mot avec l'orthographe du dictionnaire. Pour un mot emprunté qui a deux graphies (« café » et « cafe », « naïve » et « naive »), choisis-en une seule, celle que le dictionnaire donne en premier, et garde-la dans toute la fiche : l'application accepte les deux de la part de l'étudiant.`
    : lang === 'es' ? `L'application exige de l'étudiant la forme exacte du mot : un accent oublié dans une fiche lui ferait apprendre, puis exiger, une forme fausse. Écris donc chaque mot, chaque phrase et chaque mot piège avec ses accents écrits (á, é, í, ó, ú), le tréma (« pingüino ») et la lettre « ñ », jamais « n » à sa place. Une question ou une exclamation s'ouvre par « ¿ » ou « ¡ » (« ¿Qué tal? », « ¡Hola! »). Vérifie un par un les mots que seul l'accent distingue (« sí » et « si », « qué » et « que », « él » et « el », « tú » et « tu »).`
      : `L'application exige de l'étudiant la forme exacte du mot : un accent oublié dans une fiche lui ferait apprendre, puis exiger, une forme fausse. Écris donc chaque mot, chaque phrase et chaque mot piège avec tous ses accents (é, è, ê, à, ù…), la cédille (ç), le tréma (ë, ï) et la ligature « œ » (« sœur », « cœur », « œuf », jamais « soeur »). Une majuscule garde son accent (« À bientôt », « État »). Vérifie un par un les mots que seul l'accent distingue (« a » et « à », « ou » et « où », « sur » et « sûr »).`;
  const rules = `RÈGLES DES PHRASES D'EXEMPLE
1. Chaque phrase est celle qu'un locuteur natif dirait vraiment dans cette situation, avec le temps et le déterminant naturels.${natural} N'écris jamais une phrase artificielle pour respecter le format.
2. Chaque phrase est grammaticalement irréprochable : relis-la à voix haute.
3. La PREMIÈRE phrase contient un indice propre au mot : si l'on remplace le mot par un autre mot du paquet ou du même domaine, la phrase devient fausse ou bizarre. « The [sheep] gives us wool. » convient ; « The [sheep] is in the field. » ne convient pas, car n'importe quel animal irait.
4. Chaque phrase contient le mot (conjugué ou accordé si besoin) une seule fois, et n'admet qu'un seul ordre des mots.
${oneEx ? `5. La phrase montre le mot dans une construction que l'étudiant peut réemployer telle quelle dans sa propre phrase.` : `5. Les ${numEx} phrases font varier la forme du mot et ce qui l'entoure, pour que l'étudiant le reconnaisse partout. Pour un nom : le singulier et le pluriel, et des déterminants différents : ${articles}. Pour un nom que l'on ne compte pas (${mass}), ni article indéfini ni pluriel : fais varier les déterminants possibles. Pour un verbe : des sujets différents, une phrase négative ou une question, et un autre temps si le niveau ${level} le permet. Pour un adjectif : deux noms différents, et l'accord si la langue le marque. Chaque phrase parle d'une situation différente, et ${nEx > 2 ? 'au moins deux montrent' : 'elles montrent'} une construction que l'étudiant peut réemployer telle quelle dans sa propre phrase : ne répète pas la même phrase en changeant un mot.`}
6. La variété ne passe jamais avant le naturel : si une forme donne une phrase que personne ne dirait, choisis-en une autre.

RÈGLES DES MOTS PIÈGES ("distractors")
Ce sont des mots qui existent en ${target}, correctement orthographiés. Jamais de faute d'orthographe, jamais de mot inventé.
1. Même forme. Chaque mot piège s'écrit exactement comme il apparaîtrait à la place des crochets de la première phrase d'exemple : sans article si l'article est hors des crochets, à la même forme conjuguée ou accordée (un infinitif face à un infinitif, un participe face à un participe, un pluriel face à un pluriel), et avec le même nombre de mots que lui : les propositions doivent être équilibrées, jamais un mot seul à côté de groupes de mots, jamais un groupe plus long que les autres. Dans la PREMIÈRE phrase d'exemple, emploie de préférence le mot à sa forme de base (infinitif, singulier) : c'est elle qui sert aux questions à choix.
2. Même catégorie grammaticale${gendered ? ', même genre (vérifie le genre de chaque mot piège, y compris quand il commence par une voyelle)' : ''}, même nombre, même construction que le mot de la fiche : un nom face à des noms, un verbe face à des verbes. La phrase reste grammaticalement correcte avec chacun d'eux.
3. Même début. Si le mot de la fiche commence par une voyelle${lang === 'en' ? '' : ' ou un h muet'}, les trois mots pièges aussi ; s'il commence par une consonne, eux aussi. Ainsi ${startCue} ne trahit jamais la réponse. Quand le thème le permet, choisis des mots qui commencent par la même lettre.
4. Même thème. Les mots pièges appartiennent au même thème que le mot de la fiche : pour un animal de la ferme, d'autres animaux de la ferme ; pour un mot du travail, d'autres mots du travail. L'étudiant ne doit pouvoir écarter aucun mot piège par la grammaire, par l'orthographe ou par le thème : il ne lui reste que le sens.
5. Une seule bonne réponse. Les mots pièges sont proches, mais l'indice propre au mot, dans la première phrase, les exclut : avec chacun d'eux, la phrase devient fausse ou ne correspond plus à la définition. Écarte tout mot qui conviendrait aussi. Niveau ${level} : ${W.traps}.
6. Le mot piège n'est pas plus rare ni plus difficile que le mot de la fiche, et sa longueur est comparable. Il n'est ni absurde ni drôle.
7. Les trois mots pièges d'une fiche sont différents les uns des autres, et classés du plus trompeur au moins trompeur.

ORTHOGRAPHE EXACTE
${spelling}

RÈGLES ÉLIMINATOIRES
Une fiche qui enfreint une seule de ces règles ne doit pas être livrée : corrige-la d'abord.
A. "pos" est rempli${gendered ? ', et "gender" aussi pour chaque nom' : ''}.
B. La définition, lue seule, ne désigne qu'un mot du paquet.
C. Dans la PREMIÈRE phrase d'exemple, aucun autre mot du paquet ni aucun mot piège ne peut remplacer le mot entre crochets : une seule bonne réponse.
D. Chaque mot piège a la même catégorie${gendered ? ', le même genre' : ''}, le même nombre, le même nombre de mots et le même début (voyelle ou consonne) que le mot entre crochets : rien ne s'élimine par la grammaire, l'orthographe, la majuscule ou la longueur.
E. Chaque phrase est celle qu'une personne dirait vraiment.
F. Tout doute est écrit dans "doubt".
G. Chaque mot, chaque phrase et chaque mot piège est écrit avec son orthographe exacte${lang === 'en' ? '' : ', accents et signes compris'} (voir ORTHOGRAPHE EXACTE).

MÉTHODE
Travaille par lots de dix fiches au plus. Pour chaque lot : rédige les fiches, puis fais les contrôles ci-dessous sur chacune, corrige, et seulement alors passe au lot suivant. Ne saute aucun contrôle parce que le paquet est long : mieux vaut y passer plus de temps qu'abréger.
Contrôles, fiche par fiche :
1. Catégorie${gendered ? ' et genre' : ''} : "pos" rempli${gendered ? ', "gender" rempli pour un nom' : ''} ; aucune catégorie ne compte moins de quatre fiches.
2. Définition : lis-la seule, sans le mot, et demande-toi quel mot du paquet elle désigne ; si deux mots sont possibles, réécris-la. Elle ne contient pas le mot et elle est plus simple que lui.
3. Substitution : dans la PREMIÈRE phrase, remplace le mot entre crochets par chacun des autres mots du paquet ; si la phrase reste possible avec l'un d'eux (${swap}).
4. Mots pièges : place chacun dans la phrase à la place des crochets. La phrase doit rester grammaticalement correcte (règle D) et devenir fausse pour le sens (règle C). Demande-toi ensuite si un étudiant pourrait écarter ce mot sans connaître son sens ; si oui, change-le.
5. Naturel : relis chaque phrase en te demandant « est-ce qu'une personne dirait cela, telle quelle, dans la vie ? » ; si elle ressemble à une phrase de manuel, réécris-la. Chaque fiche a exactement ${numEx} phrase${oneEx ? '' : 's'} d'exemple : vérifie-le fiche par fiche. Le mot figure entre crochets dans ${oneEx ? 'son exemple' : 'ses ' + numEx + ' exemples, sous des formes variées'}, au format du niveau ${level}.${every ? `
5 bis. Orthographe : relis le mot, ses phrases et ses mots pièges lettre par lettre${lang === 'en' ? ' ; une seule graphie par mot dans toute la fiche' : lang === 'es' ? ' : accents écrits, « ñ », « ü », « ¿ » et « ¡ »' : ' : accents, cédille, tréma, « œ »'} (règle G).
6. Image : chaque fiche a son image.` : ''}

RAPPORT DE CONTRÔLE
Avant le paquet, écris ce rapport : une ligne par fiche, qui prouve que les contrôles ont été faits. Un simple « oui » ne suffit pas : nomme les mots que tu as essayés.
Forme d'une ligne : numéro. mot | catégorie${gendered ? ' et genre' : ''} | mot du paquet le plus proche, essayé dans la phrase 1, et ce qui l'exclut | les trois mots pièges, et ce qui exclut chacun | doute, ou « aucun ».
Si, en écrivant une ligne, tu vois qu'une règle éliminatoire n'est pas respectée, corrige la fiche puis écris la ligne de la fiche corrigée.`;
  // Étape 1 : l'IA propose la liste des mots et s'arrête. L'enseignant valide avant qu'une seule fiche soit rédigée :
  // c'est là que se règlent les catégories, les genres et les quasi-synonymes, quand corriger ne coûte encore rien.
  const steps = `DÉROULEMENT EN DEUX ÉTAPES
ÉTAPE 1, maintenant. Ne rédige encore aucune fiche. Réponds seulement par un tableau de ${n} lignes : mot | catégorie${gendered ? ' | genre' : ''} | famille (mots de sens très proche) | doute.
Sous le tableau, écris la liste des DOUTES en clair : paires de mots presque synonymes (${twinsEx}) avec ce qui les distingue selon toi, mots à deux sens, ${gendered ? 'genres ou ' : ''}catégories dont tu n'es pas sûr, catégories qui comptent moins de quatre mots. S'il n'y en a aucun, écris « Aucun doute ».
Puis ARRÊTE-TOI et attends ma réponse. Ne passe pas à l'étape 2 sans mon accord, même si tout te semble clair.
ÉTAPE 2, après mon accord seulement : applique mes corrections, puis rédige le paquet en suivant tout ce qui suit.`;
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

${steps}

${rules}

IMAGES
Pour chaque fiche qui a une image, crée un fichier PNG carré de 512 pixels : un seul dessin, simple et centré, sur un fond uni clair, sans texte, sans lettre et sans chiffre, dans le même style pour tout le paquet. Le dessin montre le sens du mot lui-même, pas un objet vaguement lié. Nomme le fichier d'après le mot, en minuscules, sans accent ni espace : images/salle-de-bains.png.

RÉPONSE ATTENDUE
Fabrique UN SEUL fichier ZIP, nommé d'après le thème et le niveau, qui contient :
- paquet.json : le paquet, en JSON valide, exactement sous cette forme :
${shape}
- le dossier images, avec les fichiers cités dans les fiches.
Cette réponse est celle de l'ÉTAPE 2.
${json}
Écris toutes les fiches, même si elles sont nombreuses : travaille par lots si nécessaire, mais livre un seul fichier.
Dans la conversation, écris d'abord le RAPPORT DE CONTRÔLE, puis donne le lien de téléchargement du fichier, puis le nombre de fiches, le nombre d'images et la liste des mots sans image.
Les images font partie du travail demandé : ne livre pas le fichier sans elles. Si tu ne peux vraiment pas créer de fichier, dis-le en une phrase et donne à la place le paquet dans un seul bloc de code JSON, avec "image" vide.`,
    cards: `${head}
- "image" : ${imgSheet}

${steps}

${rules}

RÉPONSE ATTENDUE (ÉTAPE 2)
1. Le RAPPORT DE CONTRÔLE.
2. Le paquet, dans UN SEUL bloc de code, en JSON valide, une fiche par ligne, exactement sous cette forme :
${shape}
${json}
3. Sous le bloc, la liste des planches d'images : pour chaque planche, les cases 1 à ${G.n} dans l'ordre, avec pour chacune le mot et la description du dessin en une dizaine de mots (ce que l'on voit, sans texte).
N'ajoute rien d'autre. Si ta réponse risque d'être coupée, arrête-toi à la fin d'une fiche, ferme le JSON, et propose de donner la suite dans un second bloc de même forme.`,
    sheet: `Dessine la planche 1 de la liste ci-dessus, en UNE SEULE image carrée.
Grille : ${G.cols} colonnes et ${G.rows} rangées, soit ${G.n} cases de même taille, alignées, séparées par de fines marges blanches. La case 1 est en haut à gauche ; on lit de gauche à droite, puis de haut en bas ; la case ${G.n} est en bas à droite.
Dans chaque case : un seul dessin, centré, qui ne touche pas les bords de sa case.
Style, identique pour toutes les cases : illustration plate, contours simples, couleurs douces, fond uni clair.
Interdits : texte, lettres, chiffres, numéros de case, légendes, cadres, logos.
Laisse blanches les cases qui n'ont pas de dessin.`,
    next: `Dessine maintenant la planche 2, avec exactement la même grille et le même style.`,
    // À coller quand le tableau de l'étape 1 convient (après y avoir ajouté ses corrections, s'il y en a).
    go: `Mes corrections sur le tableau : (écris-les ici, ou « aucune »).
Pour chaque doute que tu as signalé et que je n'ai pas tranché, garde-le dans le champ "doubt" de la fiche.
Passe maintenant à l'ÉTAPE 2. Rappel des règles éliminatoires : "pos" rempli${gendered ? ', "gender" rempli pour chaque nom' : ''} ; une définition qui ne désigne qu'un mot ; une seule bonne réponse dans la première phrase ; des mots pièges de même catégorie${gendered ? ', de même genre' : ''}, de même nombre de mots et de même début que la réponse ; des phrases que l'on dit vraiment ; l'orthographe exacte de chaque mot${lang === 'en' ? '' : ', accents et signes compris'}. Travaille par lots de dix fiches, écris le RAPPORT DE CONTRÔLE avant le paquet, et ne saute aucun contrôle.`,
    // À coller dans la même conversation quand le paquet reçu contient des erreurs.
    review: `Relis le paquet que tu viens de produire, fiche par fiche, comme un correcteur ${de}${target} langue étrangère, puis corrige-le.
Pour chaque fiche, vérifie et corrige :
1. Chaque phrase d'exemple est celle qu'un locuteur natif dirait vraiment, avec le temps et le déterminant naturels.${natural}
2. Dans la première phrase d'exemple, aucun autre mot du paquet ne pourrait remplacer le mot entre crochets : essaie chaque autre mot du paquet à sa place, et ajoute un indice propre au mot si l'un d'eux convient.
2 bis. Chaque fiche a exactement ${numEx} phrase${oneEx ? '' : 's'} d'exemple${oneEx ? '' : `, qui montrent le mot sous des formes différentes (singulier et pluriel, déterminants différents : ${articles} ; pour un verbe, des sujets différents et une phrase négative ou une question)`}. Complète les fiches qui en ont moins et raccourcis celles qui en ont plus, sans jamais sacrifier le naturel.
3. La définition respecte ce format : ${W.def}. Elle ne contient ni le mot ni un mot de sa famille. Lue seule, elle ne désigne qu'un mot du paquet : si elle convient aussi à un autre (${twinsEx}), réécris-la pour dire ce qui les distingue, et donne aux deux fiches la même "family".
3 bis. Chaque fiche a son "pos" (nom, verbe, adjectif, adverbe, préposition, déterminant, pronom, conjonction ou expression), et chaque catégorie présente compte au moins quatre fiches. Des mots grammaticaux que l'on choisit l'un contre l'autre (${slotEx}) ont la même catégorie.${gendered ? `
3 ter. Chaque nom a son "gender" ("m", "f" ou "mf"), vérifié, y compris quand l'article ne le montre pas (« l' », « les », « des »).` : ''}
4. Aucun des trois mots pièges ne conviendrait dans la première phrase. Chacun est de la même catégorie grammaticale${gendered ? ', du même genre' : ''} et du même thème que le mot, compte le même nombre de mots que lui et commence comme lui (voyelle ou consonne) : un étudiant ne doit pouvoir en écarter aucun par la grammaire, par l'orthographe ou par la longueur.
4 bis. Tout doute qui reste (quasi-synonymes, genre, sens double) est écrit dans le champ "doubt" de la fiche, en français.
4 ter. ${spelling}${every ? `
5. Chaque fiche a une image, qui montre le sens du mot sans ambiguïté.` : ''}
Donne d'abord la liste des fiches corrigées, avec ce que tu as changé, en une ligne par fiche, et pour chacune le mot que tu as essayé à la place du mot entre crochets. Livre ensuite de nouveau le paquet COMPLET, sous la même forme que la première fois (le même fichier, ou le même bloc de code JSON).`,
  };
}

