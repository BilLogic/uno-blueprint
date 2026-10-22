begin;
select set_config('request.jwt.claims','{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
do $$ declare service uuid; snapshot jsonb; before_log bigint; checked int:=0; begin
  select count(*) into before_log from public.authoring_changes;
  foreach service in array array['a0000000-0000-4000-8000-000000000100'::uuid,'a0000000-0000-4000-8000-000000000200'::uuid] loop
    snapshot:=public.read_service_blueprint(service);
    if snapshot is null or snapshot->>'id'<>service::text then raise exception 'Readable service was not exported'; end if;
    if service='a0000000-0000-4000-8000-000000000100' and snapshot#>>'{phases,0,scenarios,0,paths,0,cells,0,id}' is distinct from 'a0000000-0000-4000-8000-000000000106' then raise exception 'Nested cell was not exported'; end if;
    if service='a0000000-0000-4000-8000-000000000200' and snapshot#>'{phases,0,scenarios,0,paths,0,lanes}' is distinct from '[]'::jsonb then raise exception 'Export concealed a missing lane stack'; end if;
    checked:=checked+1;
  end loop;
  if (select count(*) from public.authoring_changes)<>before_log then raise exception 'Reading a service changed its authoring log'; end if;
  if public.read_service_blueprint('a0000000-0000-4000-8000-999999999999') is not null then raise exception 'Unknown service was exported'; end if;
  perform set_config('ub.validation_checked',checked::text,true);
end $$;
set local role anon;
do $$ begin
  perform public.read_service_blueprint('a0000000-0000-4000-8000-000000000100');
  raise exception 'Anonymous caller could export a blueprint';
exception when insufficient_privilege then null; end $$;
select 'validation_checked='||current_setting('ub.validation_checked');
rollback;
