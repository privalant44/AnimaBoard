Feature:  Gestion des la vue par rôle
 Scenario: l'utilisateur ne voit que ce su'il a le droit de voir
    Given l'utilisateur est habilité    
    When l'utilisateur se connecte
    Then l'utilisateur ne voit que les modules et vues pour lesquels la case est cochée

 Scenario: l'utilisateur en consultation ne voit que son forecast personnel
    Given l'utilisateur est de rôle consultation
    When l'utilisateur se connecte
    Then l'utilisateur ne voit que son forecast personnel avec l'adresse mail qui est connecté croisée avec celle de la ressource
