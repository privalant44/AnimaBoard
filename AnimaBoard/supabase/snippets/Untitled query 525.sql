select  TO_CHAR(b.date_mise_a_jour, 'YYYY-MM') AS month, d.label,count(b.id) from besoins b, dictionnaire d 
where b.date_mise_a_jour >='2026-01-01'
and b.type_of = d.code 
and d.table_name = 'opportunities' 
and d.column_name = 'state'
and  TO_CHAR(b.date_mise_a_jour, 'YYYY-MM') = '2026-05'
group by TO_CHAR(b.date_mise_a_jour, 'YYYY-MM'), d.label