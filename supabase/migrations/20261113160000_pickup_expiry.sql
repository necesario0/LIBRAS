-- Pickup Window expiry: when the window passes without the Member borrowing the
-- set-aside Copy, the Hold becomes 'expired' and the Copy goes to the Book's
-- next waiting Hold (or is available again).

-- When the API recorded the expiry: a Hold is expired from the moment the API
-- ran the expiry, which can be a little after its Pickup Window ended.
alter table public.holds
  add column expired_at timestamptz,
  add constraint holds_expired_at_when_expired check ((status = 'expired') = (expired_at is not null));

-- The expiry sweep looks for ready Holds whose window has ended.
create index holds_pickup_ends_idx on public.holds (pickup_ends_at) where status = 'ready';

insert into public.audit_event_types (event_type) values ('hold_expired');
