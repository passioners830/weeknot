-- ユーザープロフィール（auth.usersに紐づく表示用情報）
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid());

-- 同じサークルに参加しているメンバー同士は、お互いの表示名を見られる
-- (フィード画面で「誰が投稿したか」を表示するために必要)
create policy "profiles: select circle-mates" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.circle_members mine
      join public.circle_members theirs on theirs.circle_id = mine.circle_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

-- サインアップ時にprofilesの行を自動作成
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- サークル
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at timestamptz not null default now()
);

-- サークルの参加者
create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create type visibility as enum ('private', 'circle', 'public');

-- 週間ハイライト
create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_count int not null default 0,
  visibility visibility not null default 'private',
  created_at timestamptz not null default now()
);

-- ハイライトをどのサークルに公開したか
create table public.highlight_circles (
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  primary key (highlight_id, circle_id)
);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.highlights enable row level security;
alter table public.highlight_circles enable row level security;

-- サークルメンバーかどうかを判定するヘルパー関数
-- (circle_membersのSELECTポリシーがcircle_members自身を参照すると無限再帰になるため、
--  security definerで所有者権限として実行しRLSを再帰させずに判定する)
create or replace function public.is_circle_member(target_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.circle_members
    where circle_id = target_circle_id and user_id = auth.uid()
  );
$$;

-- circles: オーナー本人、またはメンバーとして参加しているサークルだけ見える
create policy "circles: select own or member" on public.circles
  for select using (
    owner_id = auth.uid()
    or public.is_circle_member(circles.id)
  );

create policy "circles: insert as owner" on public.circles
  for insert with check (owner_id = auth.uid());

-- circle_members: 自分が参加しているサークルのメンバー一覧だけ見える
create policy "circle_members: select if same circle" on public.circle_members
  for select using (
    user_id = auth.uid()
    or public.is_circle_member(circle_members.circle_id)
  );

create policy "circle_members: insert self" on public.circle_members
  for insert with check (user_id = auth.uid());

-- 招待コードでサークルに参加するRPC
-- (invite_codeでサークルを検索する処理はcircles/circle_membersのRLSを
--  緩めずに済むよう、security definerで行う)
create or replace function public.join_circle(code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
begin
  select * into target_circle from public.circles c where c.invite_code = code;
  if target_circle.id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.circle_members (circle_id, user_id)
  values (target_circle.id, auth.uid())
  on conflict (circle_id, user_id) do nothing;

  return query select target_circle.id, target_circle.name;
end;
$$;

-- highlightsが指定サークル経由で見えるかどうかを判定するヘルパー関数
-- (highlightsとhighlight_circlesのポリシーが互いを直接参照すると無限再帰になるため、
--  security definerでhighlight_circlesへの参照をRLSを再帰させずに行う)
create or replace function public.is_highlight_visible_via_circle(target_highlight_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.highlight_circles hc
    where hc.highlight_id = target_highlight_id and public.is_circle_member(hc.circle_id)
  );
$$;

-- highlights: 自分の投稿、公開範囲がpublic、または自分が参加するサークルに限定公開されたもの
create policy "highlights: select visible" on public.highlights
  for select using (
    user_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'circle' and public.is_highlight_visible_via_circle(highlights.id))
  );

create policy "highlights: insert own" on public.highlights
  for insert with check (user_id = auth.uid());

-- highlight_circles: 対象ハイライトの持ち主、またはそのサークルのメンバーが見える
create policy "highlight_circles: select if highlight visible" on public.highlight_circles
  for select using (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_circles.highlight_id and h.user_id = auth.uid()
    )
    or public.is_circle_member(highlight_circles.circle_id)
  );

create policy "highlight_circles: insert by highlight owner" on public.highlight_circles
  for insert with check (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_circles.highlight_id and h.user_id = auth.uid()
    )
  );

-- リアクション（絵文字）
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (highlight_id, user_id, emoji)
);

alter table public.reactions enable row level security;

-- reactions: 対象ハイライトが自分に見えるものだけ見える
-- (public.highlightsへの参照はhighlights自体のRLSでフィルタされるため、
--  ここで可視性ロジックを重複させる必要はない)
create policy "reactions: select if highlight visible" on public.reactions
  for select using (
    exists (select 1 from public.highlights h where h.id = reactions.highlight_id)
  );

create policy "reactions: insert own if highlight visible" on public.reactions
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.highlights h where h.id = reactions.highlight_id)
  );

create policy "reactions: delete own" on public.reactions
  for delete using (user_id = auth.uid());

-- コメント
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "comments: select if highlight visible" on public.comments
  for select using (
    exists (select 1 from public.highlights h where h.id = comments.highlight_id)
  );

create policy "comments: insert own if highlight visible" on public.comments
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.highlights h where h.id = comments.highlight_id)
  );

create policy "comments: delete own" on public.comments
  for delete using (user_id = auth.uid());

-- 写真本体を保存するストレージバケット
-- パス規約: {user_id}/{highlight_id}/{n}.jpg
-- 非公開バケットにして、highlightsの可視性ルールをそのままstorage.objectsのRLSに反映する
insert into storage.buckets (id, name, public)
values ('highlight-photos', 'highlight-photos', false)
on conflict (id) do nothing;

create policy "highlight-photos: select if highlight visible" on storage.objects
  for select using (
    bucket_id = 'highlight-photos'
    and exists (
      select 1 from public.highlights h
      where h.id::text = (storage.foldername(name))[2]
    )
  );

create policy "highlight-photos: insert own" on storage.objects
  for insert with check (
    bucket_id = 'highlight-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "highlight-photos: delete own" on storage.objects
  for delete using (
    bucket_id = 'highlight-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- プッシュ通知（Expo Push Token）を送るためのトークン保存先
alter table public.profiles add column if not exists push_token text;

-- DB内から直接Expo Push APIへHTTPリクエストを送るためのpg_net拡張
create extension if not exists pg_net;

create or replace function public.send_expo_push(token text, title text, body text)
returns void
language plpgsql
as $$
begin
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('to', token, 'title', title, 'body', body)
  );
end;
$$;

-- リアクション/コメントがついたとき、ハイライトの持ち主にプッシュ通知を送る
-- (自分の投稿への自分自身のリアクション/コメントは通知しない)
create or replace function public.notify_on_reaction_or_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
  owner_token text;
  actor_name text;
  message text;
begin
  select h.user_id into owner_id from public.highlights h where h.id = new.highlight_id;

  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  select push_token into owner_token from public.profiles where id = owner_id;
  if owner_token is null then
    return new;
  end if;

  select display_name into actor_name from public.profiles where id = new.user_id;

  if TG_TABLE_NAME = 'reactions' then
    message := coalesce(actor_name, '誰か') || 'さんがリアクションしました: ' || new.emoji;
  else
    message := coalesce(actor_name, '誰か') || 'さんがコメントしました: ' || new.body;
  end if;

  perform public.send_expo_push(owner_token, 'しゅうまとめ', message);

  return new;
end;
$$;

create trigger on_reaction_notify
  after insert on public.reactions
  for each row execute function public.notify_on_reaction_or_comment();

create trigger on_comment_notify
  after insert on public.comments
  for each row execute function public.notify_on_reaction_or_comment();
