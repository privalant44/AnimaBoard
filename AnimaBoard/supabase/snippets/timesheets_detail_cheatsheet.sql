-- ============================================================
-- TIMESHEETS_DETAIL - mémo d'utilisation
-- ============================================================
-- Rappel:
--   delivery_id = 0   -> ligne de synthèse mensuelle (par ressource)
--   delivery_id <> 0  -> lignes détaillées par prestation (production)
--
-- Pour éviter les doublons de total_days_prod:
--   ne jamais sommer sans filtre delivery_id selon le besoin.

-- 1) Synthèse mensuelle par ressource (prod + interne)
select
  month,
  resource_id,
  resource_name,
  sum(total_days_prod) as prod_days,
  sum(total_days_int) as int_days
from timesheets_detail
where month between '2026-01' and '2026-12'
  and delivery_id = 0
group by month, resource_id, resource_name
order by month, resource_name;

-- 2) Détail par prestation (production uniquement)
select
  month,
  resource_id,
  resource_name,
  delivery_id,
  sum(total_days_prod) as prod_days
from timesheets_detail
where month between '2026-01' and '2026-12'
  and delivery_id <> 0
group by month, resource_id, resource_name, delivery_id
order by month, resource_name, delivery_id;

-- 3) Synthèse mensuelle + absences (jointure externe correcte)
with abs_by_resource_month as (
  select
    resource_id,
    month,
    sum(days) as abs_days
  from absence
  group by resource_id, month
)
select
  t.month,
  t.resource_id,
  t.resource_name,
  sum(t.total_days_prod) as prod_days,
  sum(t.total_days_int) as int_days,
  coalesce(max(a.abs_days), 0) as abs_days
from timesheets_detail t
left join abs_by_resource_month a
  on a.resource_id = t.resource_id
 and a.month = t.month
where t.month between '2026-01' and '2026-12'
  and t.delivery_id = 0
group by t.month, t.resource_id, t.resource_name
order by t.month, t.resource_name;

-- 4) Contrôle anti-doublon (écart attendu = 0)
-- Si ce contrôle renvoie des lignes, une requête aval mélange peut-être
-- la synthèse (delivery_id=0) et le détail (delivery_id<>0) sans filtre.
with monthly as (
  select
    month,
    resource_id,
    sum(case when delivery_id = 0 then total_days_prod else 0 end) as prod_summary,
    sum(case when delivery_id <> 0 then total_days_prod else 0 end) as prod_detail
  from timesheets_detail
  where month between '2026-01' and '2026-12'
  group by month, resource_id
)
select
  month,
  resource_id,
  prod_summary,
  prod_detail,
  (prod_summary - prod_detail) as delta
from monthly
where abs(prod_summary - prod_detail) > 0.0001
order by month, resource_id;

