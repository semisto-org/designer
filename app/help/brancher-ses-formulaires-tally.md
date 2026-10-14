---
title: "Recevoir les réponses de tes formulaires Tally"
summary: "Pour les équipes : un retour en fin de projet, un suivi à un an… Tes formulaires restent dans Tally, et chaque réponse se range dans les documents de la carte du client."
category: Partager et collaborer
order: 73
---

Un projet se termine et tu veux savoir ce que ton client en a pensé ? Un an après la plantation, tu veux prendre des nouvelles du jardin ? Ces formulaires sont propres à ta façon de travailler : garde-les dans **Tally**, où tu les construis comme tu veux. Designer s'occupe du reste : chaque réponse arrive dans la carte du bon client, à côté de ses plans et de ses photos.

Cette fonction est réservée aux **équipes**. Tout se règle depuis la page de ton équipe, dans **Formulaires**.

## Brancher Tally, une fois pour toute l'équipe

Un administrateur de l'équipe ouvre **Formulaires** et choisit **Créer l'adresse de réception**. Designer lui donne deux choses : une **adresse de webhook** et une **clé de signature**. La clé prouve que les réponses viennent bien de vos formulaires. Garde-la pour l'équipe.

Puis, pour chaque formulaire Tally :

1. Dans Tally, ouvre le formulaire, puis **Integrations** › **Webhooks**. Colle l'adresse et active **Signing secret** avec la clé.
2. Ajoute au formulaire un **champ caché** nommé `carte`. C'est lui qui dit à quelle carte appartient la réponse.
3. Dans Designer, ajoute le formulaire à la liste de l'équipe en collant son lien de partage (`tally.so/r/…`).

Un formulaire qui répond avant d'avoir été ajouté s'ajoute tout seul, sous le nom que Tally lui donne.

## Envoyer un formulaire à un client

Ouvre les **Documents** de la carte du client et choisis **Envoyer un formulaire**. Pour chaque formulaire de l'équipe, Designer prépare un lien déjà rempli pour cette carte : copie-le et colle-le dans ton e-mail. Ton client n'a besoin d'aucun compte.

Une carte peut recevoir autant de formulaires et de réponses que tu veux : le retour en fin de projet, un suivi à un an, une réponse par membre d'un collectif…

## Où arrivent les réponses

Chaque réponse devient un **document de la carte**, étiqueté avec le nom du formulaire et daté. Dans la bibliothèque, l'étagère **Formulaires** les rassemble ; ouvre-en une pour lire chaque question et ce que la personne a répondu. Toute l'équipe la lit, et ton IA aussi, une fois [connectée](/help/connecter-son-ia), pour en faire une synthèse ou préparer la suite.

## Les réponses à rattacher

Si le lien n'indiquait pas de carte de l'équipe (un lien partagé sans passer par la carte, par exemple), la réponse attend dans **Formulaires**, en haut de la liste, marquée **À rattacher**. N'importe quel membre de l'équipe choisit la carte, et elle s'y range. Une réponse mal rangée se déplace de la même façon.

## Bon à savoir

- Les réponses restent dans Designer, dans les documents de la carte : elles ne quittent pas l'outil et ne sont jamais publiées.
- Retirer un formulaire de la liste ne supprime pas les réponses déjà rangées dans les cartes.
- Si la clé a circulé, **Nouvelle adresse** en crée une autre : l'ancienne cesse de fonctionner tout de suite, et il faut la remplacer dans chaque formulaire Tally.
