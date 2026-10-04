---
title: "Lire le relief et l'eau"
summary: "Télécharger le relief de ton terrain, voir où l'eau s'écoule et stagne, et estimer la pluie récupérable sur tes toits."
category: Comprendre son terrain
order: 46
---

Où l'eau descend-elle quand il pleut fort ? Où stagne-t-elle ? Quel coin reste à l'ombre en hiver ? Le panneau **Eau et relief** répond à ces questions à partir du relief mesuré de ton terrain. Il fait partie des analyses du [forfait](/help/formules-et-forfait).

## Télécharger le relief

1. Dessine d'abord le **contour du terrain** : le relief se télécharge autour de lui, avec une marge de 150 m pour tenir compte de l'eau qui arrive d'en haut.
2. Ouvre le panneau **Eau et relief** et touche **Télécharger le relief**.
3. Patiente quelques minutes : le relief arrive par paquets de points. Tu peux continuer à travailler pendant ce temps.

En Wallonie, le relief vient du Géoportail (relevés LiDAR 2021-2022 du SPW). La maille est d'**un mètre** tant que le terrain et sa marge tiennent dans environ un kilomètre carré, plus grossière au-delà ; un terrain trop étendu est refusé, avec la surface maximale. Seuls les éditeurs peuvent lancer le téléchargement. **Mettre à jour le relief** le recharge, par exemple après un changement de contour.

En France, le relief vient de l'IGN (RGE ALTI, au mètre, sol nu), avec la photo aérienne de l'IGN dessus. Au Luxembourg et ailleurs en Europe, il vient du **Copernicus DEM**, à 30 m : c'est un modèle de **surface**, arbres et toits compris, lissé pour la 3D. Il donne l'allure générale du terrain, pas ses détails : une butte, un fossé ou une petite mare n'y apparaissent pas.

## Le terrain en chiffres

Une fois le relief prêt, le panneau affiche l'**Altitude** (du point le plus bas au plus haut), le **Dénivelé**, la **Pente moyenne** et les **Pentes les plus fortes** : un dixième du terrain est plus pentu que cette valeur.

Sous **Sur la carte**, choisis **Écoulement** pour voir en bleu les axes où l'eau se rassemble et, en bleu clair, les cuvettes où elle stagne. **Ombrage** fait ressortir le modelé du terrain.

## La vue 3D

**Ouvrir la vue 3D** affiche le terrain en relief, en trois onglets :

- **Vue** : le fond (photo, altitudes, végétation, exposition, humidité, gel, occupation du sol), l'exagération du relief, les **Courbes de niveau** tous les 1, 2,5 ou 5 m, les **Axes d'écoulement**, les **Cuvettes** et tes éléments dessinés. Un clic sur le terrain le sonde : altitude, pente, orientation.
- **Pluie** : choisis l'intensité (**Pluie**, **Forte** ou **Orage**), la durée de l'averse et l'état du sol au départ, puis **Faire pleuvoir**. Active **Creuser les mares et baissières de la carte** pour voir ce que tes ouvrages retiennent, comparé au terrain actuel.
- **Soleil** : les ombres à une heure donnée, ou les **Heures de soleil** en hiver, à l'équinoxe, en été ou aujourd'hui.

## L'eau de pluie des toits

Dessine tes bâtiments, serres, abris et cabanes comme des surfaces : le panneau calcule l'eau récupérable chaque année (surface des toits × pluie annuelle × part récupérée), et son équivalent en litres par semaine. De quoi dimensionner une citerne.

Les **Réglages de l'eau**, marqués « indicatif », ajustent la pluie annuelle de ton coin (850 mm par défaut en Wallonie ; ailleurs, indique-la toi-même), la part récupérée sur les toits (0,8 par défaut), le type de sol et sa capacité à boire l'eau.

## Ce que ces calculs ne savent pas

Tout ici est **indicatif**. La pluie simulée tombe à intensité constante sur un sol sans fossés ni drains ; l'infiltration suit l'occupation du sol et le type de sol choisi, mais ignore la compaction, la profondeur du sol et la nappe. Les indices d'humidité et de gel sont des tendances tirées du relief, pas des mesures.

Le relief t'aide à placer une mare ou une baissière au bon endroit. Pour la dimensionner, fais un **test d'infiltration** sur place.

## Pour aller plus loin

- [Lire les couches du Géoportail](/help/lire-les-couches-du-geoportail) : pentes et axes de ruissellement officiels.
- [Dessiner l'existant](/help/dessiner-l-existant) : poser bâtiments, mares et baissières.
