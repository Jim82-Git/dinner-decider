create table if not exists public.family_lists (
  share_id uuid primary key,
  restaurants jsonb not null default '[]'::jsonb
    check (jsonb_typeof(restaurants) = 'array'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.family_lists enable row level security;
grant usage on schema public to anon;

drop policy if exists "Family link can read its list" on public.family_lists;
create policy "Family link can read its list"
  on public.family_lists for select to anon
  using (
    share_id::text = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-family-key',
      ''
    )
  );

drop policy if exists "Family link can create its list" on public.family_lists;
create policy "Family link can create its list"
  on public.family_lists for insert to anon
  with check (
    share_id::text = coalesce(
      current_setting('request.headers', true)::jsonb ->> 'x-family-key',
      ''
    )
  );

revoke all on public.family_lists from anon, authenticated;
grant select, insert on public.family_lists to anon;

create or replace function public.save_family_list(
  p_share_id uuid,
  p_restaurants jsonb,
  p_expected_revision bigint
)
returns table (saved boolean, revision bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_revision bigint;
begin
  if p_share_id::text is distinct from coalesce(
    current_setting('request.headers', true)::jsonb ->> 'x-family-key',
    ''
  ) then
    raise exception 'Invalid family link';
  end if;

  if jsonb_typeof(p_restaurants) is distinct from 'array' then
    raise exception 'Restaurant list must be an array';
  end if;

  update public.family_lists
  set restaurants = p_restaurants,
      revision = family_lists.revision + 1,
      updated_at = now()
  where share_id = p_share_id
    and family_lists.revision = p_expected_revision
  returning family_lists.revision into new_revision;

  if not found then
    return query select false, null::bigint;
  else
    return query select true, new_revision;
  end if;
end;
$$;

revoke all on function public.save_family_list(uuid, jsonb, bigint) from public, authenticated;
grant execute on function public.save_family_list(uuid, jsonb, bigint) to anon;
