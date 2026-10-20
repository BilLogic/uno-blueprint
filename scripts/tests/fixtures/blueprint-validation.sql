-- Disposable validation fixtures: one clean service and one path with no lanes.
insert into public.services(id,name,slug) values
 ('a0000000-0000-4000-8000-000000000100','Clean validation fixture','clean-validation-fixture'),
 ('a0000000-0000-4000-8000-000000000200','Incomplete validation fixture','incomplete-validation-fixture');
insert into public.phases(id,service_id,name,position) values
 ('a0000000-0000-4000-8000-000000000101','a0000000-0000-4000-8000-000000000100','Arrival',0),
 ('a0000000-0000-4000-8000-000000000201','a0000000-0000-4000-8000-000000000200','Arrival',0);
insert into public.scenarios(id,phase_id,name,position,layout) values
 ('a0000000-0000-4000-8000-000000000102','a0000000-0000-4000-8000-000000000101','Request support',0,'stacked'),
 ('a0000000-0000-4000-8000-000000000202','a0000000-0000-4000-8000-000000000201','Request support',0,'stacked');
insert into public.steps(id,scenario_id,name) values
 ('a0000000-0000-4000-8000-000000000103','a0000000-0000-4000-8000-000000000102','Describe request'),
 ('a0000000-0000-4000-8000-000000000203','a0000000-0000-4000-8000-000000000202','Describe request');
insert into public.paths(id,scenario_id,name,kind) values
 ('a0000000-0000-4000-8000-000000000104','a0000000-0000-4000-8000-000000000102','First request','happy'),
 ('a0000000-0000-4000-8000-000000000204','a0000000-0000-4000-8000-000000000202','First request','happy');
insert into public.path_steps(path_id,step_id,position) values
 ('a0000000-0000-4000-8000-000000000104','a0000000-0000-4000-8000-000000000103',0),
 ('a0000000-0000-4000-8000-000000000204','a0000000-0000-4000-8000-000000000203',0);
insert into public.lanes(id,path_id,name,lane_role,position) values
 ('a0000000-0000-4000-8000-000000000105','a0000000-0000-4000-8000-000000000104','Customer','customer_actions',0);
insert into public.cells(id,path_id,lane_id,step_id,content) values
 ('a0000000-0000-4000-8000-000000000106','a0000000-0000-4000-8000-000000000104','a0000000-0000-4000-8000-000000000105','a0000000-0000-4000-8000-000000000103','Describe the request');
