---
title: "Travailler avec la collègue IA"
summary: "Une collègue IA dans l'équipe : la mentionner dans une discussion, lui confier une tâche, relire ce qu'elle propose."
category: Partager et collaborer
order: 74
---

Une équipe peut accueillir une **collègue IA** : une généraliste formée à la méthode de Semisto, qui connaît les cartes de l'équipe et travaille quand on le lui demande. Elle propose, tu décides.

Pour l'instant, la collègue IA est en **pilote** : Semisto l'ouvre équipe par équipe.

## Lui demander quelque chose

- **Dans une discussion** : écris « @ » suivi de son prénom, puis ta demande. « @Léa, que proposes-tu comme haie brise-vent au nord ? » Elle répond dans le même fil, en quelques minutes au plus.
- **Dans les tâches** : confie-lui une tâche, comme à n'importe quel membre. Elle fait ce qu'elle peut, écrit son **compte rendu** dans la discussion de la carte (ce qu'elle propose, pourquoi, ce qu'il reste à vérifier sur le terrain), puis **te rend la tâche**. C'est toi qui la coches.

Seuls les membres de l'équipe peuvent la solliciter. Un client ou un invité de la carte lit ses messages, sans pouvoir lui écrire.

## La reconnaître

Ses messages portent toujours la pastille **IA** et la mention « à la demande de… » : on sait qui lui a demandé quoi. Elle ne se réveille jamais toute seule.

## Ce qu'elle fait, ce qu'elle ne fait pas

Sur la carte, elle ne pose que des **brouillons**, chacun avec son pourquoi : une personne les accepte, les ajuste ou les refuse, un par un. [Relire les brouillons de l'IA](/help/relire-les-brouillons-de-l-ia) explique comment.

Elle peut créer et modifier des tâches, écrire un document de la carte, lire le terrain, ses couches, la fiche projet, la palette, les observations.

Elle ne fait jamais ceci :

- accepter ses propres brouillons, cocher une tâche, supprimer un document ou une photo ;
- écrire à quelqu'un hors de l'équipe (pas d'e-mail, pas d'offre envoyée) ;
- lire les réseaux (eau, gaz, électricité, câbles), les photos elles-mêmes ou les données personnelles de la fiche projet ;
- noter des heures, des kilomètres ou des dépenses.

Et elle te dira toujours **ce qu'il faut aller vérifier sur place** avant de décider : la pente à un endroit, une zone humide en février, l'ombre d'un arbre voisin. Son avis ne remplace pas une visite.

## Pour les admins de l'équipe

Sa page se trouve dans l'équipe, à la ligne « Collègue IA » de la liste des membres.

- **Sa fiche** : son prénom, et les consignes de l'équipe (le ton, vos habitudes). Elles complètent la fiche de base de Semisto, qui fixe son métier et ses limites et ne se retire pas.
- **La clé** : elle réfléchit avec Claude, d'Anthropic, grâce à la clé API de l'équipe. C'est l'équipe qui paie ce qu'elle consomme, directement à Anthropic ; Terranova n'ajoute rien. Un abonnement Claude Team ne donne pas de clé : elle se crée sur console.anthropic.com. La clé est chiffrée et n'est plus jamais affichée.
- **Le plafond mensuel** : au plafond, elle s'arrête, le dit en clair et rend la tâche. La jauge montre où en est le mois.
- **Les cartes** : elle n'est active sur **aucune carte par défaut**. Active-la carte par carte ; les personnes de la carte le voient en haut de la discussion. Si un client ne veut pas d'IA sur son projet, laisse simplement sa carte inactive.
- **Son journal** : chaque demande, qui l'a faite, sur quelle carte, ce que ça a coûté. Le texte des échanges avec le modèle n'est pas gardé.

## Ce qui part chez le fournisseur

Quand elle travaille sur une carte, ce qu'elle lit pour répondre (le terrain, les éléments, la fiche projet sans ses données personnelles, les messages du fil) est envoyé à Anthropic avec la clé de l'équipe, le temps de la réponse. Les réseaux et les images ne partent jamais. Sur une carte où elle n'est pas active, rien ne part.
