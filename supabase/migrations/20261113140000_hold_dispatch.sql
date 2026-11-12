-- Hold dispatch: when a Copy comes back and its Book has waiting Holds, the
-- Role-Weighted Priority Queue Dispatcher (ADR 0001) picks the next Hold, the
-- Hold becomes 'ready' and that Copy is set aside for its Member for the
-- Pickup Window.

-- Library-wide settings: exactly one row. The Pickup Window length is a
-- placeholder until the library confirms it, and is then changed as data.
create table public.library_settings (
  singleton boolean primary key default true check (singleton),
  -- How long a Copy stays set aside for the Member whose Hold was chosen.
  pickup_window_hours integer not null check (pickup_window_hours > 0)
);

comment on table public.library_settings is 'Library-wide settings, one row. Read by the API only.';

insert into public.library_settings (pickup_window_hours) values (24);

alter table public.library_settings enable row level security;
-- No grants and no policies: only the API, connected as itself, reads it.
revoke all on table public.library_settings from anon, authenticated;

-- What a dispatched Hold remembers. They stay on the Hold after it is
-- fulfilled, expired or cancelled, as its history.
alter table public.holds
  -- The Copy set aside for this Hold.
  add column copy_id uuid references public.copies (id) on delete restrict,
  -- When the Hold was chosen, by the API's clock: the start of the Pickup Window.
  add column ready_at timestamptz,
  -- The end of the Pickup Window: ready_at plus the setting at that moment.
  add column pickup_ends_at timestamptz,
  -- When the Member borrowed the set-aside Copy.
  add column fulfilled_at timestamptz,
  add constraint holds_waiting_has_no_copy check (status <> 'waiting' or copy_id is null),
  add constraint holds_ready_has_copy_and_window check (
    status <> 'ready' or (copy_id is not null and ready_at is not null and pickup_ends_at is not null)
  ),
  add constraint holds_copy_and_window_together check (
    (copy_id is null) = (ready_at is null) and (copy_id is null) = (pickup_ends_at is null)
  ),
  add constraint holds_window_ends_after_it_starts check (pickup_ends_at > ready_at),
  add constraint holds_fulfilled_at_when_fulfilled check ((status = 'fulfilled') = (fulfilled_at is not null));

-- A Copy is set aside for at most one Hold. The Copy's row lock already
-- guarantees it; this is the database's own word on it.
create unique index holds_one_ready_per_copy on public.holds (copy_id) where status = 'ready';

insert into public.audit_event_types (event_type) values ('hold_dispatched');
