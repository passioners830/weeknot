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

-- circle_members: 直接テーブルに書き込めるのは「サークル作成者が自分自身を追加する場合」だけに限定する。
-- (招待コード経由の参加はjoin_circle()のsecurity definer権限で行われるため、
--  ここを絞ってもjoin_circle()経由の参加はブロックされない。
--  これが無いと、招待コードを使わずcircle_idさえ分かれば誰でも直接参加できてしまう)
create policy "circle_members: insert self as owner" on public.circle_members
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.circles c
      where c.id = circle_members.circle_id and c.owner_id = auth.uid()
    )
  );

-- circle_members: 自分自身の参加行だけ削除できる（サークルからの退出）
create policy "circle_members: delete own" on public.circle_members
  for delete using (user_id = auth.uid());

-- circle_members: サークルのオーナーは他のメンバーも退会させられる
-- (delete ownと合わせて「自分の行 または オーナー」のどちらかの条件で削除可能になる)
create policy "circle_members: delete by circle owner" on public.circle_members
  for delete using (
    exists (
      select 1 from public.circles c
      where c.id = circle_members.circle_id and c.owner_id = auth.uid()
    )
  );

-- circles: オーナーは招待コードの再発行など、自分のサークルを更新できる
create policy "circles: update own" on public.circles
  for update using (owner_id = auth.uid());

-- circles: オーナーは自分のサークルを削除できる
-- (circle_members/highlight_circlesはon delete cascadeで一緒に削除される)
create policy "circles: delete own" on public.circles
  for delete using (owner_id = auth.uid());

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

create policy "highlights: delete own" on public.highlights
  for delete using (user_id = auth.uid());

-- highlights: 公開範囲の後編集を自分の投稿にだけ許可
create policy "highlights: update own" on public.highlights
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- highlight_circles: 対象ハイライトの持ち主、またはそのサークルのメンバーが見える
create policy "highlight_circles: select if highlight visible" on public.highlight_circles
  for select using (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_circles.highlight_id and h.user_id = auth.uid()
    )
    or public.is_circle_member(highlight_circles.circle_id)
  );

-- highlight_circles: 投稿の持ち主であるだけでなく、共有先のサークルに
-- 実際に参加していることも確認する（招待コード無しで他人のサークルに
-- 投稿を紛れ込ませられないようにするため）
create policy "highlight_circles: insert by highlight owner and circle member" on public.highlight_circles
  for insert with check (
    exists (
      select 1 from public.highlights h
      where h.id = highlight_circles.highlight_id and h.user_id = auth.uid()
    )
    and public.is_circle_member(highlight_circles.circle_id)
  );

-- highlight_circles: 公開範囲の後編集（サークルの付け替え）のため、投稿の持ち主が削除できる
create policy "highlight_circles: delete by highlight owner" on public.highlight_circles
  for delete using (
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

-- send_expo_pushは内部のトリガーからのみ呼ばれるべきもので、
-- クライアントから直接RPCとして呼び出せてしまうと任意の相手に
-- 任意の内容の通知を送るのに悪用できるため、直接実行する権限を剥奪する
revoke execute on function public.send_expo_push(text, text, text) from public, anon, authenticated;

-- push_tokenはサークルメンバー間の表示名共有ポリシーに巻き込まれて
-- 誰からでも読み取れてしまっていたため、列単位で読み取り権限を剥奪する
-- (アプリ側もpush_tokenを読み取って使う箇所は無いため影響なし)
revoke select (push_token) on public.profiles from anon, authenticated;

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

-- アプリ管理者フラグ（通報の通知先を判定するため。運用者が自分のprofilesの行に手動でtrueを立てる想定）
alter table public.profiles add column if not exists is_app_admin boolean not null default false;

-- ブロック（自分がブロックした相手の投稿をフィードから除外する）
create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;

create policy "blocks: select own" on public.blocks
  for select using (blocker_id = auth.uid());

create policy "blocks: insert own" on public.blocks
  for insert with check (blocker_id = auth.uid());

create policy "blocks: delete own" on public.blocks
  for delete using (blocker_id = auth.uid());

-- 通報
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  highlight_id uuid not null references public.highlights(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;

-- reports: 通報した本人、またはアプリ管理者だけが見える（他人の通報内容は見えない）
create policy "reports: select own or admin" on public.reports
  for select using (
    reporter_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_app_admin)
  );

create policy "reports: insert own" on public.reports
  for insert with check (reporter_id = auth.uid());

-- 通報が来たらアプリ管理者（is_app_admin=trueの全員）にプッシュ通知を送る
create or replace function public.notify_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  reporter_name text;
begin
  select display_name into reporter_name from public.profiles where id = new.reporter_id;

  for admin_row in
    select push_token from public.profiles where is_app_admin and push_token is not null
  loop
    perform public.send_expo_push(
      admin_row.push_token,
      'しゅうまとめ',
      coalesce(reporter_name, '誰か') || 'さんが投稿を通報しました: ' || new.reason
    );
  end loop;

  return new;
end;
$$;

create trigger on_report_notify
  after insert on public.reports
  for each row execute function public.notify_on_report();

-- 呼び出し元がアプリ管理者かどうかを判定するヘルパー関数
-- (profilesのSELECTポリシーがprofiles自身を参照すると無限再帰になるため、
--  security definerで所有者権限として実行しRLSを再帰させずに判定する)
create or replace function public.is_app_admin_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_app_admin from public.profiles where id = auth.uid()), false);
$$;

-- profiles: アプリ管理者は通報対応のため全員のプロフィールを見られる
create policy "profiles: select if app admin" on public.profiles
  for select using (public.is_app_admin_user());

-- highlights: アプリ管理者は通報対応のため全ての投稿を見られる
create policy "highlights: select if app admin" on public.highlights
  for select using (public.is_app_admin_user());

-- 実際のBAN状態はauth.users側（Admin APIでのみ操作可能）にあり、
-- クライアントからは直接見えないため、UI表示用にprofiles側にも複製しておく
-- （suspend-user Edge Functionがservice role権限でBAN/UNBANと同時に更新する）
alter table public.profiles add column if not exists is_suspended boolean not null default false;
