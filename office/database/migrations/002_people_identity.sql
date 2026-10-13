alter table people add column if not exists slug text unique, add column if not exists auth_user_id uuid unique references auth.users on delete set null;
create unique index if not exists desks_person_uidx on desks(person_id) where person_id is not null;
create unique index if not exists computers_desk_uidx on computers(desk_id);
create unique index if not exists vscreens_computer_uidx on virtual_screens(computer_id);
