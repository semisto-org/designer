# Semisto Designer — notre point de vue

Version 1, 5 octobre 2026. Co-défini avec Michael après le talk de Katie Dill (Stripe) sur la « zombie UI ». Ce document est la base de tout choix de design, de texte et de fonctionnalité, qu'il soit fait par un humain ou par un agent. En cas de doute, il fait foi.

## Ce qu'on veut devenir

**La référence européenne pour concevoir son jardin-forêt, seul ou en équipe.**

Le maillage de forêts comestibles en Europe est l'enjeu de la mission de Semisto, et chaque carte y contribue. Mais la personne qui arrive sur le site vient pour concevoir le sien : le site parle conception d'abord, et le maillage reste en arrière-plan.

## Qui on est pour la personne qui l'ouvre

**Un compagnon qui t'apprend à lire ton lieu et te fait progresser en concevant, avec le savoir de Semisto derrière lui.**

La personne type est un particulier qui conçoit lui-même. Ce qui lui manque, c'est le savoir-faire, pas un outil. Designer ne se contente donc pas d'exécuter : il explique ce qu'il voit, il propose, il montre le pourquoi, et il laisse toujours la décision à l'humain. La précision et le travail en équipe sont là, mais ils ne font pas l'identité.

Posture : celle du guide-jardinier de Semisto, « Viens, on te montre. » On tutoie, on invite, on ne culpabilise jamais.

## Le fil qui traverse chaque détail : le temps du vivant

Un jardin-forêt se pense sur trente ans. Un noyer de 3 ans n'a rien à voir avec celui de 25 ans. Aucun outil de conception ne montre le temps : Designer le montre partout.

Ce que ça veut dire, concrètement :
- **Un curseur des années** (an 1, an 5, an 15, an 30) : les couronnes grandissent, l'ombre s'étend, les strates se remplissent.
- **Les saisons** : l'ombre portée de décembre n'est pas celle de juin, la floraison et la récolte ont leur calendrier.
- **La mémoire du lieu** : une carte garde ses états (le terrain à l'arrivée, le projet, ce qui a été planté et quand). On peut toujours revoir l'avant.
- **Des petites touches** : la date du jour et la saison dans l'en-tête, l'âge des arbres plantés, « il y a deux hivers, tu plantais ce pommier ».

## Le langage visuel : un carnet de terrain vivant

Papier, aquarelle, traits et annotations à la main, et une carte qui pousse sous tes yeux.

- **Matières** : fond papier (beige clair du design system), aquarelles multi-étagées de Semisto, traits de crayon pour les annotations et les cotes.
- **La carte reste précise** : sous l'habillage, les géométries sont exactes (PostGIS, mètres). Le carnet habille la donnée, il ne la déforme jamais.
- **Le génératif sert la croissance** : les arbres et les strates qui poussent peuvent être calculés à partir des données (espèce, âge, hauteur adulte), sans devenir tout le style.
- **Mouvement** : comme le vent, pas comme un feu d'artifice (design system). Une croissance lente et organique plutôt que des transitions d'interface.
- **Le Semisto Design System reste la base** (prune, beige, artichaut ; Inter et EB Garamond, jamais en italique ; pilules ; cartes de 16 px). Ce document dit ce qu'on en fait.

## Ce qu'on refuse

- Le gabarit SaaS interchangeable : titre, deux boutons, bande de réassurance, « quatre temps », grille de six fonctionnalités, tarifs. Si une page pourrait vendre un logiciel de comptabilité, elle est à refaire.
- Les illustrations vectorielles lisses, les dégradés « tech » bleu-violet, les photos de stock.
- Les écrans vides qui attendent. Un écran vide est un moment de compagnon : il dit quoi regarder d'abord et pourquoi.
- Confondre « fait » et « bon ». Ce qui a été construit vite n'est pas fini tant que quelqu'un ne l'a pas vécu comme un utilisateur, d'un bout à l'autre du parcours.

## Comment on juge un écran (grille pour humains et agents)

1. **Ce lieu-ci** : est-ce que l'écran parle du terrain de la personne, ou d'un terrain générique ?
2. **Le temps** : est-ce qu'on voit, quelque part, que ce jardin va pousser ?
3. **Le compagnon** : est-ce que l'écran apprend quelque chose, ou propose la prochaine étape avec son pourquoi ?
4. **Le carnet** : est-ce que ça ressemble à un carnet de terrain de Semisto, ou à n'importe quelle app ?
5. **Un niveau plus loin** : quel détail montre qu'on a pensé à la personne avant qu'elle n'en ait besoin ?

Un écran qui échoue à deux de ces questions n'est pas prêt.

## Le niveau d'audace de référence

Le 5 octobre 2026, Michael a jugé une première maquette (une page classique avec un curseur des années) « intéressante mais pas assez créative ». Il a jugé « excellent » le concept suivant : il n'y a plus de page, l'écran est le terrain, et le défilement fait passer trente ans, des saisons à la forêt adulte, jusqu'au recul final sur les jardins-forêts voisins. C'est l'étalon : une proposition qui reste dans la structure habituelle d'un site ou d'une app n'est pas encore au niveau.

- Maquette : https://claude.ai/artifact/ERNV97LHFfjxWz2rF1FZBW
- Dans le code : la page d'accueil (`app/frontend/components/site/timelapse/`).
