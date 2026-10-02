# PSR Mathématiques — migration native vers Portail

## Décision

Depuis le 2 octobre 2026, `Kiwinokoto/portail` est le runtime canonique des nouveaux cours et séances en cours de construction/test. `Kiwinokoto/maths_lgc` reste en production pour les cohortes et liens historiques, mais ne reçoit plus de nouveau développement produit hors correctif critique.

La migration reprend le contenu pédagogique utile, pas le shell technique legacy.

## Première tranche : Séance 1 / diagnostic de rentrée

Le parcours Portail `psr-maths / rentree-v1` reprend les 10 situations auditées du site Maths LGC :

1. Calcul — 12 bouteilles × 1,50 €.
2. Automatismes — 3,6 kg → grammes.
3. Durées — 9 h 35 + 50 minutes.
4. Fractions & pourcentages — moitié → 50 %.
5. Proportionnalité — 400 g pour 5 portions → 15 portions.
6. Monnaie — rendu sur 20 € pour 13,70 €.
7. Données — moyenne de 18, 22, 20, 20.
8. Équations — 3 × x = 24.
9. Lecture de situation — 6 barquettes / 10 min → 30 min.
10. Ordres de grandeur — 10 × 4,98 € ≈ 50 €.

La formulation, le type de réponse et les clés restent alignés sur le diagnostic legacy. La migration ne transforme pas les saisies ouvertes en QCM.

## Différences d’architecture assumées

- identité élève : roster préparé dans Portail, puis sélection par l’élève ;
- aucune date de naissance demandée dans le nouveau parcours ;
- session, QR, fermeture/réouverture, live view, verrou de corrigés et rapports sont ceux de Portail ;
- chaque question produit un événement d’activité ; « Je ne sais pas » est conservé explicitement ;
- aucune note globale n’est affichée à l’élève ;
- les réponses nécessaires à la correction personnelle sont rappelées localement sur le même appareil ; aucune API publique n’expose les réponses d’un autre élève ;
- la correction détaillée respecte le verrou professeur et peut revérifier son état depuis la vue élève ;
- l’aperçu professeur ne persiste aucun événement ;
- les anciennes séances restent dans Maths LGC et ne sont pas copiées dans la base Portail.

## Encore à migrer

La première tranche ne prétend pas remplacer tout le site legacy. Restent notamment :

- enrichissements visuels de la correction guidée, notamment fractions/pourcentages (la correction textuelle V1 est déjà migrée) ;
- défi PSR : fiche technique, proportionnalité, durée, coût/chiffre d’affaires ;
- modules Durées, Recettes & proportionnalité, Pourcentages, Données & statistiques, Équations, Graphiques & fonctions, Prix & commerce, Probabilités ;
- remédiation/ordre de parcours à réévaluer avec les observations terrain.

Le suivi live, les rapports et le verrou **Corrigés** sont maintenant disponibles dans Portail pour cette première tranche.
