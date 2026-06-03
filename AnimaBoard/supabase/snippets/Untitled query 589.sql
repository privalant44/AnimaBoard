select t.month,sum(t.total_days_prod) prod,sum(t.total_days_int) int, count(distinct(t.resource_id)) nb, 
sum(t.total_days_prod) / ( count(distinct(t.resource_id)) * 21 - sum(t.total_days_int))
from 
timesheets_detail t join resources r on  t.resource_id = r.id 
where  
r.type_of in (0,3,10) and
t.month = '2026-01'
group by t.month order by month desc