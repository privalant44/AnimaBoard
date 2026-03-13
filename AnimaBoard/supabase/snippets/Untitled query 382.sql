select a.month,a.total_days, a.delivery_id, p.title
from public.timesheets_detail a
full join public.deliveries p
on a.delivery_id = p.id 
where a.resource_name like '%PAPOT%' and (a.month = '2026-01'or a.month='2026-02')  limit 100;