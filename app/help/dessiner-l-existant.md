---
title: "Dessiner l'existant"
summary: "Bâtiments, arbres, eau, chemins : poser sur la carte ce qui est déjà là, avant de concevoir."
category: Cartographier
order: 40
---

Avant d'imaginer, on **relève**. Dessiner l'existant t'oblige à regarder le lieu avec précision, et donne à tout le reste (le design, les analyses, ton IA) une base fiable.

## Que dessiner ?

Chaque chose que tu dessines est un **élément**, rangé dans une couche :

| Couche | Exemples d'éléments |
| --- | --- |
| Existant | Bâtiments, arbres et haies existants, murs, ruptures de pente, zones humides, chemins existants, occupation du sol (prairie, bois, potager…) |
| Eau | Mares, baissières, fossés, tuyaux de trop-plein, citernes, puits, sources, jardins de pluie |
| Accès | Cheminements, chemins carrossables, portails, stationnement |
| Structures | Serres, abris, cabanes, composts, bacs surélevés, terrasses, aires de jeux, clôtures, haies à planter, brise-vent |
| Plantes | Les plants et les patches de ton design, posés depuis la [palette](/help/construire-sa-palette-et-ses-patches) |
| Animaux | Parcs à animaux, poulaillers, ruches |
| Réseaux | Conduites d'eau et de gaz, câbles électriques et réseau, vannes, compteurs, prises, robinets |
| Notes | Notes, croquis et mesures enregistrées |

Un arbre déjà en place se dessine comme **Arbre existant**, dans la couche Existant : la couche Plantes est réservée à ce que tu vas planter.

## Dessiner un élément

1. En haut de la carte, touche **Éléments**.
2. Dans « Que veux-tu dessiner ? », choisis la couche, puis l'élément. Tes éléments **Récents** sont proposés en premier.
3. Suis l'indication affichée, selon la forme de l'élément :
   - **un point** (arbre, puits, compteur) : touche la carte à l'endroit voulu ;
   - **une ligne** (haie, fossé, chemin) : clique point par point, puis double-clique ou touche **Terminer** ;
   - **une surface** (bâtiment, mare, potager) : clique le contour point par point, puis reviens au premier point ou touche **Terminer**.
4. **Annuler**, ou la touche Échap, abandonne le tracé.

L'élément est ajouté à la carte et sa fiche s'ouvre.

## La fiche d'un élément

Touche un élément sur la carte, ou dans le panneau **Éléments** qui les liste par couche. Sa fiche montre :

- son **Nom** et ses **Notes** ;
- sa **Surface**, sa **Longueur** ou son **Périmètre** ;
- ses **Caractéristiques**, propres à chaque type : hauteur d'un bâtiment, état d'un arbre et s'il est à conserver, profondeur d'une mare, capacité d'une citerne… ;
- des **Estimations** pour certains éléments : volume d'eau d'une mare, terre à apporter dans un bac surélevé, plants à prévoir pour une haie ;
- sa **Couleur**, si tu veux la distinguer des autres ;
- pour une surface (une mare, un massif, un bâtiment…), **Angles arrondis** : coche la case, puis glisse le curseur de **Léger** à **Fort**. Les angles s'adoucissent sur la carte, jusqu'à une forme ovale ; la surface et les estimations suivent la forme arrondie, et les points que tu as cliqués restent ceux que tu modifies.

Pour corriger un tracé, touche **Modifier la forme**, fais glisser les sommets (un point au milieu d'un côté ajoute un sommet), puis **Enregistrer la forme**.

## Conseils de relevé

- **Pars des photos aériennes** pour les grandes formes, puis affine sur place.
- **Nomme tes éléments** : « Pommier du fond », « Fossé nord ». Dans six mois, tu t'en féliciteras.
- **Utilise les notes** pour ce que le dessin ne dit pas : un sol qui reste mouillé, un vent dominant, un voisin à ménager.
- **Les points relevés au téléphone** gardent la précision de leur GPS. Sous les arbres, elle dépasse souvent 10 m : ces points s'entourent d'un cercle pointillé et sont marqués « Position à vérifier ». Fais-les glisser à leur vraie place, par exemple sur la vue drone, ou touche **Il est bien placé**.
- **Une mare qui déborde dans une autre ?** Dessine le **Tuyau de trop-plein** (couche Eau) en partant de la mare qui déborde et en finissant dans celle qui reçoit : des flèches montrent le sens de l'eau. Coche **Enterré** s'il ne se voit pas. Contrairement aux conduites du réseau, il reste visible pour ton IA, qui en tient compte pour l'eau du terrain.
- **D'où vient l'eau de chaque robinet ?** Dans le panneau **Sources d'eau**, ajoute tes sources (puits, pluie, captage, réseau public…) et dis si chacune est potable. Sélectionne ensuite un robinet et choisis sa source : il en prend la potabilité.
- **Les réseaux** (eau, gaz, électricité) sont sensibles : ils restent masqués dans les vues publiques, les exports et pour l'IA, sauf si tu décides autrement.

## Et ensuite ?

- [Calques, mesures et croquis](/help/calques-mesures-et-croquis) : masquer des couches, mesurer, griffonner.
- [Construire sa palette et ses patches](/help/construire-sa-palette-et-ses-patches) : passer à la conception.
