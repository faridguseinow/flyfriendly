-- Enable Supabase Realtime for social inbox tables.

do $$
begin
  begin
    alter publication supabase_realtime add table public.social_conversations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.social_messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end
$$;
