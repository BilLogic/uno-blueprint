-- Authored 2026-10-20.
-- One statement gives validation a consistent, complete snapshot without
-- changing rows or inheriting the Data API's row limit on a tree of reads.
create function public.read_service_blueprint(p_service_id uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog, pg_temp as $$
  select to_jsonb(service) || jsonb_build_object(
    'touchpoints',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from public.touchpoints t
      where exists(select 1 from public.cell_touchpoints ct join public.cells c on c.id=ct.cell_id
        join public.paths p on p.id=c.path_id join public.scenarios s on s.id=p.scenario_id
        join public.phases ph on ph.id=s.phase_id
        where ct.touchpoint_id=t.id and ph.service_id=service.id)),'[]'),
    'phases',coalesce((select jsonb_agg(to_jsonb(ph) || jsonb_build_object(
      'scenarios',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'steps',coalesce((select jsonb_agg(to_jsonb(st) order by st.id) from public.steps st where st.scenario_id=s.id),'[]'),
        'paths',coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
          'path_steps',coalesce((select jsonb_agg(to_jsonb(ps) order by ps.position,ps.step_id) from public.path_steps ps where ps.path_id=p.id),'[]'),
          'lanes',coalesce((select jsonb_agg(to_jsonb(l) order by l.position,l.id) from public.lanes l where l.path_id=p.id),'[]'),
          'cells',coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object(
            'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.resources r where r.cell_id=c.id),'[]'),
            'touchpoints',coalesce((select jsonb_agg(to_jsonb(ct) || jsonb_build_object(
              'name',coalesce(t.name,ct.name),
              'resources',coalesce((select jsonb_agg(to_jsonb(r) order by r.position,r.id) from public.resources r where r.cell_touchpoint_id=ct.id),'[]')
            ) order by ct.position,ct.id) from public.cell_touchpoints ct
              left join public.touchpoints t on t.id=ct.touchpoint_id where ct.cell_id=c.id),'[]')
          ) order by c.position,c.id) from public.cells c where c.path_id=p.id),'[]'),
          'dependencies',coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object(
            'source_lane_id',source.lane_id,'source_step_id',source.step_id,
            'target_lane_id',target.lane_id,'target_step_id',target.step_id
          ) order by d.id) from public.cell_dependencies d
            join public.cells source on source.id=d.source_cell_id
            left join public.cells target on target.id=d.target_cell_id where source.path_id=p.id),'[]')
        ) order by p.id) from public.paths p where p.scenario_id=s.id),'[]')
      ) order by s.position,s.id) from public.scenarios s where s.phase_id=ph.id),'[]')
    ) order by ph.position,ph.id) from public.phases ph where ph.service_id=service.id),'[]')
  ) from public.services service where service.id=p_service_id;
$$;
revoke all on function public.read_service_blueprint(uuid) from public;
-- @recipe — the export uses the caller's existing read grants and policies.
revoke all on function public.read_service_blueprint(uuid) from anon,authenticated;
grant execute on function public.read_service_blueprint(uuid) to authenticated;
-- @core
