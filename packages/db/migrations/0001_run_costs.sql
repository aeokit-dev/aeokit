alter table prompt_runs
  add column if not exists cost_usd numeric(14, 8);

update prompt_runs
set cost_usd = case
  when provider = 'openrouter'
    and coalesce(raw_output #>> '{usage,cost}', '') ~ '^[0-9]+(\.[0-9]+)?$'
    then (raw_output #>> '{usage,cost}')::numeric
  when provider = 'dataforseo'
    and coalesce(raw_output ->> 'cost', '') ~ '^[0-9]+(\.[0-9]+)?$'
    then (raw_output ->> 'cost')::numeric
  when provider = 'dataforseo'
    and coalesce(raw_output #>> '{tasks,0,cost}', '') ~ '^[0-9]+(\.[0-9]+)?$'
    then (raw_output #>> '{tasks,0,cost}')::numeric
  else cost_usd
end
where cost_usd is null;
