-- Audit log (spec #2, "Security controls in Tier 1").
--
-- An append-only record of security-relevant events: failed sign-ins now,
-- Loans, returns and Hold dispatches as those features arrive. Each entry
-- stores a SHA-256 hash over its own content and the previous entry's hash, so
-- editing, deleting or reordering an entry breaks the chain and the API's
-- verification routine (apps/api/src/audit) reports it.
--
-- The database, not the API, builds the chain: a BEFORE INSERT trigger takes a
-- transaction-scoped advisory lock, reads the newest entry, and fills in the
-- sequence number, the previous hash and the hash. Whatever an INSERT supplies
-- for those columns is overwritten. Because the lock is held until the
-- inserting transaction ends, concurrent writers append one after another and
-- an entry recorded inside a transaction that rolls back leaves no gap.
--
-- Updates, deletes and TRUNCATE are refused by triggers that are ENABLE ALWAYS
-- (they fire even with session_replication_role = replica) and by revoking the
-- privileges. What this cannot stop: the table owner (the role migrations and
-- the API run as) can still ALTER or DROP the table, or disable the triggers.
-- The hash chain makes such changes detectable, except a rewrite of the whole
-- chain from the tampered entry onwards; anchoring the newest hash outside the
-- database closes that gap. See apps/api/README.md, "Audit log".

-- The event types the log accepts. A later feature adds its type with one
-- insert in its own migration, and its data shape in apps/api/src/audit/events.ts.
create table public.audit_event_types (
  event_type text primary key check (event_type ~ '^[a-z][a-z_]*[a-z]$')
);

comment on table public.audit_event_types is 'Whitelist of audit log event types. Add a row in a migration to allow a new type.';

insert into public.audit_event_types (event_type) values ('sign_in_failed');

create table public.audit_log (
  -- 1, 2, 3, ... with no gaps. Assigned by the trigger, never by the writer.
  seq bigint primary key check (seq > 0),
  -- Business time from the API's clock, stored to the millisecond.
  occurred_at timestamptz not null,
  event_type text not null references public.audit_event_types (event_type),
  -- The signed-in person who caused the event, when there is one. No foreign
  -- key: an entry must outlive the account and must never block its removal.
  actor_id uuid,
  -- What the event is about, as text (an email, a Copy barcode, a Loan id).
  subject text check (length(subject) <= 320),
  -- Event details. Its shape per type is whitelisted by the API.
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  prev_hash text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null unique check (hash ~ '^[0-9a-f]{64}$')
);

comment on table public.audit_log is
  'Append-only, hash-chained audit log. Written only through the API (apps/api/src/audit). Updates, deletes and TRUNCATE are refused.';

-- Canonical JSON of a jsonb value: object keys sorted, no whitespace, strings
-- escaped as PostgreSQL to_json does (which matches JavaScript JSON.stringify),
-- integers only. The API's verifier rebuilds the same text in TypeScript
-- (apps/api/src/audit/canonical.ts); a test checks the two agree on awkward text.
-- Keys must be plain ASCII identifiers so both sides sort them the same way.
create function public.audit_canonical_json(value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  result text;
  number_value numeric;
begin
  case jsonb_typeof(value)
    when 'object' then
      if exists (select 1 from jsonb_object_keys(value) as k(key) where key !~ '^[A-Za-z][A-Za-z0-9_]*$') then
        raise exception 'audit data keys must be ASCII identifiers' using errcode = '22023';
      end if;
      select '{' || coalesce(string_agg(to_json(e.key)::text || ':' || public.audit_canonical_json(e.val), ',' order by e.key collate "C"), '') || '}'
        into result
        from jsonb_each(value) as e(key, val);
    when 'array' then
      select '[' || coalesce(string_agg(public.audit_canonical_json(a.elem), ',' order by a.ord), '') || ']'
        into result
        from jsonb_array_elements(value) with ordinality as a(elem, ord);
    when 'string' then
      result := to_json(value #>> '{}')::text;
    when 'number' then
      number_value := (value #>> '{}')::numeric;
      if number_value <> trunc(number_value) or abs(number_value) > 9007199254740991 then
        raise exception 'audit data numbers must be safe integers' using errcode = '22023';
      end if;
      result := number_value::bigint::text;
    when 'boolean' then
      result := value #>> '{}';
    else
      result := 'null';
  end case;
  return result;
end;
$$;

-- The exact text that is hashed for one entry. Version tag first so the format can change later.
create function public.audit_entry_canonical(
  prev_hash text,
  seq bigint,
  occurred_at timestamptz,
  event_type text,
  actor_id uuid,
  subject text,
  data jsonb
)
returns text
language sql
immutable
set search_path = ''
as $$
  select '[' || concat_ws(',',
    to_json('libras-audit-v1'::text)::text,
    to_json(prev_hash)::text,
    seq::text,
    to_json(to_char(occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text,
    to_json(event_type)::text,
    coalesce(to_json(actor_id::text)::text, 'null'),
    coalesce(to_json(subject)::text, 'null'),
    public.audit_canonical_json(data)
  ) || ']'
$$;

create function public.audit_log_append()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  newest record;
begin
  -- The newest entry is read after taking the lock, so it must be read with a
  -- fresh snapshot. Under REPEATABLE READ or SERIALIZABLE the snapshot is older
  -- than the lock and the chain would fork; refuse instead.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'audit entries must be recorded in a READ COMMITTED transaction'
      using errcode = '25000';
  end if;

  -- One writer at a time, until its transaction ends. The key is arbitrary and
  -- used for nothing else: it reads as "LIBRAS audit".
  perform pg_advisory_xact_lock(7363829318003);

  select a.seq, a.hash into newest from public.audit_log as a order by a.seq desc limit 1;

  new.seq := coalesce(newest.seq, 0) + 1;
  new.prev_hash := coalesce(newest.hash, repeat('0', 64));
  new.occurred_at := date_trunc('milliseconds', new.occurred_at);
  new.data := coalesce(new.data, '{}'::jsonb);
  new.hash := encode(sha256(convert_to(public.audit_entry_canonical(
    new.prev_hash, new.seq, new.occurred_at, new.event_type, new.actor_id, new.subject, new.data
  ), 'UTF8')), 'hex');
  return new;
end;
$$;

create function public.audit_log_refuse_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'the audit log is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_log_append
  before insert on public.audit_log
  for each row execute function public.audit_log_append();

create trigger audit_log_no_update_or_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_refuse_change();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_refuse_change();

-- Fire even when session_replication_role is "replica", which otherwise skips triggers.
alter table public.audit_log enable always trigger audit_log_append;
alter table public.audit_log enable always trigger audit_log_no_update_or_delete;
alter table public.audit_log enable always trigger audit_log_no_truncate;

-- The whitelist itself must not shrink or change under existing entries.
create trigger audit_event_types_no_update_or_delete
  before update or delete on public.audit_event_types
  for each row execute function public.audit_log_refuse_change();
create trigger audit_event_types_no_truncate
  before truncate on public.audit_event_types
  for each statement execute function public.audit_log_refuse_change();
alter table public.audit_event_types enable always trigger audit_event_types_no_update_or_delete;
alter table public.audit_event_types enable always trigger audit_event_types_no_truncate;

-- Nobody but the API (the table owner) touches the log. Members and the
-- Supabase client roles cannot read it, write it or forge entries. Row-level
-- security is on with no policy, as a second wall behind the missing grants.
alter table public.audit_log enable row level security;
alter table public.audit_event_types enable row level security;

revoke all on table public.audit_log from public, anon, authenticated, service_role;
revoke all on table public.audit_event_types from public, anon, authenticated, service_role;

revoke all on function public.audit_canonical_json(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.audit_entry_canonical(text, bigint, timestamptz, text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.audit_log_append() from public, anon, authenticated, service_role;
revoke all on function public.audit_log_refuse_change() from public, anon, authenticated, service_role;
