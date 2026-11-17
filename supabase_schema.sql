-- ==========================================================================
-- NA MINHA ESTANTE - SCHEMA MULTI-USUÁRIO (SUPABASE / POSTGRESQL)
-- Execute este script no SQL Editor do seu projeto no Supabase
-- ==========================================================================

-- 1. Perfis Públicos dos Criadores (vinculados ao Supabase Auth)
create table if not exists public.profile_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  name text not null,
  bio text default '',
  avatar_url text default '',
  instagram_url text default '',
  clubs jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Acervo de Livros das Prateleiras (isolado por user_id)
create table if not exists public.books (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
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
create index if not exists idx_books_user_id on public.books(user_id);
create index if not exists idx_books_shelf on public.books(shelf);
create index if not exists idx_comments_book_id on public.comments(book_id);

-- ==========================================================================
-- POLÍTICAS DE SEGURANÇA (ROW LEVEL SECURITY - RLS)
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

-- Visitantes podem publicar comentários diretamente (login ultrarrápido)
drop policy if exists "Public insert comments" on public.comments;
create policy "Public insert comments"
  on public.comments for insert
  with check (true);

-- Escrita em profile_settings restrita ao próprio usuário autenticado
drop policy if exists "Owner insert profile_settings" on public.profile_settings;
create policy "Owner insert profile_settings"
  on public.profile_settings for insert
  with check (auth.uid() = id);

drop policy if exists "Owner update profile_settings" on public.profile_settings;
create policy "Owner update profile_settings"
  on public.profile_settings for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Owner delete profile_settings" on public.profile_settings;
create policy "Owner delete profile_settings"
  on public.profile_settings for delete
  using (auth.uid() = id);

-- Escrita em books restrita ao próprio usuário autenticado
drop policy if exists "Owner insert books" on public.books;
create policy "Owner insert books"
  on public.books for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owner update books" on public.books;
create policy "Owner update books"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owner delete books" on public.books;
create policy "Owner delete books"
  on public.books for delete
  using (auth.uid() = user_id);
