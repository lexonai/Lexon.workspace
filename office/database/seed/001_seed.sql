-- Run after schema + migrations 001/002 (service role / SQL editor bypasses RLS). Re-runnable.
insert into departments(name) values ('Management'),('YouTube'),('Content'),('Design'),('Development') on conflict (name) do nothing;
insert into rooms(slug,name,x,z,w,d,department_id)
select v.slug,v.name,v.x,v.z,v.w,v.d,(select id from departments where name=v.dept) from (values
 ('design','Design Room',-18,-5,11,9,'Design'),('dev','Development Room',-6,-5,11,9,'Development'),('youtube','YouTube Room',6,-5,11,9,'YouTube'),
 ('content','Content Room',18,-5,11,9,'Content'),('meeting','Meeting Room',-18,5,11,9,'Management'),('main','Main Floor',0,5,23,9,'Management'),('break','Break Area',18,5,11,9,null)
) v(slug,name,x,z,w,d,dept) on conflict (slug) do nothing;
insert into people(slug,name,role,department_id,is_owner)
select v.slug,v.name,v.role,(select id from departments where name=v.dept),v.owner from (values
 ('owner','Owner','Owner',null,true),('anita','Anita Sharma','Operations Manager','Management',false),('rohit','Rohit Verma','YouTube Lead','YouTube',false),
 ('sana','Sana Khan','Scripter','Content',false),('imran','Imran Ali','Image Designer','Design',false),('vijay','Vijay Kumar','Motion Grapher','Design',false),
 ('karan','Karan Mehta','Developer','Development',false),('meera','Meera Das','Content Editor','Content',false),('arjun','Arjun Nair','Video Editor','YouTube',false)
) v(slug,name,role,dept,owner) on conflict (slug) do nothing;
update people p set manager_id=(select id from people m where m.slug=v.mgr) from (values
 ('rohit','anita'),('sana','rohit'),('imran','rohit'),('vijay','imran'),('karan','anita'),('meera','anita'),('arjun','rohit'),('anita','owner')) v(slug,mgr) where p.slug=v.slug;
insert into relationships(person_id,other_id,kind)
select (select id from people where slug=v.a),(select id from people where slug=v.b),v.k from (values
 ('rohit','anita','manager'),('sana','rohit','manager'),('imran','rohit','manager'),('vijay','imran','team_lead'),('karan','anita','manager'),('meera','anita','manager'),('arjun','rohit','manager')) v(a,b,k) on conflict do nothing;
insert into relationships(person_id,other_id,kind)
select a.id,b.id,'project' from people a join people b on a.slug<b.slug where a.slug in ('anita','rohit','sana','imran','vijay') and b.slug in ('anita','rohit','sana','imran','vijay') on conflict do nothing;
insert into desks(room_id,person_id,x,z)
select (select id from rooms where slug=v.room),(select id from people where slug=v.slug),v.x,v.z from (values
 ('anita','main',-4,4),('rohit','youtube',5,-5),('sana','content',17,-5),('imran','design',-19,-5),('vijay','design',-16,-5),('karan','dev',-6,-5),('meera','main',3,4)) v(slug,room,x,z) on conflict do nothing;
insert into computers(desk_id,powered) select d.id,true from desks d where d.person_id is not null on conflict do nothing;
insert into virtual_screens(computer_id,app,state)
select c.id,v.app,'on' from computers c join desks d on d.id=c.desk_id join people p on p.id=d.person_id join (values
 ('anita','Tasks · Chrome'),('rohit','YouTube Studio'),('sana','Docs · Script'),('imran','Image Editor'),('vijay','Lexon Motion'),('karan','VS Code'),('meera','Chrome')) v(slug,app) on v.slug=p.slug on conflict do nothing;
insert into cameras(code,label,room_id,position,target)
select v.code,v.label,(select id from rooms where slug=v.room),v.pos::real[],v.tgt::real[] from (values
 ('cam1','CAM 01 — Main Floor','main','{0,17,27}','{0,0,3}'),('cam2','CAM 02 — Design Room','design','{-17,7,2}','{-17,0,-5}'),('cam3','CAM 03 — Development Room','dev','{-6,7,2}','{-6,0,-5}'),
 ('cam4','CAM 04 — Meeting Room','meeting','{-18,7,14}','{-18,0,5}'),('cam5','CAM 05 — YouTube Room','youtube','{6,7,2}','{6,0,-5}'),('cam6','CAM 06 — Break Area','break','{18,7,14}','{18,0,5}')) v(code,label,room,pos,tgt) on conflict (code) do nothing;
insert into presence(person_id,status,anim_state,room_id)
select p.id,v.st,v.an,(select id from rooms where slug=v.room) from (values
 ('anita','online','READING','main'),('rohit','online','WORKING','youtube'),('sana','online','WORKING','content'),('imran','busy','WORKING','design'),('vijay','online','WORKING','design'),
 ('karan','busy','TYPING','dev'),('meera','away','READING','main'),('arjun','away','BREAK','break')) v(slug,st,an,room) join people p on p.slug=v.slug on conflict (person_id) do nothing;
insert into schedules(kind,title,room_id,time_label,starts_at) values
 ('Meeting','Weekly content sync',(select id from rooms where slug='meeting'),'10:00',date_trunc('day',now())+interval '10 hours'),
 ('Call','Rohit and Anita: channel review',null,'11:30',date_trunc('day',now())+interval '11 hours 30 minutes'),
 ('Break','Lunch break',(select id from rooms where slug='break'),'13:00',date_trunc('day',now())+interval '13 hours'),
 ('Deadline','Thumbnail batch due',(select id from rooms where slug='design'),'15:00',date_trunc('day',now())+interval '15 hours'),
 ('Task','Dev: API refactor review',(select id from rooms where slug='dev'),'16:30',date_trunc('day',now())+interval '16 hours 30 minutes');
