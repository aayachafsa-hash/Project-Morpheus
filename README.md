# Morpheus

Jeu de puzzle 3D dans le navigateur, inspiré de Shadowmatic : le joueur déplace et fait tourner un objet devant une lumière pour que **son ombre sur le mur** reproduise une silhouette cible.

Projet réalisé en trinôme dans le cadre du module WebGL. Technologies : HTML, CSS, JavaScript (modules ES) et [Three.js](https://threejs.org/) (WebGL). Aucune étape de build.

## Lancer le projet

Le projet utilise des modules ES et charge des fichiers `.glb` : il faut le servir via un serveur local (ouvrir `index.html` directement ne fonctionne pas).

**Avec VS Code** : installer l'extension *Live Server*, puis clic droit sur `index.html` > *Open with Live Server* (port 5502 configuré dans `.vscode/settings.json`).

**Avec Python** :

```bash
python -m http.server 8001
```

Puis ouvrir http://localhost:8001.

Une connexion Internet est nécessaire : Three.js (v0.170.0) est chargé depuis un CDN, ainsi que la police Inter.

## Principe du jeu

1. Une `SpotLight` éclaire la scène et projette l'ombre de l'objet sur le mur du fond.
2. Le joueur déplace et oriente l'objet (position, profondeur, hauteur, rotation).
3. La vignette « Target » à gauche montre la silhouette à reproduire.
4. Le score **MATCH** compare l'ombre réelle avec l'ombre cible.
5. À 95 % ou plus, la cible est considérée comme atteinte.

### Comment le score est calculé

L'ombre n'est pas simulée : on utilise l'ombre réellement rendue par le GPU.

- Un rendu hors écran du mur (avec un `ShadowMaterial`, tout le reste étant masqué) donne un masque noir et blanc de 192×96 pixels.
- Le masque cible est produit de la même façon, en plaçant l'objet dans sa pose « solution » définie dans `CONFIG.solution`.
- Le score est l'**IoU** (intersection sur union) entre les deux masques, en pourcentage.
- La comparaison porte sur tout le rectangle du mur : translater l'objet ou changer sa profondeur modifie donc bien le score.

## Contrôles

| Action | Commande |
| --- | --- |
| Sélectionner un objet | Clic sur l'objet, touche `1`, ou emplacement dans la barre « Objects » |
| Déplacer sur la table | Glisser avec la souris |
| Rotation horizontale | Touche `R`, puis glisser |
| Incliner | `Maj` + glisser |
| Monter / descendre | Touche `Z`, puis glisser verticalement |
| Profondeur (distance au mur) | Molette ou slider « Depth » |
| Réglage précis | Sliders Height, Depth et rotation X / Y / Z |
| Quitter un mode | `Échap` |

Boutons de l'interface :

- **Reset** : remet l'objet dans sa position de départ.
- **Pause** : fige les transformations et désactive les sliders.
- **Check Shadow** : calcule immédiatement le score.
- **Show solution** : déplace l'objet vers la solution.

Dans le code, la hauteur correspond à l'axe Y de Three.js et la profondeur à l'axe Z. L'interface parle de « Height » pour éviter la confusion.

## État actuel du prototype

- Un niveau jouable : le poisson **Aquafish** (`assets/aquafish.glb`).
- Une sculpture d'avion (`assets/airplane1.glb`) est affichée sur un socle comme décor. Ce n'est pas une pièce jouable et elle est masquée pendant le calcul du score.
- Pas encore de gestion de plusieurs niveaux, d'écran de victoire ni d'indices progressifs.
- Le comportement dans le navigateur doit être revérifié après chaque modification importante.

## Configuration

Tous les réglages sont dans l'objet `CONFIG` (fichier `src/config.js` après découpage, en haut de `main.js` avant) :

- `light` : position, cible, couleur, intensité, angle et pénombre du spot.
- `shadow` : résolution de la shadow map et biais.
- `movement` : limites de déplacement, vitesse, amortissement.
- `scoring` : taille du masque, intervalle de calcul, seuil, zone du mur analysée.
- `puzzle`, `solution`, `initial` : modèle, pose solution et pose de départ.

Recharger la page après toute modification.

## Architecture visée

Le dépôt est organisé en modules, un par domaine de responsabilité :

```
morpheus-prototype/
├── index.html
├── style.css
├── README.md
├── assets/
│   ├── aquafish.glb
│   └── airplane1.glb
└── src/
    ├── main.js            # assemblage des modules et boucle d'animation
    ├── config.js          # CONFIG
    ├── scene/             # Personne 1 : scène, lumières, matériaux, chargement
    ├── gameplay/          # Personne 2 : contrôles, système d'ombre, validation, niveaux
    └── ui/                # Personne 3 : menus, HUD, paramètres
```

## Répartition de l'équipe

| Rôle | Responsabilités | Membre |
| --- | --- | --- |
| Scène 3D et rendu | Environnement, assets Blender/GLB, lumières, matériaux, ombres, performances | _À compléter_ |
| Mécaniques de jeu | Manipulation des objets, système d'ombre, validation, niveaux, indices | _À compléter_ |
| Interface et intégration | Écran d'accueil, menus, HUD, états du jeu, déploiement | _À compléter_ |

## Organisation Git

- `main` : version stable, modifiée uniquement par pull request.
- `feature/scene`, `feature/gameplay`, `feature/ui` : une branche par personne.
- Intégrer souvent, par petits changements, plutôt qu'à la fin du projet.
