-- Hardcoded doctors (seed) without relying on unique constraints
insert into doctors (name, specialty, body_part)
select 'Dr Smith', 'Cardiology', 'heart'
where not exists (select 1 from doctors where name = 'Dr Smith');

insert into doctors (name, specialty, body_part)
select 'Dr Patel', 'Dermatology', 'skin'
where not exists (select 1 from doctors where name = 'Dr Patel');

insert into doctors (name, specialty, body_part)
select 'Dr Lee', 'Orthopedics', 'bones'
where not exists (select 1 from doctors where name = 'Dr Lee');

insert into doctors (name, specialty, body_part)
select 'Dr Garcia', 'Neurology', 'brain'
where not exists (select 1 from doctors where name = 'Dr Garcia');

