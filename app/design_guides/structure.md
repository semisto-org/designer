---
title: "La structure : arbres, haies, lisières et zones"
summary: "Poser la charpente du jardin-forêt : grands arbres, haies brise-vent, lisières, clairières et zones selon l'usage."
order: 30
status: brouillon
---

La structure est la charpente du jardin-forêt : ce qui sera encore là dans cinquante ans. On la pose après l'eau et les accès, avant la palette détaillée.

## Les zones selon l'usage

Ce qu'on visite tous les jours près de la maison (aromatiques, petits fruits, potager), ce qu'on visite chaque semaine un peu plus loin (fruitiers), ce qu'on visite rarement au fond (bois, noyers, châtaigniers, haie libre, zone sauvage). Propose cette organisation à partir des bâtiments et des accès de la carte, et ajuste-la à la fiche projet.

## Les haies et les brise-vent

- **Brise-vent** (`windbreak`) côté des vents dominants (souvent ouest à sud-ouest en Europe de l'Ouest) et des vents froids d'est et de nord-est qui brûlent les floraisons. Un brise-vent protège sur environ dix fois sa hauteur ; il doit être perméable (environ la moitié du vent passe), pas un mur.
- **Haie** (`hedge`) diversifiée, en plusieurs rangs et plusieurs strates : arbres de haut jet, arbustes, petits fruitiers, au moins cinq à huit espèces, avec des fixateurs d'azote et des mellifères. Les haies existantes se gardent et se complètent.
- Les haies tiennent les limites, cassent le vent, abritent les auxiliaires et les oiseaux, et donnent de la biomasse et des fruits.

## Les lisières et les clairières

Le jardin-forêt imite une lisière : c'est là que la vie et la production sont les plus fortes. Propose des **lisières** en dents de scie ou en courbes plutôt que des alignements, et garde des **clairières** ensoleillées pour les plantes de lumière et les activités. Une canopée trop fermée produit peu de fruits.

## La lumière et l'ombre

- Les grands arbres (noyers, châtaigniers, tilleuls) au **nord** des zones cultivées, pour ne pas leur faire d'ombre.
- Plus on monte vers le sud, plus les arbres sont bas, en gradin vers le soleil.
- Pense à l'ombre de **décembre** (soleil bas, ombres longues) et de **juin**, et aux couronnes adultes, pas aux plants : un noyer couvre 15 m de diamètre et plus à 30 ans.
- Distances : pas de grand arbre à moins de sa demi-couronne adulte d'un bâtiment, d'une conduite ou d'une limite (la règle légale de la région prime) ; pas d'arbre qui ombrage les panneaux solaires ou le potager.

## Le phasage

Les arbres de structure se plantent en premier : ce sont eux qui mettent le plus de temps. Des **pionniers** à croissance rapide (aulnes, saules, sureaux, argousiers, fixateurs d'azote) protègent les jeunes fruitiers, puis se taillent ou disparaissent avec les années. Montre ce que devient la structure à l'an 1, 5, 15 et 30.

## Ce qu'on propose comme brouillons

Couche `structures` pour les zones, abris et serres ; couche `plants` pour les arbres et haies, avec `species` et l'espacement (`spacing_m`) dans `properties` quand il est connu. Chaque `rationale` cite le vent, le soleil, l'existant ou l'usage qui justifie l'emplacement.
