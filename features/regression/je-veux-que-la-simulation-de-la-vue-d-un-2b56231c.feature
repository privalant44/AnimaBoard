@wip
Feature: Simulation du rôle

  Scenario: Accès aux modules et vues autorisées
    Given l'administrateur se connecte à l'administration des utilisateur
    When l'administarteur simule un rôle
    Then une nouvelle fenetre du navigateur avec la vue exact de l'application par le rôle et le titre en noir avec écriture blanche : "Simutation du rôle " et le nom du rôle
