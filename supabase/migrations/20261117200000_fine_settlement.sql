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
-- the same transaction wrote.

create type public.fine_outcome as enum ('paid', 'waived');

alter table public.fines
  add column fixed_by uuid references public.staff (user_id),
  add column settled_outcome public.fine_outcome,
  add column settled_by uuid references public.staff (user_id),
  add column settled_at timestamptz;

update public.fines f
   set fixed_by = a.actor_id
  from public.audit_log a
 where a.event_type = 'fine_fixed' and a.subject = f.loan_id::text;

alter table public.fines alter column fixed_by set not null;

alter table public.fines add constraint fines_settlement_complete check (
  (settled_outcome is null and settled_by is null and settled_at is null)
  or (settled_outcome is not null and settled_by is not null and settled_at is not null)
);

comment on column public.fines.fixed_by is 'The Librarian whose return of the Copy fixed this Fine.';
comment on column public.fines.settled_outcome is 'How a Librarian settled the Fine: paid or waived. Null while it is unsettled. Never changed once set.';
comment on column public.fines.settled_by is 'The Librarian who settled the Fine. Null while it is unsettled.';
comment on column public.fines.settled_at is 'When the Fine was settled, by the API''s clock. Null while it is unsettled.';

-- A Member's unsettled Fines, for the desk's Member panel, Good standing and Clearance.
create index fines_unsettled_idx on public.fines (member_id) where settled_at is null;

-- The audit log records every Fine settled (apps/api/src/audit/events.ts).
insert into public.audit_event_types (event_type) values ('fine_settled');
