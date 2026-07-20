@wip
Feature: Je veux avoir une représentation graphique des chiffres de la page d'accueil ...

  Scenario: avoir une représentation graphique des chiffres de la page d
    Given un contexte utilisateur valide
    When avoir une représentation graphique des chiffres de la page d'accueil avec la possibilité d'avoir le détail sous forme de tableaux
    Then le résultat attendu est visible
