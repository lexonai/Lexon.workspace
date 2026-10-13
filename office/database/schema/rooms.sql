-- rooms
create table rooms(id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, x real, z real, w real, d real, department_id uuid references departments);
