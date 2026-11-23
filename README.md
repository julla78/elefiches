# Éléfiches

Application web pour mémoriser le vocabulaire d'une langue : répétition espacée, activités variées, et un troupeau d'éléphants qui grandit avec la mémoire.

- Aucun compte, aucun serveur : la progression reste dans le navigateur, et se sauvegarde dans un fichier.
- Deux adresses : `index.html` pour les étudiants, `enseignant.html` pour créer, importer et modifier les paquets.
- Les exercices suivent la solidité du souvenir : choisir le sens (parmi des images aux niveaux A1 et A2), reconnaître le mot à l'oreille, compléter une phrase, écrire le mot, le dire à voix haute et répéter une phrase avec la voix, reconstruire une phrase, composer sa propre phrase.
- Chaque mot est lu à voix haute dans la langue apprise, par la voix de synthèse de l'appareil ou par un fichier son joint à la fiche.
- Un paquet de fiches est un seul fichier, fabriqué par une IA à partir d'un prompt fourni par l'espace enseignant : archive `.zip` (fiches et images), paquet Anki `.apkg`, `.json` ou `.csv`. L'application contrôle ce qu'une machine peut vérifier (images, longueur des définitions, exemples).
- Un paquet rangé dans le dossier `paquets/` s'ouvre par un lien : `…/?paquet=nom-du-fichier`.
- Rappels par l'agenda du téléphone (fichier `.ics`), course de rapidité sur les mots connus, défi d'étape, match amical de fin de paquet.
- Interface en français, anglais et espagnol ; niveaux du CECRL de A1 à C2.

## État

Version 10, en cours d'essai. Elle n'a pas encore été essayée avec des étudiants, ni sur tous les téléphones.

## Données personnelles

L'application ne recueille aucune donnée : ni compte, ni cookie, ni mesure d'audience. Paquets, progression et réglages restent dans le navigateur de l'utilisateur, qui peut les emporter dans un fichier ou tout effacer (page « Confidentialité et données »). L'hébergeur des pages, lui, reçoit l'adresse IP des visiteurs, comme tout hébergeur.

## Sécurité

Les pages n'exécutent que leurs propres scripts et ne contactent que leur propre adresse (politique de sécurité du contenu). Tout texte venu d'un paquet est affiché comme du texte, jamais comme du code. Les archives et les bases importées sont lues avec des plafonds de taille.

## Essayer en local

L'application est faite de fichiers statiques, sans étape de compilation. Elle doit être servie par un serveur web, car un navigateur refuse de charger ses modules depuis un simple double-clic :

```
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000`.

## Tests

```
node tests/engine.test.mjs
python3 tests/browser_test.py "http://localhost:8000/enseignant.html#accueil" chemin/vers/un.csv dossier-de-captures
```

## Droits

Voir `LICENCE.md`.
