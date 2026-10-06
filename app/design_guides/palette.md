---
title: "La palette : strates, guildes et diversité"
summary: "Choisir les espèces dans le catalogue de Semisto, strate par strate, en guildes qui se soutiennent, adaptées au sol et au climat."
order: 40
status: brouillon
---

La palette, c'est la liste des espèces du jardin-forêt et la façon dont elles s'assemblent. On la choisit une fois l'eau et la structure posées.

## Les sept strates

Un jardin-forêt occupe l'espace en hauteur comme une lisière forestière : **canopée** (grands arbres), **arbres bas** (fruitiers), **arbustes** (petits fruits), **herbacées** vivaces, **couvre-sol**, **grimpantes**, **racines**. Le champ `strata` du catalogue donne la strate de chaque espèce. Ne remplis pas toutes les strates partout : la densité vient avec le temps et la lumière disponible.

## Les guildes

Une guilde est un petit groupe d'espèces autour d'un arbre central, qui se rendent service :

- un **fixateur d'azote** (aulne, éléagnus, argousier, caraganier, trèfle… `ecoServices` contient `nitrogen`) pour environ trois à cinq fruitiers au début ;
- des **accumulateurs** et plantes à biomasse (consoude) pour pailler sur place (`minerals`, `organic-matter`) ;
- des **mellifères** et des plantes pour les **auxiliaires** (`mellifere`, `beneficial-insects`), avec des floraisons de février à octobre ;
- un **couvre-sol** pour ne jamais laisser le sol nu (`ground-cover`) ;
- des plantes répulsives ou aromatiques au pied.

## Choisir les espèces

Cherche dans le catalogue de Semisto (`search_plants`, `get_plant`) et vérifie pour chaque espèce :

- **Rusticité** (`hardinessZone`, `minTemperatureC`) face à la zone du terrain, aujourd'hui et en 2050 (chapitre `climat`).
- **Sol et eau** : `soilMoisture`, `wateringNeed`, `soilTypes`, `soilPh`, face au sol du terrain et à sa place par rapport à l'eau.
- **Lumière** : `exposures`, face à l'ombre de la structure.
- **Taille adulte** : `heightMaxM`, `spreadMaxM`, `crownM`, pour l'espacement.
- **Ce qu'elle apporte** : `edibleParts`, `edibleRating`, `ecoServices`, et ce qui compte dans la fiche projet.
- **Indigène ou invasive** : `nativeCountries`, `invasiveCountries`. Jamais d'espèce invasive dans le pays du terrain.
- **Toxicité** (`toxicFor`) si des enfants ou des animaux fréquentent le lieu.

Chaque donnée du catalogue a sa source : cite-la quand elle fonde un choix. Si une donnée manque, dis-le plutôt que de l'inventer.

## La diversité

- Plusieurs variétés par espèce fruitière, avec les **pollinisateurs** compatibles (pommiers, poiriers, cerisiers…).
- Des récoltes étalées sur l'année (`harvestMonths`) plutôt que tout en septembre.
- Plusieurs familles botaniques, pour qu'une maladie ou un ravageur ne fasse pas tout tomber.
- Une bonne part d'**espèces indigènes** ou bien adaptées, en particulier dans les haies.

## Les quantités

Espace les arbres selon leur couronne adulte, mais plante plus dense au départ avec des pionniers et des arbustes qu'on éclaircira. Propose des quantités réalistes pour le budget et le temps de la personne, et rappelle que les plants les plus jeunes reprennent souvent le mieux.
