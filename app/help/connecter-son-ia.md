---
title: "Connecter ton IA"
summary: "Brancher son assistant IA sur ses cartes, pour qu'il les lise et propose des brouillons."
category: L'IA sur la carte
order: 70
---

Semisto Designer est fait pour travailler **avec une IA qui connaît le lieu**. Tu branches ton propre assistant (Claude, ChatGPT, Le Chat de Mistral…) sur tes cartes, par un standard ouvert appelé **MCP** (*Model Context Protocol*). Pas de copier-coller : l'assistant lit directement ta carte.

## Ce que ton IA peut faire

- **Lire** ta carte : son contour, ce que tu as dessiné, les couches du Géoportail, la fiche projet, les plantes de la palette. Cette lecture est incluse avec la carte gratuite.
- **Raisonner** avec toi : lire le relief et le ruissellement, repérer une cuvette, discuter d'un emplacement, d'un choix d'espèces face au climat.
- **Proposer des brouillons** (avec le forfait particulier) : une mare, une haie, un patch de plantes posés sur la carte en brouillon, chacun avec **son explication** : pourquoi ici, avec quelles données.

## Ce que ton IA ne fait jamais seule

**Rien n'est modifié sans ton accord.** Un brouillon reste un brouillon : tu l'acceptes, l'ajustes ou le refuses, élément par élément. Chaque action de l'IA est consignée. Voir [Relire les brouillons de ton IA](/help/relire-les-brouillons-de-l-ia).

## Comment connecter

1. Ouvre [Mon compte](/account) puis **Connecter ton IA**.
2. Suis les étapes de la page : elle te donne l'adresse du serveur MCP et indique comment l'ajouter à ton assistant.
3. Autorise l'accès quand ton assistant te le demande.
4. Dans ton assistant, demande par exemple : « Quelles sont les zones les plus humides de ma carte ? » ou « Propose-moi une haie fruitière le long du chemin ».

## Quels assistants ?

Tout assistant qui accepte un **connecteur MCP personnalisé** avec connexion OAuth se branche seul : tu colles l'adresse, il t'envoie sur Semisto Designer pour autoriser l'accès. Aujourd'hui, c'est le cas de :

- **Claude** (claude.ai, Claude Desktop, Claude Code) ;
- **ChatGPT**, en mode développeur, avec un abonnement payant ;
- **Le Chat** de Mistral ;
- des outils de développement comme **Cursor** ou **VS Code**.

D'autres assistants n'acceptent pas encore de connecteur extérieur (l'app Gemini en Europe, Euria d'Infomaniak) : ils ne peuvent pas lire ta carte pour l'instant. Un outil qui demande une simple clé peut utiliser un **jeton personnel**, à créer sur la même page.

## Tes données et l'IA

- Tu utilises **ton** assistant, avec **ton** compte : Semisto n'envoie rien à un fournisseur d'IA à ta place.
- Ce que ton assistant reçoit est soumis aux conditions du fournisseur que tu as choisi.
- Les réseaux techniques (eau, gaz, électricité, internet) sont **masqués** par défaut pour l'IA.
- Tu peux interrompre la connexion à tout moment.

Voir la [politique de confidentialité](/confidentialite) pour le détail.

## Bien demander

Plus tu donnes de contexte (objectifs, temps disponible, budget, contraintes), meilleures sont les propositions. Complète la [fiche projet](/help/remplir-la-fiche-projet) de ta carte : ton IA la lit.
