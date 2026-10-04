# Writes the static error pages served by Rails from public/ (400, 404,
# 406, 422, 500) in French, in the Semisto style. They cannot use the app
# (no database, no assets): plain HTML with inline styles.
#
#   ruby script/error_pages.rb
require "erb"

LOGO = File.read(File.expand_path("../public/icon.svg", __dir__)).sub(/ width="\d+" height="\d+"/, ' width="40" height="40" aria-hidden="true"')

PAGES = {
  "400" => [ "Requête incomprise", "Le navigateur a envoyé une demande que Designer ne comprend pas. Rechargez la page, puis recommencez." ],
  "404" => [ "Page introuvable", "Cette page n'existe pas, ou plus. Vérifiez l'adresse, ou repartez de vos cartes." ],
  "406-unsupported-browser" => [ "Navigateur trop ancien", "Designer a besoin d'un navigateur récent pour afficher la carte. Mettez à jour Chrome, Firefox, Safari ou Edge, puis revenez." ],
  "422" => [ "Modification refusée", "La modification n'a pas été enregistrée, souvent parce que la page était ouverte depuis longtemps. Rechargez la page, puis recommencez." ],
  "500" => [ "Un souci de notre côté", "Quelque chose s'est mal passé sur le serveur. Vos cartes ne sont pas touchées : réessayez dans quelques minutes." ]
}.freeze

TEMPLATE = ERB.new(<<~HTML, trim_mode: "-")
  <!DOCTYPE html>
  <html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title><%= title %> · Semisto Designer</title>
    <link rel="icon" href="/icon.svg" type="image/svg+xml">
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px;
        background: #f7f5f2; color: #1b1712; font: 16px/1.6 "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif; }
      main { width: 100%; max-width: 30rem; background: #fff; border: 1px solid #dbd3c9; border-radius: 16px; padding: 32px 28px; }
      .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1b1712; text-decoration: none; }
      .code { margin: 28px 0 4px; font-size: 13px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #5b5781; }
      h1 { margin: 0 0 8px; font-size: 26px; line-height: 1.25; }
      p { margin: 0; color: #554c3f; }
      nav { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
      a.button { display: inline-block; padding: 9px 16px; border-radius: 10px; font-weight: 500; text-decoration: none; }
      a.primary { background: #5b5781; color: #fff; }
      a.primary:hover { background: #4a4668; }
      a.secondary { border: 1px solid #c3b8aa; color: #1b1712; }
      a.secondary:hover { background: #ede9e3; }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="/"><%= logo %>Semisto Designer</a>
      <p class="code">Erreur <%= code %></p>
      <h1><%= title %></h1>
      <p><%= body %></p>
      <nav>
        <a class="button primary" href="/maps">Mes cartes</a>
        <a class="button secondary" href="/help">Centre d'aide</a>
      </nav>
    </main>
  </body>
  </html>
HTML

PAGES.each do |name, (title, body)|
  code = name.to_i
  logo = LOGO
  File.write(File.expand_path("../public/#{name}.html", __dir__), TEMPLATE.result(binding))
end
