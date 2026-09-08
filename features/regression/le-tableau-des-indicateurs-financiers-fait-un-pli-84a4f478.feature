@wip @financial-quarters
Feature: le tableau des indicateurs financiers fait un plié / déplié sur les trimestres

  Scenario: l'utilisateur utilise la fonctionnalité
    Given un contexte utilisateur valide
    When l'utilisateur replie et déplie un trimestre du tableau financier
    Then les colonnes mensuelles et trimestrielles reflètent l'état du trimestre
