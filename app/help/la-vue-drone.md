---
title: "La vue drone de ton terrain"
summary: "Une photo aérienne récente et datée de ton terrain, prise avec ton drone ou par Semisto : l'importer, dessiner dessus et comparer d'une saison à l'autre."
category: Cartographier
order: 41
---

Les photos aériennes publiques ont souvent quelques années, et elles montrent rarement ton terrain à la saison qui t'intéresse. Une vue drone, c'est ton terrain vu d'en haut, le jour du vol. Deux façons de l'avoir : tu fais voler ton propre drone et tu importes l'image, ou Semisto vient la prendre pour toi avec la **mission drone**.

## Importer ta propre vue drone

Assemble d'abord les photos du vol en une seule image vue du dessus (une **orthophoto**) avec ton logiciel de drone : DJI Terra, WebODM, Pix4D, Agisoft… Exporte-la en **GeoTIFF** (`.tif`) : c'est le format qui garde la position exacte de l'image sur le terrain. Une archive `.mbtiles` ou `.pmtiles` déjà prête convient aussi.

1. Ouvre le panneau **Couches** : sous **Vues drone**, clique sur **Importer une vue drone**.
2. Choisis le fichier, donne un nom à la vue et vérifie la **date du vol** : c'est elle qui range tes vues dans le temps.
3. Clique sur **Envoyer et préparer la vue**. Le fichier part en morceaux : garde la page ouverte pendant l'envoi. Une courte coupure de réseau n'est pas grave : l'envoi réessaie tout seul.
4. Terranova prépare ensuite la vue pour qu'elle s'affiche vite à tous les zooms. Tu peux fermer la page : un e-mail te prévient quand elle est sur ta carte.

Le fichier peut peser jusqu'à **10 Go**, de quoi couvrir un très grand terrain avec beaucoup de détail. Un gros fichier prend du temps à envoyer et à préparer : compte une à deux heures pour quelques gigaoctets.

[Ouvrir le panneau Couches](action:panel/layers)

Si l'import échoue, Terranova dit pourquoi sous **Tes imports**. Le cas le plus fréquent : l'image n'est pas géoréférencée (un simple `.jpg` ou un `.tif` sans coordonnées). Réexporte-la en GeoTIFF depuis ton logiciel de drone.

## La mission drone de Semisto

Pas de drone ? Semisto photographie ton terrain d'en haut, à une date convenue avec toi, puis pose cette vue sur ta carte. Tous les détails et le prix sont sur la page [Mission drone](/mission-drone).

1. Tu commandes la mission en ligne, depuis la page [Mission drone](/mission-drone) ou depuis **Formule et facturation**. Un compte gratuit suffit, sans forfait.
2. Semisto te recontacte pour organiser le vol : l'accès au terrain, la période, la météo.
3. Après le vol, Semisto assemble les photos en une seule image vue du dessus, la pose sur ta carte et t'envoie un e-mail : « Ta vue drone est sur ta carte », avec le lien pour l'ouvrir.

## Où trouver la vue drone

Ouvre ta carte : la vue qui vient d'arriver s'affiche d'emblée. Tu la retrouves à tout moment dans le panneau **Couches**, sous **Vues drone**, juste après le **Fond de carte**. Chaque vue porte sa date, par exemple « Vue drone · 12 mai 2027 ».

- La vue drone se pose **sur le fond choisi** (plan ou photo aérienne) : autour de ton terrain, tu gardes le paysage.
- Le curseur règle son **opacité** : baisse-le pour voir la photo en dessous et repérer ce qui a changé.
- **Sans vue drone** la masque, sans rien supprimer.

Ton choix est retenu pour cette carte, sur cet appareil.

## Dessiner dessus

La vue drone sert directement de fond pour dessiner : arbres, haies, chemins et mares se placent bien plus précisément que sur une photo publique, souvent floue à cette échelle. Les outils de dessin, les mesures et les couches du Géoportail fonctionnent comme d'habitude, par-dessus. Voir [Dessiner l'existant](/help/dessiner-l-existant).

## Comparer d'une saison, d'une année à l'autre

Chaque nouvelle mission ajoute une vue datée à côté des précédentes : rien n'est remplacé, la plus récente vient en tête de liste. Passe d'une date à l'autre dans **Vues drone** pour voir ton jardin-forêt grandir : une haie qui s'étoffe, une mare qui se remplit, un verger qui referme sa canopée.

Pour remonter plus loin, garde la vue drone et choisis une photo ancienne comme **Fond de carte** (Photo 1971, Photo 1994-2000), puis baisse l'opacité de la vue drone : hier et aujourd'hui se superposent. Voir [Lire les couches du Géoportail](/help/lire-les-couches-du-geoportail).

## Qui voit la vue drone ?

Elle fait partie de ta carte : toutes les personnes avec qui tu partages cette carte la voient, qu'elles puissent la modifier ou seulement la consulter.

Si tu publies ta carte (panneau **Publier**), la vue drone n'apparaît pas dans la vue publique, sauf si tu coches **Vue drone** : la plus récente sert alors de fond, pour tous ceux qui ont le lien. Une vue arrivée après la publication n'y apparaît qu'après **Mettre à jour la vue publiée**. Voir [Publier sa carte](/help/publier-sa-carte).

## Retirer une vue importée

Dans **Tes imports**, **Retirer** supprime la vue et son fichier de la carte. Les éléments dessinés dessus restent en place.

## Si la vue ne s'affiche pas

La vue est hébergée par Semisto et chargée par ton navigateur. Si Terranova indique que la vue drone ne répond pas, réessaie un peu plus tard ; si cela dure, écris à Semisto. Au-delà du zoom le plus fort de la prise de vue, l'image est simplement agrandie.
