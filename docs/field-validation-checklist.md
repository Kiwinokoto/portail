# Validation terrain — Portail LGC

État au 2 octobre 2026. `maths.lagrandeclasse.fr` est désormais un chemin legacy à préserver pour les cohortes existantes ; les nouveaux tests fonctionnels PSR Maths se font dans Portail.

Ce document sépare volontairement trois niveaux :

- **Automatisé vert** : couvert par tests/CI.
- **Déployé** : présent sur la production et healthchecks verts.
- **Validé terrain** : réellement essayé sur le navigateur/appareil ou en situation de classe visée.

Une fonctionnalité n'est **pas** considérée validée terrain tant que la dernière colonne n'est pas cochée.

## 1. PSR Mathématiques natif — première migration

À vérifier sur une séance Portail jetable, sans toucher aux séances historiques de `maths.lagrandeclasse.fr` :

- [ ] Depuis l'accueil, les cinq cartes lancent des espaces focalisés ; hors accueil, **Séances → Parcours → Corrigés → Suivi en direct → Rapports** reste disponible comme navigation principale.
- [ ] Dans **Parcours**, la vue professeur commence par la vue d'ensemble de la séquence et non par la question 1 ; la barre secondaire permet de visualiser les étapes suivantes.
- [ ] PSR → Mathématiques reste dans `portail.lagrandeclasse.fr` pour le professeur.
- [ ] **Séances** crée une occurrence Portail avec le parcours « Séance 1 — diagnostic de rentrée ».
- [ ] Précharger 2–3 élèves puis ouvrir le lien/QR dans un navigateur élève.
- [ ] Les 10 situations conservent la formulation et le type de réponse du diagnostic legacy (saisies numériques/heure ; choix seulement pour l’ordre de grandeur).
- [ ] « Je ne sais pas » permet d’avancer et remonte comme signal séparé dans le suivi/rapport.
- [ ] Aucune note globale ni correction immédiate n’est affichée à l’élève pendant le diagnostic.
- [ ] **Suivi en direct** montre qui a commencé et l’avancement vers les 10 situations + fin du diagnostic.
- [ ] Après le diagnostic, le **Défi PSR** permet de varier les portions et vérifie coefficient, heure de départ et chiffre d'affaires.
- [ ] **Rapports** montre diagnostic, « Je ne sais pas », état du défi et ses trois signaux sans produire de classement.
- [ ] **Corrigés** est verrouillé par défaut ; après déblocage professeur, « Voir les stratégies » affiche les explications sur le même appareil élève.
- [ ] Reverrouiller puis vérifier depuis l’élève masque de nouveau les solutions.
- [ ] L’aperçu professeur du diagnostic/correction n’écrit aucune activité élève.
- [ ] Les anciennes séances Maths LGC continuent d’apparaître comme legacy et ouvrent encore leur ancien site.

### Modules PSR natifs — première vague

- [ ] **Durées** : le curseur départ/durée reste lisible sur téléphone et recalcule correctement l'heure de fin.
- [ ] Durées : réponses 10 h 25, 11 h 10, 105 min et 90 min produisent les quatre validations attendues.
- [ ] **Recettes** : le curseur de portions recalcule coefficient, riz, légumes et sauce sans débordement mobile.
- [ ] Recettes : 1 200 g, 5 L, 2 250 g et × 3,2 sont correctement reconnus.
- [ ] **Pourcentages** : la grille 10×10, le curseur et les équivalences restent lisibles sur téléphone ; les réponses 10, 9 €, 18 € et 60 % sont reconnues.
- [ ] **Données** : les 5 barres restent lisibles, le curseur vendredi recalcule total/max/min/moyenne ; mardi, 30, 30 % et 22 sont reconnus.
- [ ] **Équations** : le curseur atteint l’équilibre à x = 8 ; les réponses 8, 12, 9 € et 15 sont reconnues.
- [ ] **Graphiques & fonctions** : le point suit le curseur de 0 à 20 menus sans débordement mobile ; 48 €, 80 €, 12 menus et « multiplié par 2 » sont reconnus.
- [ ] **Prix & commerce** : quantité et remise recalculent toute la facture sans débordement mobile ; 51 €, 36 €, 4,50 € et 5 € sont reconnus.
- [ ] **Probabilités** : les tirages 1/20/100 et le reset fonctionnent, la fréquence/marque 30 % restent lisibles ; 20 %, 0, 70 % et « oui, la fréquence peut varier » sont reconnus.
- [ ] En Suivi en direct, un élève ayant terminé ces modules affiche une progression par phases (Diagnostic / Défi / modules) et jamais un score global trompeur.

### Compatibilité legacy

- [ ] Après déploiement du réparateur de ownership, l'ancienne séance de mardi attribuée à « Monsieur Kevin » apparaît directement dans les séances Portail de Kevin, tout en gardant son identifiant et ses données historiques.
- [ ] Le compte d'un autre professeur ne peut ni voir ni reprendre cette séance.

### Compatibilité legacy déjà vérifiée

- [x] Une séance Maths créée sous l’ancien SSO peut être retrouvée sur un autre appareil avec la même identité Portail (01/10).
- [x] Le deep-link legacy `tab=live&session=...` conserve la destination de suivi (02/10).
- [ ] Les séances antérieures à Portail restent volontairement séparées si elles n’ont pas d’ownership Portail ; pas de migration destructive prévue.

## 2. ADA Français V2 — appareil élève réel

À vérifier sur au moins un téléphone Android représentatif et, si possible, un second navigateur :

- [ ] QR/lien de séance → bonne séance et bon groupe.
- [ ] Sélection du prénom lisible et facile à toucher.
- [ ] TTS français compréhensible, débit correct et bouton de réécoute évident.
- [ ] Compréhension orale : pictogrammes/emoji rendus correctement.
- [ ] Reconnaissance du prénom : choix lisibles sans scroll horizontal.
- [ ] Première lettre : ne suggère pas au professeur une compétence de décodage autonome.
- [ ] Discrimination visuelle : différences perceptibles sur petit écran.
- [ ] Son → lettre guidé : consigne comprise comme activité guidée.
- [ ] Mot utile : rendu et taille corrects.
- [ ] Geste d'écriture : zone tactile utilisable ; aucune pseudo-note produite.
- [ ] Feedback : vert = réussi, orange = réessayer ; jamais couleur seule.
- [ ] Retour/rechargement : identité préparée reprise sans demander de retaper le nom.

## 3. ADA Mathématiques / numératie V1 — appareil élève réel

- [ ] Quantités d'assiettes clairement distinguables.
- [ ] TTS « sept », « cinq euros », « le plus », « en tout » compris sans reformulation.
- [ ] Chiffres suffisamment grands pour un public fragile en lecture.
- [ ] Groupes de verres perceptibles sans ambiguïté.
- [ ] Addition 2 + 1 comprise comme situation concrète, pas comme exigence d'algorithme écrit.
- [ ] Symbole € correctement rendu sur petit écran.
- [ ] Les cinq probes restent présentés séparément ; aucune note globale.
- [ ] Le professeur retrouve chaque probe séparément dans le rapport.

## 4. ADA Français — entraînement fondamental sur appareil réel

Sur une séance **Entraînement** distincte du positionnement :

- [ ] Le professeur peut choisir « Entraînement — cartes, écoute et Memory » à la création.
- [ ] Le lien/QR conserve ce parcours après rechargement et sur un autre navigateur.
- [ ] L’élève préparé arrive sur le menu d’entraînement, jamais sur le positionnement.
- [ ] Cartes image + mot : illustrations nettes et mots lisibles sur téléphone.
- [ ] Écoute et retrouve : TTS compréhensible pour les huit mots de V1.
- [ ] Memory image ↔ mot : 4 paires manipulables sans scroll gênant.
- [ ] MAJ ↔ min : formes lisibles et non ambiguës.
- [ ] Syllabes simples : valider la prononciation TTS ; remplacer par audio enregistré si elle est instable.
- [ ] Les séances d’entraînement n’affichent ni bouton Corrigés ni Rapport de positionnement.
- [ ] Le Suivi en direct peut montrer qu’un élève a commencé sans transformer ses essais d’entraînement en note.

## 5. Boucle professeur complète ADA

Sur une séance jetable :

- [ ] Créer la séance.
- [ ] Précharger 2–3 élèves.
- [ ] Corriger une faute de nom avant activité.
- [ ] Vérifier qu'un élève sans activité peut être retiré.
- [ ] Vérifier qu'un élève ayant commencé ne peut plus être supprimé.
- [ ] Ouvrir le QR/lien élève.
- [ ] Observer **Suivi en direct** ; actualisation environ toutes les 4 s.
- [ ] Masquer l'onglet professeur puis le réafficher : le polling doit se mettre en pause puis reprendre.
- [ ] Vérifier les corrigés verrouillés par défaut, puis les ouvrir et les reverrouiller.
- [ ] Fermer la séance : vérifier que le lien/QR élève renvoie « séance fermée », que le rapport reste lisible et que les corrigés sont reverrouillés.
- [ ] Réouvrir la séance : vérifier que le même lien/QR élève fonctionne à nouveau.
- [ ] Ouvrir **Rapports** depuis le parcours puis directement depuis **Mes séances récentes**.
- [ ] Vérifier synthèse groupe, détail élève et comparaison uniquement entre séances comparables.

## 6. Règle de décision après test

Un problème de rendu, de compréhension ou de navigation constaté sur appareil réel doit être corrigé avant d'ajouter des inférences pédagogiques plus fortes.

En particulier :
- ne pas ajouter de vrai diagnostic phonème↔graphème avant validation pédagogique de la consigne et des items ;
- ne pas étendre la numératie vers une « note de niveau » ;
- décider d'un éventuel mécanisme de claim appareil/élève seulement après observation du partage réel des appareils en classe.
