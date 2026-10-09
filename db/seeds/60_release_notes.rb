# « Nouveautés »: the entries that tell what shipped since the Designer went
# online. Each is created once, by its key: staff edit or unpublish them in
# /admin/release-notes afterwards and a deploy never puts them back.
# Screenshots live next to this file (db/seeds/release_notes/<key>.webp).
release_notes = [
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
