# Éléfiches

Application web pour mémoriser le vocabulaire d'une langue : répétition espacée, activités variées, et un troupeau d'éléphants qui grandit avec la mémoire.

- Aucun compte, aucun serveur : la progression reste dans le navigateur.
- Paquets de fiches importés depuis un fichier CSV ou créés dans l'espace enseignant.
- Interface en français, anglais et espagnol.

## État

Version de travail, en cours de construction. Elle n'a pas encore été testée sur téléphone.

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
