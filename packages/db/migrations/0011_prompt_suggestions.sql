alter table prompts add column if not exists normalized_value text;
with normalized as (
  select
    id,
    lower(trim(regexp_replace(regexp_replace(value, '[^a-zA-Z0-9[:space:]]', ' ', 'g'), '[[:space:]]+', ' ', 'g'))) as base_value
  from prompts
), ranked as (
  select
    id,
    base_value,
    row_number() over (partition by project_id, base_value order by created_at, id) as duplicate_number
  from normalized
  join prompts using (id)
)
update prompts
set normalized_value = case
  when ranked.duplicate_number = 1 then ranked.base_value
  else ranked.base_value || ' legacy-duplicate-' || prompts.id::text
end
from ranked
where prompts.id = ranked.id and prompts.normalized_value is null;
alter table prompts alter column normalized_value set not null;
alter table prompts add column if not exists generation_metadata jsonb;
create unique index if not exists prompts_project_normalized_value_idx
  on prompts(project_id, normalized_value);
