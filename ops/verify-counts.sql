-- Row counts only (no personal data). Run on the original and on the restored database: the numbers must be identical.
select 'migrations applied', count(*) from schema_migrations
union all select 'accounts', count(*) from users
union all select 'projects', count(*) from projects
union all select 'websites', count(*) from sites
union all select 'deployments', count(*) from deployments
union all select 'subscriptions', count(*) from subscriptions
union all select 'module items', count(*) from module_items
order by 1;
