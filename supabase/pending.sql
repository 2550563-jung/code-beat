-- code-beat: 아직 적용되지 않은 DB 함수
-- 로그아웃(서버 세션 삭제), 레벨 삭제, 좋아요 취소, 레벨 수정 시 기록 초기화에 필요합니다.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하면 됩니다. (bb_ 테이블에만 영향)

create or replace function public.bb_logout(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from bb_sessions where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
end $$;

create or replace function public.bb_delete_level(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare pid uuid := bb_auth(p_token);
begin
  delete from bb_levels where id = p_id and author_id = pid;
  if not found then raise exception 'not_yours'; end if;
  delete from bb_scores where map_key = 'c:' || p_id::text;
end $$;

create or replace function public.bb_toggle_like(p_token text, p_id uuid) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare pid uuid := bb_auth(p_token); liked boolean;
begin
  if not exists (select 1 from bb_levels where id = p_id) then raise exception 'no_level'; end if;
  delete from bb_likes where level_id = p_id and player_id = pid;
  if found then liked := false; else insert into bb_likes values (p_id, pid); liked := true; end if;
  update bb_levels set likes = (select count(*) from bb_likes where level_id = p_id) where id = p_id;
  return json_build_object('liked', liked, 'likes', (select likes from bb_levels where id = p_id));
end $$;

create or replace function public.bb_reset_level_scores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.notes is distinct from old.notes or new.bpm <> old.bpm or new.lanes <> old.lanes or new.bars <> old.bars then
    delete from bb_scores where map_key = 'c:' || new.id::text;
  end if;
  return new;
end $$;
drop trigger if exists bb_levels_reset_scores on public.bb_levels;
create trigger bb_levels_reset_scores after update on public.bb_levels
  for each row execute function public.bb_reset_level_scores();
revoke execute on function public.bb_reset_level_scores() from public, anon, authenticated;
