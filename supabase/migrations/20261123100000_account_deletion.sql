-- Delete my account (spec #42, ticket #53, ADR 0011).
--
-- A cleared Member can delete their account from Settings. Their sign-in (the
-- Supabase Auth user) is deleted and their personal data is removed, but their
-- Member record stays, with the same id and no personal data, because the
-- library keeps their past Loans and Fines (loans.member_id is `on delete
-- restrict`) and the audit log names them by that id.
--
-- Until now a Member record could not outlive its sign-in: members.user_id
-- referenced auth.users with `on delete cascade`. That foreign key goes. Two
-- triggers keep its meaning for every Member who is not deleted:
--   * a Member record that is not deleted needs a sign-in (checked on insert);
--   * deleting a sign-in anywhere else (a test clean-up, the Supabase
--     dashboard) still deletes the Member record that is not deleted, and is
--     still refused when that Member has Loans, as before.

alter table public.members drop constraint members_user_id_fkey;

alter table public.members
  add column deleted_at timestamptz,
  alter column first_name drop not null,
  alter column last_name drop not null,
  alter column username drop not null;

comment on column public.members.deleted_at is
  'When the Member deleted their account. The record then holds no personal data and has no sign-in; it stays for its Loans and Fines.';

-- A deleted Member keeps only their id, Account Type and dates.
alter table public.members add constraint members_personal_data check (
  (deleted_at is null and first_name is not null and last_name is not null and username is not null)
  or (
    deleted_at is not null
    and first_name is null and middle_name is null and last_name is null
    and username is null and contact_number is null and details = '{}'::jsonb
  )
);

alter table public.members drop constraint members_umak_student_details;
alter table public.members add constraint members_umak_student_details check (
  deleted_at is not null or account_type <> 'umak_student' or (details ? 'studentNumber' and details ? 'college')
);

-- A Member record that is not deleted needs a sign-in, as the foreign key said.
create function public.member_needs_sign_in() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.deleted_at is null and not exists (select 1 from auth.users u where u.id = new.user_id) then
    raise exception 'Member % has no sign-in (auth.users)', new.user_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger members_need_sign_in
  before insert or update of user_id, deleted_at on public.members
  for each row execute function public.member_needs_sign_in();

-- Deleting a sign-in deletes its Member record, unless the Member deleted their
-- account (the record is kept without personal data). A Member with Loans is
-- still refused by loans.member_id, which rolls back the delete of the sign-in.
-- Security definer: Supabase Auth deletes users as its own role, which has no
-- rights on public tables.
create function public.delete_member_of_deleted_sign_in() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.members m where m.user_id = old.id and m.deleted_at is null;
  return old;
end;
$$;

create trigger delete_member_of_deleted_sign_in
  after delete on auth.users
  for each row execute function public.delete_member_of_deleted_sign_in();

-- Neither function is for clients to call.
revoke execute on function public.member_needs_sign_in() from public, anon, authenticated;
revoke execute on function public.delete_member_of_deleted_sign_in() from public, anon, authenticated;

-- The audit log records each deletion, and each wrong password given for one
-- (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('account_deleted'), ('account_deletion_failed');
