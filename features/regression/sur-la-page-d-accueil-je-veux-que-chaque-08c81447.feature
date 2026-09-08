@wip
Feature: sur la page d'accueil, je veux que chaque graphique et rapport soit dans des ...

  Scenario: la connexion à la page d'accueil
    Given la connaxion à la page d'accueil
    When l'utilisateur arrive sur la pgae d'accueil
    Then il voit 3 graphiques dans 3 zones sur 2 colonnes avec la possibilité de voir le tableau détaillé du graphique
    And le statut du batch est indiqué par un statut en bas du menu dépliable
