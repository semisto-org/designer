---
title: "Recevoir les réponses de tes formulaires Tally"
summary: "Pour les équipes : un retour en fin de projet, un suivi à un an… Tes formulaires restent dans Tally, et chaque réponse se range dans la carte du client, sous « Formulaires »."
category: Partager et collaborer
order: 73
---

Un projet se termine et tu veux savoir ce que ton client en a pensé ? Un an après la plantation, tu veux prendre des nouvelles du jardin ? Ces formulaires sont propres à ta façon de travailler : garde-les dans **Tally**, où tu les construis comme tu veux. Terranova s'occupe du reste : chaque réponse arrive dans la carte du bon client, à côté de ses plans et de ses photos.

Cette fonction est réservée aux **équipes**. Tout se règle depuis la page de ton équipe, dans **Formulaires**.

## Brancher Tally, une fois pour toute l'équipe

Un administrateur de l'équipe ouvre **Formulaires** et choisit **Créer l'adresse de réception**. Terranova lui donne deux choses : une **adresse de webhook** et une **clé de signature**. La clé prouve que les réponses viennent bien de vos formulaires. Garde-la pour l'équipe.

Puis, pour chaque formulaire Tally :

1. Dans Tally, ouvre le formulaire, puis **Integrations** › **Webhooks**. Colle l'adresse et active **Signing secret** avec la clé.
2. Ajoute au formulaire un **champ caché** nommé `carte`. C'est lui qui dit à quelle carte appartient la réponse.
3. Dans Terranova, ajoute le formulaire à la liste de l'équipe en collant son lien de partage (`tally.so/r/…`).

Un formulaire qui répond avant d'avoir été ajouté s'ajoute tout seul, sous le nom que Tally lui donne.

## Envoyer un formulaire à un client

Chaque carte de l'équipe a un onglet **Formulaires**, à côté des Documents. Sous **Envoyer un formulaire**, Terranova prépare pour chaque formulaire de l'équipe un lien déjà rempli pour cette carte : copie-le et colle-le dans ton e-mail. Ton client n'a besoin d'aucun compte. **Aperçu** ouvre le formulaire tel que ton client le verra.

Une carte peut recevoir autant de formulaires et de réponses que tu veux : le retour en fin de projet, un suivi à un an, une réponse par membre d'un collectif…

## Où arrivent les réponses

Les réponses arrivent dans l'onglet **Formulaires** de la carte, la plus récente en haut et déjà ouverte : chaque question, puis ce que la personne a répondu. Tous ceux qui ont accès à la carte les lisent ; seuls ses éditeurs voient les liens à envoyer.

Chaque réponse devient aussi un **document de la carte**, étiqueté avec le nom du formulaire et daté, que l'étagère **Formulaires** de la bibliothèque rassemble. Ton IA la lit donc aussi, une fois [connectée](/help/connecter-son-ia), pour en faire une synthèse ou préparer la suite.

## Les réponses à rattacher

Si le lien n'indiquait pas de carte de l'équipe (un lien partagé sans passer par la carte, par exemple), la réponse attend dans **Formulaires**, en haut de la liste, marquée **À rattacher**. N'importe quel membre de l'équipe choisit la carte, et elle s'y range. Une réponse mal rangée se déplace de la même façon.

## Bon à savoir

- Les réponses restent dans Terranova, avec la carte : elles ne quittent pas l'outil et ne sont jamais publiées. Un témoignage que ton client accepte de voir publié, c'est toi qui le reprends à la main.
- Retirer un formulaire de la liste ne supprime pas les réponses déjà rangées dans les cartes.
- Si la clé a circulé, **Nouvelle adresse** en crée une autre : l'ancienne cesse de fonctionner tout de suite, et il faut la remplacer dans chaque formulaire Tally.
