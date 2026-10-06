---
title: "L'eau : ralentir, répandre, infiltrer"
summary: "Lire le chemin de l'eau sur le terrain et proposer mares, baissières, jardins de pluie et citernes là où ils servent."
order: 20
status: brouillon
---

Dans un jardin-forêt, l'eau se conçoit avant les plantes : c'est elle qui décide où les arbres prendront et où ils souffriront. La règle de Semisto : **ralentir, répandre, infiltrer, stocker**, dans cet ordre, et garder l'eau le plus haut possible sur le terrain.

## Lire l'eau du terrain

- **Le relief** : où le terrain est le plus haut, où il descend, où sont les creux. Les couches de la région (`get_region_layers`, `identify_at_point`) donnent souvent les zones inondables, les axes de ruissellement et le sol. La pente est dans le panneau « Eau et relief » de l'éditeur : demande à la personne ce qu'il montre si tu n'as pas l'information.
- **L'existant** : sources, puits, fossés, zones humides, mares, citernes déjà dessinés (`list_features`, couches `existing` et `water`).
- **Les toits** : chaque mètre carré de toit récolte environ la pluie annuelle en litres (800 mm par an = 800 l par m²). Les toits sont souvent la source d'eau la plus simple à valoriser.
- **Le sol** : un sol limoneux ou sableux infiltre ; une argile lourde ou un sol hydromorphe retient et peut asphyxier les racines.
- **Ce que la personne a vu** : où l'eau coule après un orage, où ça reste boueux en hiver, où l'herbe jaunit en premier l'été. Pose la question, c'est la meilleure donnée.

## Les éléments à proposer (couche `water`)

- **Baissière** (`swale`) : fossé à fond plat creusé **exactement sur la courbe de niveau**, avec un bourrelet planté en aval. Elle arrête le ruissellement et l'infiltre. Seulement sur pente douce (environ 2 à 15 %) et sol qui infiltre ; jamais au-dessus d'un bâtiment, d'une fosse septique ou d'un talus instable. Une baissière qui ne suit pas la courbe de niveau devient un fossé qui concentre l'eau : signale-le.
- **Mare** (`pond`) : dans un point bas naturel, sur un sol qui retient, avec une berge en pente douce pour la faune. Elle stocke, rafraîchit et accueille la biodiversité. Prévois toujours son trop-plein et où il part.
- **Jardin de pluie** (`rain_garden`) : petite dépression plantée qui reçoit l'eau d'un toit ou d'une allée.
- **Citerne** (`water_tank`) : au pied d'une descente de toit, dimensionnée sur la surface du toit et les besoins d'arrosage des premières années.
- **Fossé** (`ditch`) : seulement pour évacuer un excès d'eau qu'on ne peut pas infiltrer.

Chaque élément d'eau dit d'où vient son eau, où va son trop-plein, et pourquoi à cet endroit.

## Ce qui découle de l'eau

- Les arbres les plus exigeants en eau en aval des baissières et des mares ; les plus sobres sur les buttes et les hauts de pente.
- Les zones humides deviennent des atouts (saules, aulnes, plantes de berge), pas des problèmes à drainer.
- Les accès suivent les courbes de niveau ou les crêtes, pour ne pas devenir des ruisseaux.

## Le climat qui vient

Les sécheresses d'été s'allongent et les pluies d'hiver deviennent plus intenses. Concevoir l'eau, c'est préparer les deux : infiltrer l'excès d'hiver pour qu'il serve l'été, et prévoir où l'eau d'un orage exceptionnel passera sans dégâts.
