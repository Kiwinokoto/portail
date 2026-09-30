# Validation terrain — Portail LGC / Maths LGC

État au 30 septembre 2026.

Ce document sépare volontairement trois niveaux :

- **Automatisé vert** : couvert par tests/CI.
- **Déployé** : présent sur la production et healthchecks verts.
- **Validé terrain** : réellement essayé sur le navigateur/appareil ou en situation de classe visée.

Une fonctionnalité n'est **pas** considérée validée terrain tant que la dernière colonne n'est pas cochée.

## 1. Portail → Maths : identité et récupération des séances

| Vérification | Automatisé | Déployé | Terrain |
| --- | --- | --- | --- |
| SSO Portail → Maths sans recopier de jeton | ✅ | ✅ | ⬜ |
| Un autre professeur ne peut pas ouvrir la séance | ✅ | ✅ | ⬜ |
| Une séance créée sous SSO réapparaît après reconnexion sur un autre navigateur/appareil | ✅ | ✅ | ⬜ |
| Les anciennes séances restent accessibles par leur ancien secret de gestion | ✅ | ✅ | ⬜ |

### Test manuel recommandé

1. Dans un navigateur A, se connecter au Portail.
2. Ouvrir PSR → Mathématiques et créer une séance jetable.
3. Vérifier qu'elle apparaît dans **Séances**, **Corrigés**, **Suivi en direct** et **Rapports**.
4. Dans un navigateur B ou un autre appareil, sans copier le lien de gestion, se connecter au même compte Portail.
5. Ouvrir PSR → Mathématiques.
6. Vérifier que la séance réapparaît et que son suivi s'ouvre.
7. Si un second compte professeur de test existe, vérifier qu'il ne voit pas/ n'ouvre pas cette séance.

**État actuel : pas encore testé manuellement par Kevin.**

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

## 4. Boucle professeur complète ADA

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
- [ ] Ouvrir **Rapports** depuis le parcours puis directement depuis **Mes séances récentes**.
- [ ] Vérifier synthèse groupe, détail élève et comparaison uniquement entre séances comparables.

## 5. Règle de décision après test

Un problème de rendu, de compréhension ou de navigation constaté sur appareil réel doit être corrigé avant d'ajouter des inférences pédagogiques plus fortes.

En particulier :
- ne pas ajouter de vrai diagnostic phonème↔graphème avant validation pédagogique de la consigne et des items ;
- ne pas étendre la numératie vers une « note de niveau » ;
- décider d'un éventuel mécanisme de claim appareil/élève seulement après observation du partage réel des appareils en classe.
