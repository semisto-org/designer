# « Nouveautés »: the entries that tell what shipped since the Designer went
# online. Each is created once, by its key: staff edit or unpublish them in
# /admin/release-notes afterwards and a deploy never puts them back.
# Screenshots live next to this file (db/seeds/release_notes/<key>.webp).
release_notes = [
  {
    key: "pendant-l-averse", published_on: "2026-10-16",
    title: "Sous l'averse, note où l'eau court",
    body: <<~TEXT,
      Il pleut fort ? Sors avec ton téléphone : dans l'app Terranova, « Relever », puis « Pendant l'averse ». Trace du doigt où l'eau coule, entoure où elle stagne, touche où elle sort du sol, et ajoute une photo. Même sans réseau.

      Sur l'ordinateur, chaque relevé est comparé au relief : là où l'eau suit l'axe prévu, une baissière la retiendra ; là où elle s'en écarte, un drain, une ornière ou un sol tassé la guide, et ton relevé compte plus que le modèle. Averse après averse, saison après saison, l'eau de ton lieu se raconte.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "Un trait bleu tracé sous la pluie sur la carte, et sa fiche qui dit que l'eau ne suit pas le relief à cet endroit."
  },
  {
    key: "keyline", published_on: "2026-10-16",
    title: "Le keyline : l'eau des vallons vers les croupes",
    body: <<~TEXT,
      Dans « Eau et relief », Terranova cherche les points clés des vallons de ton terrain : là où le fond cesse de descendre raide pour descendre doucement. Chacun vient avec sa keyline, la courbe de niveau qui y passe, à poser d'un geste sur ta carte comme baissière, ligne d'arbres ou décompactage.

      Depuis la keyline, trace ses parallèles au-dessus et en dessous. Elles gardent sa forme et emmènent doucement l'eau vers les croupes, plus sèches. Une baissière agit dès le premier hiver ; une ligne d'arbres prend le relais en 5 à 10 ans.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "Les points clés d'un vallon numérotés sur la carte, avec la keyline en tirets et la liste des points dans le panneau « Eau et relief »."
  },
  {
    key: "test-infiltration", published_on: "2026-10-16",
    title: "Combien ton sol boit-il ? Mesure-le en une heure",
    body: <<~TEXT,
      Une baissière, un jardin de pluie ou une mare se dimensionnent sur ce que boit le sol. Pose un « Test d'infiltration » dans la couche Eau : sa fiche te guide pas à pas, avec un seau, une règle et un chrono qui te dit quand lire la hauteur d'eau.

      La vitesse mesurée devient celle de ta carte : la simulation de pluie en 3D boit à ton rythme autour du test, et chaque baissière te dit en combien d'heures elle se vide. Refais le test dans quelques années pour voir ton sol s'ouvrir sous le jardin-forêt.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "La fiche d'un test d'infiltration : la hauteur d'eau qui baisse au fil des minutes, et la vitesse mesurée."
  },
  {
    key: "bassin-versant-bilan-eau", published_on: "2026-10-16",
    title: "D'où vient l'eau de ta mare, et quand elle manque",
    body: <<~TEXT,
      Une mare se remplit avec toute la pluie qui ruisselle vers elle. Sélectionne une mare, une baissière ou un jardin de pluie : sa surface d'alimentation, son bassin versant, se colorie en bleu sur la carte, et sa fiche te dit combien de pluie suffit à l'emplir et s'il faut soigner son trop-plein.

      Dans le panneau « Climat », le nouveau bilan de l'eau montre mois par mois la pluie, l'eau que les plantes rendent à l'air et la réserve du sol : les mois où l'eau part, ceux où elle manque, aujourd'hui et en 2050. Avec ce que tes citernes, tes toits et tes mares gardent déjà pour l'été.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "Le bassin versant d'une mare colorié en bleu sur la carte, et sa fiche : au moins 1,48 ha drainés, 3 mm de pluie suffisent à l'emplir."
  },
  {
    key: "suivre-la-courbe", published_on: "2026-10-16",
    title: "Une baissière posée pile sur la courbe de niveau",
    body: <<~TEXT,
      Une baissière ne fait boire l'eau au sol que si elle suit exactement la courbe de niveau : un peu de travers, elle devient un fossé. Avec le relief téléchargé, touche un point du terrain et la baissière se pose d'elle-même sur la courbe qui y passe, avec son altitude.

      Le bouton « Suivre la courbe » marche aussi pour les haies, les brise-vent et les cheminements. Et ton IA connectée trace les mêmes courbes avant de te proposer une baissière ou une keyline.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "Une baissière posée sur la courbe de niveau d'un coteau, d'un bord à l'autre du terrain."
  },
  {
    key: "terre-excavee", published_on: "2026-10-16",
    title: "Où va la terre de ta mare ?",
    body: <<~TEXT,
      Chaque trou est aussi un tas. Ta mare, ta baissière, ton fossé ou ton chemin encaissé disent maintenant combien de terre ils vont sortir, en mètres cubes, en brouettes et en camions, avec la terre végétale à part du sous-sol.

      Choisis où chacune va : une butte de la carte (ou dessine-la sur le moment), le bourrelet à côté du trou, étalée sur place, mise en tas ou évacuée. Une flèche couleur de terre montre le chemin sur la carte, et le nouveau panneau « Terres » fait le bilan de ce qui n'a pas encore de destination, avec nos conseils avant de creuser.
    TEXT
    link_path: "/help/gerer-la-terre-excavee", link_label: "Lire l'aide",
    screenshot_alt: "Le panneau « Terres » : 74 m³ à sortir, dont 32 m³ sans destination, et sur la carte les flèches de la mare vers la butte et du chemin creux vers la prairie."
  },
  {
    key: "nuit-air-froid", published_on: "2026-10-15",
    title: "La nuit dans la vue 3D : où glisse l'air froid",
    body: <<~TEXT,
      Par nuit claire et sans vent, l'air se refroidit au contact du sol, devient plus lourd et glisse vers le bas, quel que soit le vent. Le nouvel onglet « Nuit » de la vue 3D le montre sur ton terrain, de 21 h à l'aube : la brume qui descend les pentes, la nappe d'air froid qui s'épaissit dans les fonds, et le sol qui blanchit là où le givre se forme en premier.

      Tes haies et tes bâtiments retiennent l'air froid au-dessus d'eux. De quoi garder tes floraisons précoces hors des poches de gel. Et pour ne plus perdre le nord en tournant, une rose des vents suit la caméra : un clic remet la vue face au nord.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "Un vallon vers 4 h 30 : la brume glisse sur les pentes et une nappe d'air froid de 5 m remplit le fond."
  },
  {
    key: "bruxelles-flandre", published_on: "2026-10-15",
    title: "Bruxelles et la Flandre, avec leurs photos aériennes et le cadastre",
    body: <<~TEXT,
      Ton terrain est à Bruxelles ou en Flandre ? Ta carte s'ouvre maintenant sur la photo aérienne de ta région, et tu choisis tes parcelles d'un clic sur le plan cadastral, comme en Wallonie.

      En Flandre, remonte le temps : la photo d'hiver la plus récente, où l'on voit le sol sous les arbres nus, celle de l'été 2024, celle de 1971, et la carte de Ferraris dessinée vers 1777. Le relief ombré du LiDAR révèle les talus et les anciens fossés, et la carte des sols dit ce qu'il y a sous tes pieds. À Bruxelles, compare la photo d'aujourd'hui à celle de 2004.
    TEXT
    link_path: "/help/lire-les-couches-du-geoportail", link_label: "Lire l'aide",
    screenshot_alt: "Un jardin près de Gand : le plan cadastral sur la photo aérienne, et la parcelle 416D, section A, choisie comme terrain."
  },
  {
    key: "acces-rapide", published_on: "2026-10-14",
    title: "Saute d'une carte à l'autre avec ⌘J",
    body: <<~TEXT,
      Où que tu sois dans le Designer, même au milieu d'une carte, tape ⌘J sur un Mac (Ctrl+J sur Windows) : un champ s'ouvre au centre. Écris quelques lettres, « wal » trouve Walhain, et Entrée t'y emmène. Les cartes que tu viens d'ouvrir passent en premier, une faute de frappe ou des initiales (« jfg ») suffisent.

      À côté, le terrain de la carte choisie pousse sous tes yeux jusqu'à l'an 30, avec sa prochaine étape. Le même champ ouvre aussi les pages (« tâches », « plantes »…) ou crée une carte au nom que tu viens de taper. Sur téléphone, c'est la loupe du menu.
    TEXT
    link_path: "/maps", link_label: "Ouvrir mes cartes",
    screenshot_alt: "L'accès rapide ouvert : « wal » trouve Walhain, dont le terrain s'affiche à droite avec sa prochaine étape."
  },
  {
    key: "formulaires-tally", published_on: "2026-10-14",
    title: "Les réponses de tes formulaires Tally, rangées dans la carte",
    body: <<~TEXT,
      Un retour en fin de projet, un suivi à un an… Tes formulaires restent dans Tally, et Designer range chaque réponse dans les documents de la carte du client.

      Branche Tally une fois pour toute l'équipe, puis envoie le formulaire depuis le nouvel onglet « Formulaires » de la carte : le lien est déjà rempli pour ce client, et ses réponses y arrivent. Toute l'équipe les lit, et ton IA aussi.
    TEXT
    link_path: "/help/brancher-ses-formulaires-tally", link_label: "Lire l'aide",
    screenshot_alt: "Une réponse au formulaire « Retour en fin de projet », ouverte dans les documents de la carte."
  },
  {
    key: "palette-gustative", published_on: "2026-10-13",
    title: "La palette gustative dans la fiche projet",
    body: <<~TEXT,
      La fiche projet a une nouvelle section : la palette gustative. Chaque personne du projet y ajoute sa ligne, enfants compris : les fruits qu'elle adore, ceux qu'elle n'aime pas, ses préférés et ses allergies. Puis vient ce que vous ferez des récoltes : croquer au jardin, confitures, cidre, tisanes…

      Les porteur·euse·s de projet la remplissent aussi depuis leur lien privé. Deux champs restent réservés à l'équipe : les familles à privilégier dans la palette et la lecture du designer.
    TEXT
    link_path: "/help/remplir-la-fiche-projet", link_label: "Lire l'aide",
    screenshot_alt: "La palette gustative : les fruits que Michael adore en vert, ceux qu'il n'aime pas en rouge, ses fruits préférés et ses allergies."
  },
  {
    key: "formulaire-demande", published_on: "2026-10-13",
    title: "Un formulaire pour recevoir tes demandes de projet",
    body: <<~TEXT,
      Tu conçois des jardins-forêts pour d'autres ? Partage le lien de ton formulaire de demande : tes futurs clients situent leur lieu, touchent leurs parcelles sur la carte et te disent ce qu'ils attendent.

      La demande t'arrive dans « Demandes » avec le contour déjà tracé. Un clic sur « Créer la carte », et tu prépares l'appel, la visite et l'offre sur le vrai terrain.
    TEXT
    link_path: "/help/formulaire-de-demande", link_label: "Lire l'aide",
    screenshot_alt: "Le formulaire de demande : l'adresse du lieu, puis la carte où l'on touche ses parcelles."
  },
  {
    key: "meteo-maintenant", published_on: "2026-10-13",
    title: "Le temps qu'il fait sur ton terrain, maintenant",
    body: <<~TEXT,
      En bas à droite de la carte, à côté de « Sources de la carte », la température et l'humidité relevées il y a quelques minutes par la station la plus proche. Survole-les pour savoir quelle station et à quelle distance ; clique pour ouvrir le climat du lieu.

      Au-dessus de 30 °C ou sous 30 % d'humidité, elles passent en rouge : c'est le moment de penser à l'arrosage des jeunes plants.
    TEXT
    link_path: "/help/stations-meteo-proches", link_label: "Lire l'aide",
    screenshot_alt: "La température et l'humidité du moment sur la carte, avec la station qui les a mesurées."
  },
  {
    key: "ia-fichiers-taches", published_on: "2026-10-13",
    title: "Ton IA range tes tâches, tes documents et tes photos",
    body: <<~TEXT,
      Ton assistant IA peut maintenant tenir le carnet de l'équipe avec toi : ajouter et cocher des tâches, lire tes documents (plans, analyses de sol, rapports), ranger un compte rendu dans la bibliothèque, légender et classer tes photos.

      Il sait aussi envoyer directement des fichiers sur ta carte, ou les faire venir depuis un lien. Le dessin de la carte, lui, reste en brouillons que tu acceptes un par un.
    TEXT
    link_path: "/help/connecter-son-ia", link_label: "Connecter ton IA"
  },
  {
    key: "constructeur-offre", published_on: "2026-10-12",
    title: "Chiffre ton offre depuis la carte",
    body: <<~TEXT,
      Pour les pros et les équipes : le constructeur d'offre calcule le design et la plantation à partir de ce que la carte mesure, avec ton propre barème. Une jauge te dit si le budget est un ordre de grandeur ou déjà précis, et ce qui manque pour l'affiner.

      Enregistre des versions V1, V2… et montre la part du budget qui va au jardin lui-même. Il apparaît quand tu choisis un compte pro dans « Mon compte ».
    TEXT
    link_path: "/help/chiffrer-une-offre", link_label: "Lire l'aide",
    screenshot_alt: "Le constructeur d'offre : le périmètre mesuré sur la carte et la jauge « Précision du budget »."
  },
  {
    key: "taches", published_on: "2026-10-11",
    title: "Les tâches de ton projet, saison après saison",
    body: <<~TEXT,
      Chaque carte a sa page « Tâches » : quatre listes pour observer, cartographier, concevoir et planter, déjà garnies de ce qu'il faut faire et pourquoi. Confie une tâche à quelqu'un, donne-lui une échéance : la personne reçoit un e-mail.

      « L'année du projet » montre les tâches mois par mois, avec la saison de plantation. Et la page « Tâches » du menu rassemble celles de toutes tes cartes.
    TEXT
    link_path: "/tasks", link_label: "Voir mes tâches",
    screenshot_alt: "La page « Tâches » d'une carte : l'année du projet mois par mois, puis la liste « Observer le lieu »."
  },
  {
    key: "photos-documents", published_on: "2026-10-11",
    title: "Tes photos et tes documents, en pleine page",
    body: <<~TEXT,
      En haut de l'éditeur, passe de la carte à la fiche projet, aux photos ou aux documents. Les photos se rangent par saison ou par album ; la bibliothèque « Documents » garde plans, relevés, analyses de sol et permis, rangés par étiquette, avec un aperçu des images et des PDF, même sur téléphone.

      Un PDF lourd est allégé tout seul après l'envoi, jusqu'à 200 Mo par fichier.
    TEXT
    link_path: "/help/rassembler-ses-documents", link_label: "Lire l'aide",
    screenshot_alt: "La bibliothèque « Documents » d'une carte, rangée par étiquette, avec l'aperçu d'une analyse de sol."
  },
  {
    key: "mettre-en-image", published_on: "2026-10-10",
    title: "Esquisse sur une photo, puis vois-la pousser",
    body: <<~TEXT,
      Ouvre une photo de ton terrain et choisis « Esquisser » : quelques traits suffisent pour montrer un sentier, des fruitiers, une mare. Ça marche aussi au doigt ou au stylet sur iPad.

      Puis touche la baguette magique « Mettre en image » : ton esquisse est peinte telle qu'elle pourrait être dans quelques années, en photo, en aquarelle ou au crayon. Compare avant et après d'un glissement.
    TEXT
    link_path: "/help/esquisser-et-mettre-en-image", link_label: "Lire l'aide",
    screenshot_alt: "Avant / après : une photo de drone esquissée à gauche, la même peinte à l'aquarelle à droite."
  },
  {
    key: "bioindicatrices-photo", published_on: "2026-10-10",
    title: "Les plantes sauvages lues sur une photo",
    body: <<~TEXT,
      Les plantes qui poussent seules racontent ton sol. Dans « Sol », onglet « Plantes », photographie un coin de terrain et fais-le lire par ton IA : elle reconnaît les plantes de toute la photo et te dit ce qu'elles révèlent. Tu gardes ou refuses chacune.

      Pour une seule plante de près, Pl@ntNet propose l'espèce. Depuis l'app, ça marche aussi hors ligne.
    TEXT
    link_path: "/help/analyser-son-sol", link_label: "Lire l'aide",
    screenshot_alt: "Le panneau « Sol », onglet « Plantes » : les espèces proposées pour une photo, chacune à confirmer."
  },
  {
    key: "photos-drone", published_on: "2026-10-10",
    title: "Tes photos de drone racontent leur prise de vue",
    body: <<~TEXT,
      Une photo prise au drone dit maintenant à quelle hauteur elle a été prise, avec quel angle, et quelle surface de terrain elle couvre vue du dessus. De quoi refaire la même photo l'an prochain, et voir ton jardin pousser.

      Les grandes photos s'affichent plus vite, et l'on passe de l'une à l'autre d'un glissement du doigt.
    TEXT
    link_path: "/help/photos-et-suivi-dans-le-temps", link_label: "Lire l'aide",
    screenshot_alt: "Une vue du dessus prise au drone, avec la hauteur, l'angle et la surface couverte."
  },
  {
    key: "lieu-six-sources", published_on: "2026-10-09",
    title: "Ton terrain lu par six sources ouvertes",
    body: <<~TEXT,
      Dans « Observer », de nouveaux outils lisent ton lieu pour toi : la course du soleil et la ligne des collines vues depuis ton terrain, ce que les stations météo proches ont mesuré ces derniers jours, trente ans de climat observé à l'endroit même de ta parcelle, et la hauteur des arbres déjà en place.

      En France, « Règles et risques » dit aussi ce que le PLU, les zones inondables ou les argiles disent de ton terrain. De quoi savoir où planter avant de dessiner.
    TEXT
    link_path: "/help/le-soleil-et-l-horizon", link_label: "Lire l'aide",
    screenshot_alt: "Le panneau « Soleil » : la course du soleil au solstice d'hiver, à l'équinoxe et au solstice d'été au-dessus de la ligne des collines."
  },
  {
    key: "lien-fiche-projet", published_on: "2026-10-07",
    title: "Un lien privé pour remplir la fiche projet",
    body: <<~TEXT,
      Tu conçois pour quelqu'un d'autre ? Depuis la fiche projet, crée un lien privé et envoie-le aux porteur·euse·s du projet. Ils et elles répondent aux questions sans compte et sans voir la carte ; tout s'enregistre au fil de l'eau dans ta fiche.

      Un clic sur « J'ai terminé » te prévient par e-mail. Tu peux changer l'adresse du lien ou le couper à tout moment.
    TEXT
    link_path: "/help/remplir-la-fiche-projet", link_label: "Lire l'aide",
    screenshot_alt: "Le formulaire de la fiche projet tel que le voit la personne qui a reçu le lien."
  },
  {
    key: "deplacer-plant", published_on: "2026-10-06",
    title: "Déplacer un arbre déjà posé",
    body: <<~TEXT,
      Un pommier posé un peu trop près de la haie ? Ouvre sa fiche et choisis « Déplacer » : tu le glisses à sa nouvelle place, sans le supprimer ni perdre ce que tu as noté sur lui.

      Pour un patch ou une zone, « Modifier la forme » ajuste ses contours de la même façon.
    TEXT
    screenshot_alt: "La fiche d'un arbre sur la carte, avec le bouton « Déplacer »."
  },
  {
    key: "photos-heic", published_on: "2026-10-06",
    title: "Les photos de ton iPhone passent telles quelles",
    body: <<~TEXT,
      Les photos HEIC prises avec un iPhone étaient refusées. Elles sont maintenant converties à l'import, en gardant leur date et leur position GPS : elles se rangent au bon endroit de la carte, comme les autres.

      Ça vaut aussi pour les observations de tes plantes et pour l'identification d'une espèce par photo.
    TEXT
    link_path: "/help/photos-et-suivi-dans-le-temps", link_label: "Lire l'aide"
  },
  {
    key: "fiche-projet-ia", published_on: "2026-10-06",
    title: "Ton IA t'aide à remplir la fiche projet",
    body: <<~TEXT,
      Raconte ton projet à ton assistant IA, ou confie-lui le transcript d'un entretien : il propose des réponses pour ta fiche projet. Chacune attend sous sa question, avec la phrase qui l'a inspirée.

      Rien n'entre dans ta fiche tant que tu ne l'as pas acceptée, une à une ou toutes ensemble.
    TEXT
    link_path: "/help/connecter-son-ia", link_label: "Connecter ton IA",
    screenshot_alt: "La fiche projet avec les réponses proposées par Claude, chacune à accepter ou à refuser."
  },
  {
    key: "editeur-etapes", published_on: "2026-10-06",
    title: "L'éditeur suit les quatre étapes de ton jardin-forêt",
    body: <<~TEXT,
      Les outils de la carte sont rangés sous les quatre étapes : observer, cartographier, concevoir, planter. Les étapes s'affichent en haut de l'écran, et « À faire maintenant » te dit quelle est la prochaine tâche, et pourquoi.

      Besoin de place pour la carte ? Le rail se réduit en icônes et s'en souvient.
    TEXT
    link_path: "/help/le-parcours-en-quatre-etapes", link_label: "Lire l'aide",
    screenshot_alt: "L'éditeur de carte : les outils rangés par étape à gauche, les quatre étapes en haut, « À faire maintenant » en bas."
  },
  {
    key: "etiquettes", published_on: "2026-10-06",
    title: "Des étiquettes sur tes éléments",
    body: <<~TEXT,
      Pose tes propres étiquettes sur les plantes, les structures ou les réseaux : « Phase 1 », « Haie nord », « Verger »… Dans « Éléments » et dans la liste de plants, filtre par étiquette ou groupe tout d'un clic.

      Pratique pour planter en plusieurs saisons, ou pour préparer la commande d'une seule zone.
    TEXT
    link_path: "/help/etiqueter-ses-elements", link_label: "Lire l'aide",
    screenshot_alt: "Le panneau « Éléments » groupé par étiquette : Haie nord, Phase 1, Phase 2, Verger."
  },
  {
    key: "carnet-de-route", published_on: "2026-10-06",
    title: "Un carnet de route pour bien démarrer",
    body: <<~TEXT,
      À la première ouverture d'une carte, un carnet de route te montre en quelques pages comment un jardin-forêt se conçoit : observer, cartographier, concevoir, planter. Un terrain d'exemple y pousse sous tes yeux, du terrain nu à la forêt de trente ans.

      Et à la fin, il te dit ce que ton IA saurait déjà de ton lieu.
    TEXT
    link_path: "/help/le-parcours-en-quatre-etapes", link_label: "Lire l'aide",
    screenshot_alt: "La dernière page du carnet de route : le jardin-forêt d'exemple à trente ans, peint à l'aquarelle."
  },
  {
    key: "fonds-de-plan", published_on: "2026-10-06",
    title: "Glisse ton esquisse sous la carte",
    body: <<~TEXT,
      Dans « Fonds de plan », importe une esquisse, un plan scanné ou une page de PDF, puis cale-la sur le terrain à la souris : glisse pour la déplacer, tire un coin pour l'agrandir, la poignée ronde pour la tourner.

      Règle son opacité et redessine par-dessus, au bon endroit.
    TEXT
    link_path: "/help/caler-un-fond-de-plan", link_label: "Lire l'aide",
    screenshot_alt: "Un plan dessiné à la main, posé en transparence sur la photo aérienne et en cours de calage."
  },
  {
    key: "batiments-3d", published_on: "2026-10-05",
    title: "Les bâtiments en volume dans la vue 3D",
    body: <<~TEXT,
      Dans la vue en relief, les bâtiments autour de ton terrain se dressent en volumes, à leur vraie hauteur quand elle est connue, au milieu des arbres.

      Tu vois mieux d'où viendra l'ombre, et où le soleil manquera.
    TEXT
    link_path: "/help/lire-le-relief-et-l-eau", link_label: "Lire l'aide",
    screenshot_alt: "La vue en relief d'un terrain, avec les bâtiments en volumes et les arbres."
  },
  {
    key: "sources-eau", published_on: "2026-10-05",
    title: "D'où vient ton eau ?",
    body: <<~TEXT,
      Le panneau « Sources d'eau » liste d'où vient l'eau de ton lieu : puits, eau de pluie, source… potable ou non.

      Chaque robinet dessiné sur la carte dit de quelle source il vient, et s'il est potable.
    TEXT
    screenshot_alt: "Le panneau « Sources d'eau » avec les sources du lieu et leurs robinets."
  },
  {
    key: "situation-projetee", published_on: "2026-10-05",
    title: "Ta carte d'aujourd'hui, ou celle de demain",
    body: <<~TEXT,
      Deux boutons en haut de la carte : « Actuelle » montre ce qui est déjà planté, « Projetée » ajoute ce que tu prévois de planter, en pointillés.

      Un coup d'œil suffit pour voir ce qui reste à faire.
    TEXT
    screenshot_alt: "Une carte en situation projetée : les arbres en projet en pointillés à côté de ceux déjà plantés."
  },
  {
    key: "designer-en-ligne", published_on: "2026-10-04",
    title: "Le Designer est semé",
    body: <<~TEXT,
      Le Designer est en ligne : un carnet de terrain pour cartographier ton lieu et y concevoir ton jardin-forêt, avec le savoir de Semisto et, si tu veux, ton IA.

      Merci d'en faire partie dès les premiers jours. Dis-nous ce qui te plaît d'un pouce levé : c'est ce qui nous aide à choisir ce qui pousse ensuite.
    TEXT
    link_path: "/maps", link_label: "Ouvrir mes cartes"
  }
]

screenshots = Rails.root.join("db/seeds/release_notes")
created = 0
release_notes.each do |entry|
  next if ReleaseNote.exists?(key: entry[:key])
  published_on = Date.parse(entry[:published_on])
  # Noon on that day, or now when the seed runs earlier that day.
  published_at = [ published_on.in_time_zone("Europe/Brussels").change(hour: 12), Time.current ].min
  note = ReleaseNote.new(entry.merge(published_on:, published_at:))
  file = screenshots.join("#{entry[:key]}.webp")
  note.screenshot.attach(io: File.open(file), filename: file.basename.to_s, content_type: "image/webp") if file.exist?
  note.save!
  created += 1
end
puts "Release notes: #{created} created" if created.positive?
