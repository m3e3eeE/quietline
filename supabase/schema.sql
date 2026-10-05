-- Relay native messaging v1. Run this once in the Supabase SQL editor.
-- The browser only receives the anon key; never add a service-role key to relay-config.js.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text check (char_length(title) <= 80),
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create or replace function public.make_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_handle text;
begin
  base_handle := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_-]+', '-', 'g'));
  base_handle := left(trim(both '-' from base_handle), 22);
  if char_length(base_handle) < 3 then base_handle := 'relay-user'; end if;
  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    base_handle || '-' || substr(replace(new.id::text, '-', ''), 1, 6),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 32), ''), split_part(new.email, '@', 1))
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.make_profile();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles are visible to signed-in Relay users" on public.profiles for select to authenticated using (true);
create policy "users update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read their conversations" on public.conversations for select to authenticated using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.profile_id = auth.uid()));
create policy "members read conversation membership" on public.conversation_members for select to authenticated using (exists (select 1 from public.conversation_members mine where mine.conversation_id = conversation_id and mine.profile_id = auth.uid()));
create policy "members read messages" on public.messages for select to authenticated using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.profile_id = auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.profile_id = auth.uid()));

create or replace function public.start_direct_conversation(other_handle text, first_message text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  other_id uuid;
  existing_id uuid;
  created_id uuid;
begin
  select id into other_id from public.profiles where handle = lower(other_handle);
  if other_id is null then raise exception 'No Relay account uses that handle.'; end if;
  if other_id = auth.uid() then raise exception 'Choose another Relay account.'; end if;
  select cm1.conversation_id into existing_id from public.conversation_members cm1
  where cm1.profile_id = auth.uid() and exists (
    select 1 from public.conversation_members cm2 where cm2.conversation_id = cm1.conversation_id and cm2.profile_id = other_id
  ) and (select count(*) from public.conversation_members cm3 where cm3.conversation_id = cm1.conversation_id) = 2 limit 1;
  if existing_id is not null then return existing_id; end if;
  insert into public.conversations(kind) values ('direct') returning id into created_id;
  insert into public.conversation_members(conversation_id, profile_id) values (created_id, auth.uid()), (created_id, other_id);
  if nullif(trim(first_message), '') is not null then insert into public.messages(conversation_id, body) values (created_id, trim(first_message)); end if;
  return created_id;
end;
$$;

grant execute on function public.start_direct_conversation(text, text) to authenticated;
alter publication supabase_realtime add table public.messages;
