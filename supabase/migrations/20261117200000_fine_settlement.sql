-- Settling a Fine (spec #29, ticket #37, ADR 0010): a Librarian closes a Fine
-- at the desk as paid or waived. LIBRAS records who settled it and when, not
-- the money: there is no payment amount, no partial payment and no receipt.
--
-- The settlement is part of the Fine's own row. A Fine is unsettled while the
-- three columns are null, and settled once they are all set; a settled Fine is
-- never reopened (the API updates only rows whose settled_at is null, and no
-- client role may write the table). Two ways to settle exist, both a Librarian's:
-- on the return of the late Copy, by the Librarian who recorded that return, for
-- a short while after it; and in a desk session for the Fine's Member.
--
-- fixed_by is the Librarian whose return fixed the Fine. The API checks it when
-- a Fine is settled on the return, so that only the Librarian at that return can
-- do it. Rows written by #36 get it from their `fine_fixed` audit entry, which
-- the same transaction wrote. A row with no usable entry (none found, or its
-- actor is no longer a Librarian) is left with fixed_by null rather than given a
-- guess: nobody then settles it on a return, which is the safe answer for a
-- return whose Librarian is unknown, and its Member's desk session still can.
-- That is why the column is nullable and the rule that new Fines name their
-- Librarian is a NOT VALID check: it is enforced for every row written or
-- changed from now on and skips the rows already there, so this migration
-- cannot fail on data it did not create. Settling such an old row sets
-- settled_at, which satisfies the check.

create type public.fine_outcome as enum ('paid', 'waived');

alter table public.fines
  add column fixed_by uuid references public.staff (user_id),
  add column settled_outcome public.fine_outcome,
  add column settled_by uuid references public.staff (user_id),
  add column settled_at timestamptz;

update public.fines f
   set fixed_by = a.actor_id
  from public.audit_log a
 where a.event_type = 'fine_fixed'
   and a.subject = f.loan_id::text
   and exists (select 1 from public.staff s where s.user_id = a.actor_id);

alter table public.fines add constraint fines_fixed_by_present check (fixed_by is not null or settled_at is not null) not valid;

alter table public.fines add constraint fines_settlement_complete check (
  (settled_outcome is null and settled_by is null and settled_at is null)
  or (settled_outcome is not null and settled_by is not null and settled_at is not null)
);

comment on column public.fines.fixed_by is 'The Librarian whose return of the Copy fixed this Fine. Null only for a Fine the migration could not attribute.';
comment on column public.fines.settled_outcome is 'How a Librarian settled the Fine: paid or waived. Null while it is unsettled. Never changed once set.';
comment on column public.fines.settled_by is 'The Librarian who settled the Fine. Null while it is unsettled.';
comment on column public.fines.settled_at is 'When the Fine was settled, by the API''s clock. Null while it is unsettled.';

-- Who fixed and who settled a Fine is for the audit log, not for the client
-- roles: a Member reads their own Fine through Supabase directly, and must not
-- learn a Librarian's id from it. They may read the amount and how and when it
-- was settled. Only the API (connected as postgres) reads the two Librarian
-- columns. Column privileges replace the table-wide select of the fines
-- migration; a column added later is private until it is granted here.
revoke select on table public.fines from authenticated;
grant select (loan_id, member_id, days_late, daily_rate_centavos, cap_centavos, amount_centavos, fixed_at, settled_outcome, settled_at)
  on table public.fines to authenticated;

-- A Member's unsettled Fines, for the desk's Member panel, Good standing and Clearance.
create index fines_unsettled_idx on public.fines (member_id) where settled_at is null;

-- The audit log records every Fine settled (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('fine_settled');
