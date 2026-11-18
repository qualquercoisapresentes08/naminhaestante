-- ==========================================================================
-- NA MINHA ESTANTE - SCHEMA MULTI-USUÁRIO & COMUNIDADE GLOBAL (SUPABASE)
-- Execute este script no SQL Editor do seu projeto no Supabase
-- ==========================================================================

-- 1. Perfis Públicos dos Criadores (compatível com UUID do Auth e IDs locais migrados)
create table if not exists public.profile_settings (
  id text primary key,
  email text default '',
  username text not null unique,
  name text not null,
  bio text default '',
  avatar_url text default '',
  instagram_url text default '',
  clubs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Caso a tabela já exista de uma versão anterior, garante coluna email
alter table public.profile_settings add column if not exists email text default '';

-- 2. Acervo de Livros das Prateleiras (vinculado ao perfil em profile_settings)
create table if not exists public.books (
  id text primary key,
  user_id text not null references public.profile_settings(id) on delete cascade,
  title text not null,
  author text not null,
  cover_url text default '',
  shelf text not null check (shelf in ('reading', 'read', 'wishlist')),
  rating integer not null default 0 check (rating >= 0 and rating <= 5),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  synopsis text default '',
  review text default '',
  isbn text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Comentários de Visitantes nos Livros
create table if not exists public.comments (
  id text primary key,
  book_id text not null references public.books(id) on delete cascade,
  author_name text not null,
  author_handle text default '',
  text text not null,
  rating integer not null default 0 check (rating >= 0 and rating <= 5),
  created_at timestamptz not null default now()
);

create index if not exists idx_profile_settings_username on public.profile_settings(username);
create index if not exists idx_profile_settings_email on public.profile_settings(email);
create index if not exists idx_books_user_id on public.books(user_id);
create index if not exists idx_books_shelf on public.books(shelf);
create index if not exists idx_comments_book_id on public.comments(book_id);

-- ==========================================================================
-- POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS) PARA COMUNIDADE ABERTA
-- ==========================================================================
alter table public.profile_settings enable row level security;
alter table public.books enable row level security;
alter table public.comments enable row level security;

-- Leitura pública da vitrine (perfis, livros e comentários)
drop policy if exists "Public read profile_settings" on public.profile_settings;
create policy "Public read profile_settings"
  on public.profile_settings for select
  using (true);

drop policy if exists "Public read books" on public.books;
create policy "Public read books"
  on public.books for select
  using (true);

drop policy if exists "Public read comments" on public.comments;
create policy "Public read comments"
  on public.comments for select
  using (true);

-- Escrita aberta via anonKey/Auth para comunidade e migração de perfis locais
drop policy if exists "Public insert comments" on public.comments;
create policy "Public insert comments"
  on public.comments for insert
  with check (true);

drop policy if exists "Owner insert profile_settings" on public.profile_settings;
drop policy if exists "Community insert profile_settings" on public.profile_settings;
create policy "Community insert profile_settings"
  on public.profile_settings for insert
  with check (true);

drop policy if exists "Owner update profile_settings" on public.profile_settings;
drop policy if exists "Community update profile_settings" on public.profile_settings;
create policy "Community update profile_settings"
  on public.profile_settings for update
  using (true)
  with check (true);

drop policy if exists "Owner delete profile_settings" on public.profile_settings;
drop policy if exists "Community delete profile_settings" on public.profile_settings;
create policy "Community delete profile_settings"
  on public.profile_settings for delete
  using (true);

drop policy if exists "Owner insert books" on public.books;
drop policy if exists "Community insert books" on public.books;
create policy "Community insert books"
  on public.books for insert
  with check (true);

drop policy if exists "Owner update books" on public.books;
drop policy if exists "Community update books" on public.books;
create policy "Community update books"
  on public.books for update
  using (true)
  with check (true);

drop policy if exists "Owner delete books" on public.books;
drop policy if exists "Community delete books" on public.books;
create policy "Community delete books"
  on public.books for delete
  using (true);
