// Éléfiches — ce que le niveau du CECRL règle dans l'application et dans les prompts.
// Les réglages d'exercice s'appuient sur les échelles « Maîtrise de l'orthographe », « Étendue du vocabulaire »
// et « Correction grammaticale » du Volume complémentaire du CECRL (2020). Les longueurs de phrase sont une
// traduction pratique de ces descripteurs : le CECRL ne donne aucun nombre de mots.
//
//   options : nombre de réponses proposées dans un choix.
//   chunks  : nombre maximal de morceaux d'une phrase à reconstruire.
//   hint    : aide à l'écriture. 'pattern' = première lettre et longueur ; 'first' = première lettre ; '' = aucune.
//   lenient : tolérance d'orthographe d'une réponse écrite.
//             2 = une lettre d'écart est acceptée et corrigée (A1 « peut recopier des mots familiers »,
//                 A2 « relative exactitude phonétique, mais pas forcément orthographique ») ;
//             1 = un accent oublié est accepté et signalé, une lettre d'écart donne droit à un second essai
//                 (B1 « suffisamment justes », B2 « relativement exactes ») ;
//             0 = orthographe exacte, accents compris ; un écart donne droit à un second essai (C1, C2).
export const SPEC = {
  A1: { options: 3, chunks: 4, hint: 'pattern', lenient: 2 },
  A2: { options: 3, chunks: 4, hint: 'first', lenient: 2 },
  B1: { options: 4, chunks: 6, hint: '', lenient: 1 },
  B2: { options: 4, chunks: 6, hint: '', lenient: 1 },
  C1: { options: 4, chunks: 8, hint: '', lenient: 0 },
  C2: { options: 4, chunks: 8, hint: '', lenient: 0 },
};
export const spec = deck => SPEC[deck.level] || SPEC.A2;

// Longueur maximale d'une définition (en mots) et image attendue pour chaque mot : contrôlés à l'import d'un paquet.
export const LIMITS = { A1: { def: 10, image: true }, A2: { def: 14, image: true }, B1: { def: 20 }, B2: { def: 28 }, C1: { def: 40 }, C2: { def: 60 } };

// Consignes de rédaction données à l'IA, niveau par niveau : définitions, exemples, mots pièges.
export const WRITING = {
  A1: { words: 'mots concrets et très fréquents, liés à des situations précises de la vie quotidienne',
    def: '4 à 8 mots, sur le modèle « C\'est un animal de la ferme. » ou « C\'est pour dormir. » (à transposer dans la langue du paquet), avec seulement les mots les plus fréquents de la langue (être, avoir, faire, aller, manger, grand, petit, une personne, un animal, une chose) ; jamais un mot plus difficile que le mot défini',
    ex: '4 à 7 mots, une seule proposition (sujet, verbe, complément)',
    traps: 'des mots très courants, de sens nettement différent, qu\'un débutant connaît déjà' },
  A2: { words: 'mots courants des besoins quotidiens (achats, logement, études, loisirs, déplacements)',
    def: '6 à 12 mots, une phrase simple, avec des mots plus fréquents que le mot défini',
    ex: '5 à 9 mots, au présent, au passé composé ou au futur proche, une seule proposition ou deux reliées par « et », « mais », « parce que »',
    traps: 'des mots courants du même domaine, de sens clairement différent' },
  B1: { words: 'vocabulaire des sujets familiers : famille, loisirs, travail, voyages, actualité',
    def: 'une phrase claire, avec des mots courants',
    ex: '7 à 12 mots, temps du passé et du futur, une subordonnée simple possible (quand, parce que, qui, que)',
    traps: 'des mots proches par le sens ou par la forme, que les apprenants confondent souvent avec le mot' },
  B2: { words: 'vocabulaire varié sur le domaine d\'études et les sujets généraux, y compris des mots abstraits',
    def: 'une définition précise, qui distingue le mot de ses voisins',
    ex: '9 à 15 mots, phrases complexes, registres variés',
    traps: 'des quasi-synonymes qui ne conviennent pas dans cette phrase, des mots d\'un autre registre, des faux amis' },
  C1: { words: 'vocabulaire moins courant, expressions idiomatiques, collocations, termes du domaine de spécialité',
    def: 'une définition précise qui indique la nuance ou la connotation',
    ex: '10 à 18 mots, tournures idiomatiques, dans un contexte qui rend la collocation naturelle',
    traps: 'des mots qui forment une collocation voisine mais fausse ici, des paronymes, des mots de connotation différente' },
  C2: { words: 'vocabulaire rare ou nuancé, expressions idiomatiques et familières, niveaux de connotation',
    def: 'une définition précise qui indique la nuance, le registre et la connotation',
    ex: 'phrases authentiques, de longueur libre, où le choix du mot tient à une nuance',
    traps: 'des mots qui ne diffèrent du bon que par une nuance de sens, de registre ou de collocation' },
};
