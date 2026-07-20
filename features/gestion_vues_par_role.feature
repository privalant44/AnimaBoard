# language: fr
Fonctionnalité: Gestion des vues par rôle
  En tant qu'administrateur ou utilisateur habilité
  Je veux voir uniquement les modules et vues autorisés pour mon rôle
  Afin de respecter les droits d'accès définis dans l'administration

  Scénario: l'utilisateur ne voit que ce qu'il a le droit de voir
    Étant donné l'utilisateur est habilité avec le rôle "commercial"
    Et le rôle "commercial" a les permissions "view:home:financial, view:forecast:personal"
    Quand l'utilisateur se connecte
    Alors l'utilisateur ne voit que les modules et vues "view:home:financial, view:forecast:personal"
    Et l'utilisateur ne voit pas la vue "view:home:besoins"
    Et l'utilisateur ne voit pas l'onglet "settings"

  Scénario: l'utilisateur en consultation ne voit que son forecast personnel
    Étant donné l'utilisateur est de rôle consultation
    Et la ressource "42" a l'adresse mail "consultant@animaneo.fr"
    Et une autre ressource "99" a l'adresse mail "autre@animaneo.fr"
    Quand l'utilisateur "consultant@animaneo.fr" se connecte
    Alors l'utilisateur ne voit que son forecast personnel
    Et l'utilisateur ne voit pas le bouton scénarios forecast
