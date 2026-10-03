# Semisto Designer

Cartographiez votre terrain avec précision, puis concevez votre jardin-forêt ou votre design permaculturel avec une IA qui connaît le lieu, ses données et vos objectifs.

Un projet de [Semisto](https://www.semisto.org), sous licence [AGPL-3.0](LICENSE). Hébergé sur [designer.semisto.org](https://designer.semisto.org).

## Développer

Prérequis : Ruby 3.3, Node 22, PostgreSQL 16 avec PostGIS.

```sh
bundle install
npm install
bin/rails db:prepare db:seed
bin/dev            # Vite
bin/rails s        # Rails, sur http://localhost:3000
```

En développement, `/dev/login?email=vous@exemple.org` vous connecte sans e-mail.

Tests : `bin/rails test` et `npx tsc -p tsconfig.app.json`.

Les conventions du code (en anglais) sont dans [CLAUDE.md](CLAUDE.md).

## Licences

Code : AGPL-3.0. Le code repris de [Claudy](https://github.com/les4sources/claudy) garde sa mention MIT (© Fondation Les 4 Sources).
