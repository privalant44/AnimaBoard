
-- 3. Vérifier les ressources dans deliveries qui ne sont pas dans resources
SELECT DISTINCT d.resource_id, d.resource_first_name, d.resource_last_name
FROM deliveries d
LEFT JOIN resources r ON d.resource_id = r.id
WHERE r.id IS NULL AND d.resource_id IS NOT NULL;