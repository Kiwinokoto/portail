# Banque d’images LGC — pipeline de curation

## Objectif

Construire progressivement une banque locale d’environ **500 à 2 000 concepts familiers** pour les cartes d’apprentissage, le Memory et les futurs exercices multilingues, sans télécharger/renommer/documenter chaque fichier à la main.

Les concepts sont séparés de la langue et de l’image. Un concept peut donc garder le même identifiant visuel tout en recevant plus tard des labels français, arabe, wolof, anglais, etc.

Le pipeline ne fait **aucune requête d’image à l’exécution du Portail**. Les sources externes servent uniquement à constituer le corpus ; les images retenues doivent ensuite être stockées localement.

## Sources V1

### Wikimedia Commons — source prioritaire pour un corpus final

Le connecteur interroge directement l’API MediaWiki et récupère, avec l’image :

- page source ;
- auteur/crédit ;
- nom de licence ;
- URL de licence ;
- dimensions.

Les licences conservées par défaut sont CC0, domaine public, CC BY et CC BY-SA. Les métadonnées viennent directement de Commons et reçoivent donc le niveau de confiance `source-metadata`.

### Openverse — moteur de découverte

Openverse est très utile pour trouver rapidement des candidats venant de Flickr, Wikimedia et d’autres catalogues ouverts. Le connecteur conserve l’auteur, la source, la licence déclarée et la page d’origine.

Openverse précise cependant qu’il agrège des métadonnées et ne garantit pas lui-même la validité de chaque licence. Les candidats Openverse sont donc marqués `review_required=true`. Cela permet de les utiliser pour la découverte sans les faire passer silencieusement pour des assets juridiquement vérifiés.

### Open Images — étape ultérieure spécialisée

Open Images V7 est particulièrement intéressant pour les classes disposant de bounding boxes/segmentations, afin d’extraire automatiquement un objet d’une scène. Il couvre 600 classes avec bounding boxes : c’est excellent pour une partie du vocabulaire concret, mais insuffisant comme source unique pour 500–2 000 mots.

Un connecteur Open Images sera ajouté après validation de la première banque Commons/Openverse, plutôt que d’ajouter immédiatement FiftyOne et ses dépendances lourdes au dépôt.

## Manifeste de concepts

Le seed actuel est `tools/image-bank-seed-fr.json`.

Exemple :

```json
{
  "id": "pomme",
  "labels": {
    "fr": "POMME",
    "en": "apple"
  },
  "queries": [
    "red apple fruit",
    "green apple fruit",
    "apple"
  ],
  "tags": ["everyday", "food", "psr"],
  "difficulty": 1
}
```

`id` est stable et indépendant de la langue. `labels` pourra recevoir d’autres langues sans modifier les fichiers image. `queries` sert seulement à chercher de bons candidats.

## Collecter les candidats

Depuis la racine du repo :

```bash
python tools/image_bank.py collect \
  --manifest tools/image-bank-seed-fr.json \
  --output .image-bank \
  --providers wikimedia,openverse \
  --per-provider 4
```

Pour un petit lot :

```bash
python tools/image_bank.py collect \
  --manifest tools/image-bank-seed-fr.json \
  --output .image-bank \
  --providers wikimedia,openverse \
  --per-provider 4 \
  --ids pomme,moto,tasse,savon
```

La collecte est **incrémentale par défaut** :

- `candidates.json` sert de checkpoint ;
- un couple concept/provider déjà suffisamment rempli n’est pas interrogé à nouveau ;
- les erreurs réseau d’un provider sont enregistrées sans faire perdre les autres résultats ;
- relancer la même commande reprend le travail.

Utiliser `--fresh` uniquement pour effacer volontairement le workspace et repartir de zéro.

## Galerie de sélection

Après collecte, ouvrir :

```text
.image-bank/gallery.html
```

La galerie montre les candidats regroupés par concept, avec source, auteur et licence. Cocher les images retenues puis cliquer **Exporter la sélection** : le navigateur télécharge un `selection.json`.

Cette étape remplace le travail manuel « télécharger → enregistrer sous → renommer → noter la licence ».

Plusieurs images peuvent être retenues pour un même concept si l’on veut plus tard varier les cartes.

## Construire le corpus sélectionné

```bash
python tools/image_bank.py apply-selection \
  --workspace .image-bank \
  --selection ~/Downloads/selection.json \
  --clean
```

Résultat :

```text
.image-bank/
  candidates.json
  gallery.html
  candidates/
    pomme/
      wikimedia/
      openverse/
  selected/
    manifest.json
    pomme/
      wikimedia-....jpg
```

Le nom final est généré automatiquement. `selected/manifest.json` conserve la provenance complète de chaque fichier.

## Audit

```bash
python tools/image_bank.py audit --selected .image-bank/selected
```

L’audit signale notamment :

- fichier sélectionné absent ;
- licence absente ;
- page source absente ;
- auteur absent alors que la licence impose l’attribution ;
- candidat issu d’une source agrégée qui demande encore une vérification.

Le but est que la vérification humaine se concentre sur **les exceptions**, pas sur le renommage et la collecte de centaines de fichiers.

## ZIP

Pour partager le workspace complet :

```bash
python tools/image_bank.py package \
  --source .image-bank \
  --output image-bank-review.zip
```

Ou seulement le corpus retenu :

```bash
python tools/image_bank.py package \
  --source .image-bank/selected \
  --output image-bank-selected.zip
```

## Ce qui reste volontairement humain

L’automatisation ne peut pas décider seule qu’une image est pédagogiquement bonne.

Pour le public ADA, la sélection doit encore éliminer :

- objet minuscule au milieu d’une scène ;
- plusieurs objets concurrents ;
- texte incrusté ou panneau ambigu ;
- marques/logos évitables ;
- cadrage ou style infantilisant ;
- homonymes visuels (« cup » → trophée au lieu de tasse, par exemple).

Cette validation devient néanmoins une tâche de **clic dans une galerie**, et non une tâche de gestion de fichiers.

## Prochaines extensions

1. connecter Open Images pour les classes avec bounding boxes et générer des crops automatiques ;
2. calculer des indicateurs simples de qualité (taille, ratio, doublons par hash) ;
3. permettre un classement automatique assisté par vision/embeddings sans rendre cette dépendance nécessaire au Portail ;
4. passer du seed de quelques dizaines de concepts à des listes thématiques de plusieurs centaines ;
5. conserver les traductions dans le manifeste de concepts, jamais dans les pixels.
