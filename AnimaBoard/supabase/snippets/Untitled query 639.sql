-- Ressources dans deliveries qui n'existent pas dans resources
SELECT DISTINCT d.resource_id, d.id 
FROM deliveries d
LEFT JOIN resources r ON r.id = d.resource_id
WHERE r.id IS NULL AND d.resource_id IS NOT NULL;