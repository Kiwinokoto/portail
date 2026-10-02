# PSR Mathématiques — migration native vers Portail

## Décision

Depuis le 2 octobre 2026, `Kiwinokoto/portail` est le runtime canonique des nouveaux cours et séances en cours de construction/test. `Kiwinokoto/maths_lgc` reste en production pour les cohortes et liens historiques, mais ne reçoit plus de nouveau développement produit hors correctif critique.

La migration reprend le contenu pédagogique utile, pas le shell technique legacy.

## Séance 1 native : parcours, diagnostic et défi

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

La Séance 1 ne s'ouvre plus directement sur la première question. Portail expose désormais une vue d'ensemble avec **Pourquoi ? → Diagnostic → Correction → Défi PSR → Bilan**, plus une barre de séquence secondaire. Le défi **Préparer le service** est également natif : fiche technique pour 10 portions, curseur 5–40 portions, coefficient de proportionnalité, heure de départ et chiffre d'affaires.

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
- **Durées**, **Recettes & proportionnalité**, **Pourcentages**, **Données & statistiques**, **Équations** et **Graphiques & fonctions** sont maintenant natifs : contextes PSR, laboratoire manipulable, méthode et quatre situations d'entraînement chacun ;
- restent à porter intégralement : Prix & commerce, Probabilités ;
- remédiation/ordre de parcours à réévaluer avec les observations terrain.

Le suivi live, les rapports (diagnostic + défi) et le verrou **Corrigés** sont maintenant disponibles dans Portail pour cette Séance 1 native.


## Modules natifs — première vague

### Durées

Le module reprend les trois contextes du legacy (cuisson, mise en place, organisation), rappelle **1 h = 60 min**, propose un laboratoire avec heure de départ + durée et quatre situations : addition de durée, retour en arrière, durée entre deux heures et conversion 1 h 30 → 90 min.

### Recettes & proportionnalité

Le module repart de l'idée concrète « changer les portions, garder la recette », avec un curseur 5–35 portions basé sur 10 portions (riz/légumes/sauce), affichage du coefficient et quatre situations de proportionnalité dont le coefficient décimal 3,2.

Les essais de ces modules restent des **signaux d'entraînement**. Le suivi professeur affiche séparément Diagnostic / Défi / nombre de modules terminés au lieu d'additionner toutes les activités dans un score global.


### Pourcentages

Le module reprend les repères « part sur 100 », réduction et stock, avec une grille interactive de 100 cases, un curseur 0–100 %, les équivalences simples (1/4, 1/2, 3/4) et quatre situations : 25 % de 40, remise de 50 %, remise de 10 % et 30/50 → 60 %.

### Données & statistiques

Le module reprend les contextes ventes/stock/choix clients, avec un histogramme manipulable sur une semaine de menus servis. Le vendredi varie de 10 à 50 ; total, maximum, minimum et moyenne sont recalculés. Les quatre situations couvrent lecture/comparaison, moyenne, fréquence en pourcentage et valeur la plus fréquente.


### Équations

Le module reprend les trois situations concrètes du legacy (barquettes, prix, quantité), avec un curseur qui cherche l’équilibre de `3 × x = 24`, la méthode par opération inverse et quatre situations : 3 × x = 24, x + 7 = 19, 4 menus pour 36 €, x − 4 = 11.

### Graphiques & fonctions

Le module conserve la relation concrète du legacy : menus vendus à 8 € l’unité. Le curseur déplace un point sur la droite `y = 8 × x`, puis les quatre situations demandent 6 menus, 10 menus, retrouver le nombre de menus pour 96 € et comprendre l’effet d’un doublement.
