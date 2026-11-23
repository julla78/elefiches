# Éléfiches

Application web pour mémoriser le vocabulaire d'une langue : répétition espacée, activités variées, et un troupeau d'éléphants qui grandit avec la mémoire.

- Aucun compte, aucun serveur : la progression reste dans le navigateur.
- Les exercices suivent la solidité du souvenir : choisir le sens, compléter une phrase, écrire le mot, reconstruire une phrase, retrouver le mot en situation.
- Chaque mot est lu à voix haute dans la langue apprise, par la voix de synthèse de l'appareil ou par un fichier son joint à la fiche.
- Un paquet de fiches est un seul fichier, fabriqué par une IA à partir d'un prompt fourni par l'espace enseignant : archive `.zip` (fiches et images), paquet Anki `.apkg`, `.json` ou `.csv`.
- Un paquet rangé dans le dossier `paquets/` s'ouvre par un lien : `…/?paquet=nom-du-fichier`.
- Interface en français, anglais et espagnol ; niveaux du CECRL de A1 à C2.

## État

Version 9, en cours d'essai. Elle n'a pas encore été essayée avec des étudiants, ni sur tous les téléphones.

## Essayer en local

L'application est faite de fichiers statiques, sans étape de compilation. Elle doit être servie par un serveur web, car un navigateur refuse de charger ses modules depuis un simple double-clic :

```
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000`.

## Tests

```
node tests/engine.test.mjs
python3 tests/browser_test.py http://localhost:8000/index.html chemin/vers/un.csv dossier-de-captures
```

## Droits

Voir `LICENCE.md`.
