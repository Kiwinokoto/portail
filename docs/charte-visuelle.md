# Charte visuelle LGC — couleurs sémantiques

Cette charte est partagée avec Maths LGC afin que le portail, les interfaces professeur et les activités élèves utilisent le même langage visuel.

## Palette d'identité

- **Violet / indigo** : identité principale, navigation, CTA, sélection et progression courante.
- **Bleu / rose** : accents visuels neutres, différenciation de cartes, pictogrammes et graphiques.

## Couleurs sémantiques réservées

| Couleur | Sens | Exemples |
| --- | --- | --- |
| Vert | correct, réussi, validé, terminé | bonne réponse, activité terminée |
| Orange | à reprendre, erreur pédagogique, attention | mauvaise réponse, domaine à travailler, information nécessitant une action |
| Rouge | important, objectif fort, à retenir | règle essentielle ; également erreur système/action destructive si nécessaire |

## Principes d'usage

- Vert et orange ne servent jamais de décoration.
- Une mauvaise réponse pédagogique est orange, pas rouge.
- Les surfaces professeur restent principalement neutres + violet/indigo.
- Une couleur sémantique est toujours accompagnée d'un texte, d'une icône ou d'un symbole.
- Le contraste doit rester lisible sur desktop et mobile.

## Tokens CSS

Dans `assets/styles.css` :

- `--accent*` : violet/indigo ;
- `--blue*`, `--rose*` : accents décoratifs neutres ;
- `--success*` : correct/réussi ;
- `--attention*` : à reprendre/attention ;
- `--important*` : important/à retenir ;
- `--danger*` : système/destructif.
