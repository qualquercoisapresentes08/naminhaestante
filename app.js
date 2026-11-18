/* ==========================================================================
   NA MINHA ESTANTE - MULTI-USUÁRIO + MONETIZAÇÃO GLOBAL + OPEN LIBRARY
   ========================================================================== */

const PLATFORM_AMAZON_TAG = 'qualquercoi05-20';
const DEFAULT_SUPABASE_URL = 'https://mumlpwouvzqeqlfbibpi.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_mLzmCf4JY9TlpJTuJG5TBA_AALiuuka';

const STORAGE_KEY = 'nme_state_v1';
const AUTH_KEY = 'nme_auth_v1';
const VISITOR_KEY = 'nme_visitor_v1';
const VISITOR_FOLLOWING_KEY = 'nme_visitor_following_v1';
const VISITOR_COMMENTS_KEY = 'nme_visitor_comments_v1';
const THEME_KEY = 'nme_theme_v1';
const DEMO_USER_ID = 'demo_leitoracriativa';
const DEMO_PASSWORD_HASH = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

const SUPABASE_SCHEMA_SQL = `-- ==========================================================================
-- NA MINHA ESTANTE - SCHEMA MULTI-USUÁRIO & COMUNIDADE GLOBAL (SUPABASE)
-- Execute este script completo no SQL Editor do seu projeto no Supabase
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

alter table public.profile_settings add column if not exists email text default '';

-- Migração automática idempotente caso existam tabelas antigas com colunas uuid / políticas antigas
do $$
declare
  pol record;
  con record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profile_settings', 'books', 'comments')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;

  for con in
    select conname, conrelid::regclass as tbl
    from pg_constraint
    where contype = 'f'
      and conrelid in (
        to_regclass('public.profile_settings'),
        to_regclass('public.books')
      )
  loop
    execute format('alter table %s drop constraint if exists %I', con.tbl, con.conname);
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'books' and column_name = 'user_id' and data_type = 'uuid'
  ) then
    alter table public.books alter column user_id drop default;
    alter table public.books alter column user_id type text using user_id::text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profile_settings' and column_name = 'id' and data_type = 'uuid'
  ) then
    alter table public.profile_settings alter column id drop default;
    alter table public.profile_settings alter column id type text using id::text;
  end if;
end $$;

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'books_user_id_fkey'
      and conrelid = to_regclass('public.books')
  ) then
    alter table public.books
      add constraint books_user_id_fkey
      foreign key (user_id) references public.profile_settings(id) on delete cascade not valid;
  end if;
end $$;

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

drop policy if exists "Public delete comments" on public.comments;
create policy "Public delete comments"
  on public.comments for delete
  using (true);

drop policy if exists "Community insert profile_settings" on public.profile_settings;
create policy "Community insert profile_settings"
  on public.profile_settings for insert
  with check (true);

drop policy if exists "Community update profile_settings" on public.profile_settings;
create policy "Community update profile_settings"
  on public.profile_settings for update
  using (true)
  with check (true);

drop policy if exists "Community delete profile_settings" on public.profile_settings;
create policy "Community delete profile_settings"
  on public.profile_settings for delete
  using (true);

drop policy if exists "Community insert books" on public.books;
create policy "Community insert books"
  on public.books for insert
  with check (true);

drop policy if exists "Community update books" on public.books;
create policy "Community update books"
  on public.books for update
  using (true)
  with check (true);

drop policy if exists "Community delete books" on public.books;
create policy "Community delete books"
  on public.books for delete
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.profile_settings, public.books, public.comments to anon, authenticated;
`;

// Estado global da aplicação
let appState = null;
let authSession = null; // { userId, email, username, accessToken, refreshToken, mode: 'local' | 'supabase' }
let currentMainView = 'public'; // 'public' | 'admin'
let currentAdminTab = 'add'; // 'add' | 'catalog' | 'profile' | 'database'
let currentShelfFilter = 'all'; // 'all' | 'reading' | 'read' | 'wishlist'
let publicSearchTerm = '';
let platformSearchTerm = '';
let platformSearchScope = 'all'; // 'all' | 'users' | 'books' | 'topics'
let activeModalBookId = null;
let lastBookSearchResults = [];
let lastPlatformExternalQuery = '';
let lastPlatformExternalResults = [];
let platformExternalLoading = false;
let platformExternalError = '';
let pendingBookToImport = null;
let lastFormCoverGallery = [];
let pendingAdminAfterAuth = false;
let toastTimeout = null;
let profileHighlightTimeout = null;

const verifiedCoverCache = new Map();
const goodreadsCoverCache = new Map();
const pendingBookHeals = new Map();
let goodreadsConsecutiveFailures = 0;

/* ==========================================================================
   DADOS INICIAIS DE DEMONSTRAÇÃO (SEED DATA)
   ========================================================================== */
const SEED_ISBN_COVERS = {
  '9786555871784': 'https://is1-ssl.mzstatic.com/image/thumb/Publication114/v4/f4/e6/1e/f4e61e78-e45d-cd21-940b-88538e3557ea/1033041482.jpg/600x900bb.jpg',
  '9786558380542': 'https://is1-ssl.mzstatic.com/image/thumb/Publication125/v4/32/bf/7d/32bf7d8a-1eae-7834-3852-ac987fbb60ad/1034605913.jpg/600x900bb.jpg',
  '9786580309313': 'https://is1-ssl.mzstatic.com/image/thumb/Publication211/v4/81/4a/22/814a22dd-f22f-e45f-e709-d7e24e85aedc/1029530605.jpg/600x900bb.jpg',
  '9788584391509': 'https://is1-ssl.mzstatic.com/image/thumb/Publication123/v4/13/4a/55/134a559d-fa8a-e916-bb53-3c382c610b29/1029791603.jpg/600x900bb.jpg',
  '9788556510150': 'https://is1-ssl.mzstatic.com/image/thumb/Publication126/v4/6a/1d/bc/6a1dbcc9-d58d-39e1-98e0-bda583685050/1018741239.jpg/600x900bb.jpg',
  '9788535924084': 'https://is1-ssl.mzstatic.com/image/thumb/Publication69/v4/01/91/e0/0191e033-526a-ae19-7e46-b77a393e1339/1013938640.jpg/600x900bb.jpg',
  '9788508171279': 'https://covers.openlibrary.org/b/isbn/9788508171279-L.jpg?default=false',
  '9788501012074': 'https://is1-ssl.mzstatic.com/image/thumb/Publication211/v4/26/a9/35/26a935f7-cebd-0457-967b-ef0e73a5b1e1/1046126189.jpg/600x900bb.jpg',
  '9788576573135': 'https://is1-ssl.mzstatic.com/image/thumb/Publication116/v4/b0/db/ea/b0dbea13-e38e-1bc7-6374-0892900b5df2/1011641444.jpg/600x900bb.jpg',
  '9788576570660': 'https://is1-ssl.mzstatic.com/image/thumb/Publication112/v4/e4/1f/c1/e41fc107-c9d5-3178-9038-25201bb9dfdb/1011450937.jpg/600x900bb.jpg',
  '9788501116437': 'https://is1-ssl.mzstatic.com/image/thumb/Publication124/v4/28/72/a4/2872a4c6-ae79-63dd-ffc3-8064898ce97e/1028032744.jpg/600x900bb.jpg',
  '9788501117847': 'https://is1-ssl.mzstatic.com/image/thumb/Publication114/v4/31/04/66/31046671-1d53-eef3-6dd0-a6db859220d3/1031034141.jpg/600x900bb.jpg'
};

function createDemoAccount() {
  const now = new Date().toISOString();
  return {
    userId: DEMO_USER_ID,
    email: 'demo@naminhaestante.app',
    password: '',
    passwordHash: DEMO_PASSWORD_HASH,
    profile: {
      name: 'Clara Mendes',
      username: 'leitoracriativa',
      bio: 'Criadora literária & apaixonada por ficção contemporânea, thrillers psicológicos e literatura brasileira. Todos os meus livros e indicações em um só lugar.',
      avatarUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=300&q=80',
      instagramUrl: 'https://instagram.com/leitoracriativa',
      following: ['marileituras', 'biaentrepaginas']
    },
    clubs: [
      { id: 'club_1', emoji: '📦', name: 'Clube Intrínsecos', meta: 'Assinatura Mensal' },
      { id: 'club_2', emoji: '💜', name: 'Leia Mulheres', meta: 'Encontro Coletivo' },
      { id: 'club_3', emoji: '🔪', name: 'Clube do Thriller', meta: 'Suspense & Mistério' }
    ],
    books: [
      {
        id: 'book_tudo_e_rio',
        title: 'Tudo é Rio',
        author: 'Carla Madeira',
        coverUrl: SEED_ISBN_COVERS['9786555871784'],
        shelf: 'reading',
        rating: 0,
        progress: 68,
        synopsis: 'Com uma narrativa madura, precisa e ao mesmo tempo delicada e poética, Carla Madeira costura a história de Dalva e Venâncio, um casal cuja vida é transformada por uma perda trágica e pela chegada de Lucy, a mulher mais desejada da cidade.',
        review: 'Estou em 68% e completamente impactada pela escrita poética da Carla Madeira. Cada capítulo parece um soco bonito e visceral — leitura obrigatória do nosso clube este mês.',
        isbn: '9786555871784',
        createdAt: now
      },
      {
        id: 'book_biblioteca_meia_noite',
        title: 'A Biblioteca da Meia-Noite',
        author: 'Matt Haig',
        coverUrl: SEED_ISBN_COVERS['9786558380542'],
        shelf: 'read',
        rating: 5,
        progress: 100,
        synopsis: 'Entre a vida e a morte existe uma biblioteca com infinitos livros. Cada livro oferece a oportunidade de experimentar outra vida que Nora Seed poderia ter vivido se tivesse tomado decisões diferentes.',
        review: 'Um abraço literário sobre arrependimentos, escolhas e segundas chances. Li em um fim de semana e virou indicação fixa para quem está passando por fases de transição.',
        isbn: '9786558380542',
        createdAt: now
      },
      {
        id: 'book_torto_arado',
        title: 'Torto Arado',
        author: 'Itamar Vieira Junior',
        coverUrl: SEED_ISBN_COVERS['9786580309313'],
        shelf: 'read',
        rating: 5,
        progress: 100,
        synopsis: 'Nas profundezas do sertão baiano, as irmãs Bibiana e Belonísia encontram uma antiga faca na mala da avó e um acidente sela seus destinos para sempre, entrelaçando ancestralidade, terra e resistência.',
        review: 'Obra-prima absoluta da literatura brasileira contemporânea. A força de Bibiana, Belonísia e Santa Rita Pescadeira fica ecoando por semanas depois da última página.',
        isbn: '9786580309313',
        createdAt: now
      },
      {
        id: 'book_evelyn_hugo',
        title: 'Os Sete Maridos de Evelyn Hugo',
        author: 'Taylor Jenkins Reid',
        coverUrl: SEED_ISBN_COVERS['9788584391509'],
        shelf: 'read',
        rating: 4,
        progress: 100,
        synopsis: 'Aos 79 anos, a lendária estrela de Hollywood Evelyn Hugo decide finalmente contar toda a verdade sobre sua vida glamourosa e escandalosa, escolhendo uma jornalista desconhecida para ouvir sua história.',
        review: 'Envolvente do início ao fim, com cara de filme clássico de Hollywood e reviravoltas emocionantes. Impossível largar depois dos primeiros capítulos!',
        isbn: '9788584391509',
        createdAt: now
      },
      {
        id: 'book_tres_corpos',
        title: 'O Problema dos Três Corpos',
        author: 'Cixin Liu',
        coverUrl: SEED_ISBN_COVERS['9788556510150'],
        shelf: 'wishlist',
        rating: 0,
        progress: 0,
        synopsis: 'Durante a Revolução Cultural Chinesa, um projeto militar secreto envia sinais ao espaço e estabelece contato com uma civilização alienígena à beira da destruição.',
        review: 'Na minha lista de próximas leituras de ficção científica — quero terminar antes da próxima temporada da série!',
        isbn: '9788556510150',
        createdAt: now
      },
      {
        id: 'book_cabeca_do_santo',
        title: 'A Cabeça do Santo',
        author: 'Socorro Acioli',
        coverUrl: SEED_ISBN_COVERS['9788535924084'],
        shelf: 'wishlist',
        rating: 0,
        progress: 0,
        synopsis: 'Samuel caminha até o Ceará para cumprir o último pedido da mãe e acaba encontrando abrigo dentro da cabeça oca e gigantesca de uma estátua inacabada de Santo Antônio, onde passa a ouvir preces de amor.',
        review: 'Super indicado pelas meninas do Clube Leia Mulheres. Mal posso esperar para começar!',
        isbn: '9788535924084',
        createdAt: now
      }
    ]
  };
}

function createDefaultCommunityAccounts() {
  const now = new Date().toISOString();

  const marianaAccount = {
    userId: 'demo_marileituras',
    email: 'mariana@naminhaestante.app',
    password: '',
    passwordHash: DEMO_PASSWORD_HASH,
    profile: {
      name: 'Mariana Costa',
      username: 'marileituras',
      bio: 'Apaixonada por literatura brasileira, poesia e clubes de leitura coletivos. Sempre com um livro nacional na bolsa.',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
      instagramUrl: 'https://instagram.com/marileituras',
      following: ['leitoracriativa', 'lucas.books']
    },
    clubs: [
      { id: 'club_mari_1', emoji: '💜', name: 'Leia Mulheres', meta: 'Encontro Coletivo' },
      { id: 'club_mari_2', emoji: '🇧🇷', name: 'Brasil em Páginas', meta: 'Literatura Brasileira' }
    ],
    books: [
      {
        id: 'book_mari_torto_arado',
        title: 'Torto Arado',
        author: 'Itamar Vieira Junior',
        coverUrl: SEED_ISBN_COVERS['9786580309313'],
        shelf: 'reading',
        rating: 0,
        progress: 54,
        synopsis: 'Nas profundezas do sertão baiano, as irmãs Bibiana e Belonísia encontram uma antiga faca na mala da avó e um acidente sela seus destinos para sempre.',
        review: 'Relendo para o debate de Literatura Brasileira deste mês no clube. Cada releitura revela novos detalhes sobre memória e ancestralidade.',
        isbn: '9786580309313',
        createdAt: now
      },
      {
        id: 'book_mari_quarto_despejo',
        title: 'Quarto de Despejo',
        author: 'Carolina Maria de Jesus',
        coverUrl: SEED_ISBN_COVERS['9788508171279'],
        shelf: 'read',
        rating: 5,
        progress: 100,
        synopsis: 'O diário real de Carolina Maria de Jesus retratando com lucidez, poesia e força a rotina na favela do Canindé, em São Paulo, na década de 1950.',
        review: 'Clássico indispensável da literatura brasileira. Leitura forte, poética e necessária para todo leitor.',
        isbn: '9788508171279',
        createdAt: now
      },
      {
        id: 'book_mari_vidas_secas',
        title: 'Vidas Secas',
        author: 'Graciliano Ramos',
        coverUrl: SEED_ISBN_COVERS['9788501012074'],
        shelf: 'wishlist',
        rating: 0,
        progress: 0,
        synopsis: 'A saga de Fabiano, Sinhá Vitória, os dois meninos e a cadela Baleia enfrentando a aridez do sertão nordestino.',
        review: 'Próxima leitura do projeto de clássicos da literatura brasileira.',
        isbn: '9788501012074',
        createdAt: now
      }
    ]
  };

  const lucasAccount = {
    userId: 'demo_lucasbooks',
    email: 'lucas@naminhaestante.app',
    password: '',
    passwordHash: DEMO_PASSWORD_HASH,
    profile: {
      name: 'Lucas Almeida',
      username: 'lucas.books',
      bio: 'Leitor voraz de ficção científica, fantasia épica e não-ficção. Resenhas diretas ao ponto e indicações semanais.',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
      instagramUrl: 'https://instagram.com/lucas.books',
      following: ['leitoracriativa', 'marileituras']
    },
    clubs: [
      { id: 'club_lucas_1', emoji: '🚀', name: 'Sci-Fi Brasil', meta: 'Ficção Científica' },
      { id: 'club_lucas_2', emoji: '📦', name: 'Clube Intrínsecos', meta: 'Assinatura Mensal' }
    ],
    books: [
      {
        id: 'book_lucas_duna',
        title: 'Duna',
        author: 'Frank Herbert',
        coverUrl: SEED_ISBN_COVERS['9788576573135'],
        shelf: 'reading',
        rating: 0,
        progress: 75,
        synopsis: 'Em Arrakis, o planeta desértico que guarda a especiaria mais valiosa do universo, Paul Atreides assume seu destino entre intrigas políticas e profecias.',
        review: 'Construção de mundo absurda! A mistura de ecologia, política e ficção científica continua atual décadas depois.',
        isbn: '9788576573135',
        createdAt: now
      },
      {
        id: 'book_lucas_tres_corpos',
        title: 'O Problema dos Três Corpos',
        author: 'Cixin Liu',
        coverUrl: SEED_ISBN_COVERS['9788556510150'],
        shelf: 'read',
        rating: 5,
        progress: 100,
        synopsis: 'Um projeto militar secreto envia sinais ao espaço e estabelece contato com uma civilização alienígena à beira da destruição.',
        review: 'Ficção científica hard de altíssimo nível. Te faz questionar física, humanidade e futuro do começo ao fim.',
        isbn: '9788556510150',
        createdAt: now
      },
      {
        id: 'book_lucas_fundacao',
        title: 'Fundação',
        author: 'Isaac Asimov',
        coverUrl: SEED_ISBN_COVERS['9788576570660'],
        shelf: 'wishlist',
        rating: 0,
        progress: 0,
        synopsis: 'O matemático Hari Seldon prevê a queda do Império Galáctico e cria uma fundação para preservar o conhecimento humano.',
        review: 'Na fila para a maratona de ficção científica clássica.',
        isbn: '9788576570660',
        createdAt: now
      }
    ]
  };

  const beatrizAccount = {
    userId: 'demo_biaentrepaginas',
    email: 'bia@naminhaestante.app',
    password: '',
    passwordHash: DEMO_PASSWORD_HASH,
    profile: {
      name: 'Beatriz Souza',
      username: 'biaentrepaginas',
      bio: 'Curadora de romances históricos, suspense policial e thrillers psicológicos de tirar o fôlego.',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      instagramUrl: 'https://instagram.com/biaentrepaginas',
      following: ['leitoracriativa', 'marileituras']
    },
    clubs: [
      { id: 'club_bia_1', emoji: '🔪', name: 'Clube do Thriller', meta: 'Suspense & Mistério' },
      { id: 'club_bia_2', emoji: '🕵️', name: 'Mistério & Café', meta: 'Suspense Policial' }
    ],
    books: [
      {
        id: 'book_bia_paciente',
        title: 'A Paciente Silenciosa',
        author: 'Alex Michaelides',
        coverUrl: SEED_ISBN_COVERS['9788501116437'],
        shelf: 'reading',
        rating: 0,
        progress: 45,
        synopsis: 'Alicia Berenson atira cinco vezes no rosto do marido e nunca mais pronuncia uma única palavra. Um psicoterapeuta fica obcecado em fazê-la falar.',
        review: 'Suspense psicológico viciante! Cada sessão de terapia traz uma pista nova e deixa impossível largar antes de dormir.',
        isbn: '9788501116437',
        createdAt: now
      },
      {
        id: 'book_bia_evelyn_hugo',
        title: 'Os Sete Maridos de Evelyn Hugo',
        author: 'Taylor Jenkins Reid',
        coverUrl: SEED_ISBN_COVERS['9788584391509'],
        shelf: 'read',
        rating: 5,
        progress: 100,
        synopsis: 'Aos 79 anos, Evelyn Hugo decide revelar todos os segredos de sua carreira e de seus sete casamentos em Hollywood.',
        review: 'Favorito absoluto! Drama, segredos e personagens inesquecíveis do primeiro ao último capítulo.',
        isbn: '9788584391509',
        createdAt: now
      },
      {
        id: 'book_bia_verity',
        title: 'Verity',
        author: 'Colleen Hoover',
        coverUrl: SEED_ISBN_COVERS['9788501117847'],
        shelf: 'wishlist',
        rating: 0,
        progress: 0,
        synopsis: 'Lowen Ashleigh é contratada para concluir a série de livros de uma famosa autora incapacitada, mas descobre um manuscrito perturbador.',
        review: 'Próximo thriller na lista do Clube do Thriller.',
        isbn: '9788501117847',
        createdAt: now
      }
    ]
  };

  return [createDemoAccount(), marianaAccount, lucasAccount, beatrizAccount];
}

function mergeDefaultCommunityAccounts(accounts = []) {
  const list = Array.isArray(accounts) ? [...accounts] : [];
  const seen = new Set(list.map((a) => normalizeUsername(a.profile?.username)));
  for (const communityAcc of createDefaultCommunityAccounts()) {
    const slug = normalizeUsername(communityAcc.profile?.username);
    if (slug && !seen.has(slug)) {
      list.push(communityAcc);
      seen.add(slug);
    }
  }
  return list;
}

function createSeedState() {
  const communityAccounts = createDefaultCommunityAccounts();
  const demo = communityAccounts[0];
  return {
    accounts: communityAccounts,
    activePublicUsername: demo.profile.username,
    profile: { ...demo.profile },
    clubs: demo.clubs.map((c) => ({ ...c })),
    books: demo.books.map((b) => ({ ...b })),
    comments: [
      {
        id: 'cmt_1',
        bookId: 'book_tudo_e_rio',
        authorName: 'Mariana Costa',
        authorHandle: '@marileituras',
        text: 'Essa escrita da Carla Madeira é arrebatadora! Prepara o coração para o final.',
        rating: 5,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
      },
      {
        id: 'cmt_2',
        bookId: 'book_biblioteca_meia_noite',
        authorName: 'Lucas Almeida',
        authorHandle: '@lucas.books',
        text: 'Comprei pelo seu link na semana passada e devorei em 3 dias. Favorito do ano!',
        rating: 5,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
      },
      {
        id: 'cmt_3',
        bookId: 'book_torto_arado',
        authorName: 'Beatriz Souza',
        authorHandle: '@biaentrepaginas',
        text: 'Um dos livros mais necessários do Brasil. A sua resenha resume perfeitamente!',
        rating: 5,
        createdAt: new Date(Date.now() - 86400000 * 9).toISOString()
      }
    ],
    supabase: {
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY
    }
  };
}

/* ==========================================================================
   UTILITÁRIOS DE SEGURANÇA, CAPAS & LINKS DE AFILIADO AMAZON
   ========================================================================== */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(rawUrl, fallback = '') {
  const val = String(rawUrl || '').trim();
  if (!val) return fallback;
  if (/^https?:\/\//i.test(val) || /^data:image\//i.test(val)) {
    return val;
  }
  if (/^[\w.-]+\.[a-z]{2,}/i.test(val)) {
    return `https://${val}`;
  }
  return fallback;
}

function generateId(prefix = 'id') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sha256HexFallback(inputStr) {
  const bytes = new TextEncoder().encode(String(inputStr ?? ''));
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  const bitLen = bytes.length * 8;
  words[bitLen >> 5] = (words[bitLen >> 5] || 0) | (0x80 << (24 - (bitLen % 32)));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (n, x) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);

  for (let i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const s0 = rotr(7, w[j - 15]) ^ rotr(18, w[j - 15]) ^ (w[j - 15] >>> 3);
        const s1 = rotr(17, w[j - 2]) ^ rotr(19, w[j - 2]) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H = [
      (H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0,
      (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0
    ];
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

async function hashPasswordSha256(plainText) {
  const value = String(plainText ?? '');
  if (window.crypto && window.crypto.subtle && typeof window.TextEncoder === 'function') {
    try {
      const encoded = new TextEncoder().encode(value);
      const digest = await window.crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch (_) {}
  }
  return sha256HexFallback(value);
}

async function verifyAccountPassword(plainPassword, localAcc = null, remoteMeta = null) {
  const inputHash = await hashPasswordSha256(plainPassword);
  const storedHash = String(remoteMeta?.passwordHash || localAcc?.passwordHash || '').trim();
  if (storedHash) {
    return inputHash === storedHash;
  }
  if (localAcc && localAcc.password) {
    return localAcc.password === plainPassword;
  }
  return false;
}

function buildFallbackCoverDataUri(title, author) {
  const shortTitle = escapeHtml((title || 'Sem Título').slice(0, 42));
  const shortAuthor = escapeHtml((author || 'Autor desconhecido').slice(0, 28));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#8F391A"/>
          <stop offset="55%" stop-color="#C85A32"/>
          <stop offset="100%" stop-color="#D97706"/>
        </linearGradient>
      </defs>
      <rect width="320" height="480" fill="url(#g)"/>
      <rect x="18" y="0" width="6" height="480" fill="rgba(255,255,255,0.22)"/>
      <rect x="34" y="34" width="252" height="412" rx="8" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
      <text x="160" y="190" text-anchor="middle" fill="#FFFBF2" font-family="Georgia, serif" font-size="22" font-weight="bold">
        <tspan x="160" dy="0">${shortTitle.slice(0, 20)}</tspan>
        <tspan x="160" dy="28">${shortTitle.slice(20, 42)}</tspan>
      </text>
      <text x="160" y="320" text-anchor="middle" fill="rgba(255,251,242,0.85)" font-family="sans-serif" font-size="14">${shortAuthor}</text>
      <text x="160" y="420" text-anchor="middle" fill="rgba(255,251,242,0.65)" font-family="sans-serif" font-size="11" letter-spacing="2">NA MINHA ESTANTE</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function cleanIsbn(raw) {
  const str = String(raw || '').trim().toUpperCase();
  if (!str) return '';
  const stripped = str.replace(/ISBN(?:-?1[03])?:?/gi, '').replace(/[\s-]/g, '');
  if (/^\d{13}$/.test(stripped) || /^\d{9}[0-9X]$/.test(stripped)) {
    return stripped;
  }
  const match = str.match(/(?:97[89][\d\s-]{10,16}|\b\d[\d\s-]{8,14}[0-9X]\b)/i);
  if (match) {
    const candidate = match[0].replace(/[\s-]/g, '').toUpperCase();
    if (/^\d{13}$/.test(candidate) || /^\d{9}[0-9X]$/.test(candidate)) {
      return candidate;
    }
  }
  return '';
}

function isbn13ToIsbn10(isbn13) {
  const clean = cleanIsbn(isbn13);
  if (clean.length === 10) return clean;
  if (clean.length !== 13 || !clean.startsWith('978')) return '';
  const body = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(body[i]) * (10 - i);
  }
  const rem = (11 - (sum % 11)) % 11;
  const check = rem === 10 ? 'X' : String(rem);
  return `${body}${check}`;
}

function isbn10ToIsbn13(isbn10) {
  const clean = cleanIsbn(isbn10);
  if (clean.length === 13) return clean;
  if (clean.length !== 10) return '';
  const base = `978${clean.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${base}${check}`;
}

function parseAmazonInput(input) {
  const trimmed = String(input || '').trim();
  const empty = {
    isAmazonUrl: false,
    asin: '',
    isbn10: '',
    isbn13: '',
    slugQuery: ''
  };
  if (!trimmed) return empty;

  const amazonUrlRegex = /(?:^https?:\/\/(?:www\.|smile\.)?(?:amazon\.[a-z.]+|a\.co|amzn\.to|amzn\.eu)\b|^(?:www\.)?amazon\.com(?:\.br)?\/)/i;
  const isAmazonUrl = amazonUrlRegex.test(trimmed);

  let asin = '';
  let slugQuery = '';

  if (isAmazonUrl) {
    const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsedUrl = new URL(normalizedUrl);
      const path = parsedUrl.pathname || '';
      const asinMatch = path.match(/\/(?:dp|gp\/product|gp\/aw\/d|product|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[/?&#]|$)/i);
      if (asinMatch) {
        asin = asinMatch[1].toUpperCase();
        const beforeDp = path.slice(0, asinMatch.index).split('/').filter(Boolean);
        const lastSegment = beforeDp[beforeDp.length - 1] || '';
        if (lastSegment && !/^(?:dp|gp|product|s|b|ref)$/i.test(lastSegment)) {
          let decoded = lastSegment;
          try {
            decoded = decodeURIComponent(lastSegment);
          } catch (_) {}
          slugQuery = decoded
            .replace(/[-_+]+/g, ' ')
            .replace(/\b(?:ebook|kindle|capa\s+comum|capa\s+dura|edicao|edição)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
      }

      if (!asin) {
        const paramAsin = parsedUrl.searchParams.get('asin') || parsedUrl.searchParams.get('ASIN');
        if (paramAsin && /^[A-Z0-9]{10}$/i.test(paramAsin.trim())) {
          asin = paramAsin.trim().toUpperCase();
        }
      }

      if (!slugQuery) {
        const qParam = parsedUrl.searchParams.get('k') || parsedUrl.searchParams.get('keywords') || '';
        if (qParam) {
          slugQuery = qParam.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
    } catch (_) {
      const fallbackMatch = trimmed.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
      if (fallbackMatch) {
        asin = fallbackMatch[1].toUpperCase();
      }
    }
  } else if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
    asin = trimmed.toUpperCase();
  }

  const candidateIsbn = cleanIsbn(asin || trimmed);
  let isbn10 = '';
  let isbn13 = '';

  if (candidateIsbn.length === 13) {
    isbn13 = candidateIsbn;
    isbn10 = isbn13ToIsbn10(candidateIsbn);
    if (!asin && isbn10) asin = isbn10;
  } else if (candidateIsbn.length === 10) {
    isbn10 = candidateIsbn;
    isbn13 = isbn10ToIsbn13(candidateIsbn);
    if (!asin) asin = isbn10;
  }

  return {
    isAmazonUrl,
    asin,
    isbn10,
    isbn13,
    slugQuery
  };
}

function buildAmazonDirectCoverCandidates(isbnOrAsin) {
  const raw = String(isbnOrAsin || '').trim().toUpperCase();
  if (!raw) return [];

  const asins = new Set();
  const clean = cleanIsbn(raw);
  if (clean.length === 13) {
    const converted = isbn13ToIsbn10(clean);
    if (converted) asins.add(converted);
  } else if (clean.length === 10) {
    asins.add(clean);
  } else if (/^[A-Z0-9]{10}$/.test(raw)) {
    asins.add(raw);
  }

  const candidates = [];
  for (const asin of asins) {
    candidates.push(`https://images-na.ssl-images-amazon.com/images/P/${encodeURIComponent(asin)}.01._SCLZZZZZZZ_.jpg`);
    candidates.push(`https://m.media-amazon.com/images/P/${encodeURIComponent(asin)}.01.LZZZZZZZ.jpg`);
  }
  return candidates;
}

function normalizeCoverCandidateUrl(url) {
  let clean = safeUrl(url, '');
  if (!clean) return '';
  if (/^data:image\//i.test(clean)) return clean;

  clean = clean.replace(/^http:\/\//i, 'https://');
  if (/books\.google\./i.test(clean)) {
    clean = clean.replace(/&edge=curl/gi, '');
  }
  if (/covers\.openlibrary\.org\/b\//i.test(clean) && !/[?&]default=/i.test(clean)) {
    clean += (clean.includes('?') ? '&' : '?') + 'default=false';
  }
  return clean;
}

function stripHtmlTags(html) {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(String(html), 'text/html');
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch (_) {
    return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

async function fetchJsonWithTimeout(url, timeoutMs = 6500) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function probeImageUrl(url, timeoutMs = 3500) {
  const normalized = normalizeCoverCandidateUrl(url);
  if (!normalized) return Promise.resolve(null);
  if (normalized.startsWith('data:image/')) return Promise.resolve(normalized);

  if (verifiedCoverCache.has(normalized)) {
    return verifiedCoverCache.get(normalized);
  }

  const promise = new Promise((resolve) => {
    const img = new Image();
    let settled = false;

    const finish = (result, isTimeout = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      if (isTimeout) {
        verifiedCoverCache.delete(normalized);
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish(null, true), timeoutMs);

    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (img.naturalWidth > 35 && img.naturalHeight > 35) {
        finish(normalized);
      } else {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = normalized;
  });

  verifiedCoverCache.set(normalized, promise);
  return promise;
}

async function pickFirstValidCover(urls = [], timeoutMs = 3500) {
  const slice = (Array.isArray(urls) ? urls : []).filter(Boolean).slice(0, 6);
  if (slice.length === 0) return '';
  const results = await Promise.all(slice.map((u) => probeImageUrl(u, timeoutMs)));
  return results.find(Boolean) || '';
}

function classifyCoverSource(url) {
  const u = String(url || '').toLowerCase();
  if (/media-amazon\.com|ssl-images-amazon\.com|gr-assets\.com/.test(u)) return 'Amazon CDN';
  if (/mzstatic\.com/.test(u)) return 'Amazon / Apple Books BR';
  if (/books\.google\./.test(u)) return 'Google Books';
  if (/covers\.openlibrary\.org/.test(u)) return 'Open Library';
  return 'Editora / Web';
}

function buildOrderedCoverCandidates(book = {}, extra = {}) {
  const buckets = {
    amazonCdn: [],
    goodreadsByIsbn: [],
    brazilianHd: [],
    goodreadsByTitle: [],
    googleHd: [],
    openLibrary: [],
    other: []
  };

  const addToBucket = (bucketName, rawUrl) => {
    const norm = normalizeCoverCandidateUrl(rawUrl);
    if (!norm || norm.startsWith('data:image/')) return;
    if (!buckets[bucketName].includes(norm)) {
      buckets[bucketName].push(norm);
    }
  };

  const categorizeAndAdd = (rawUrl) => {
    const norm = normalizeCoverCandidateUrl(rawUrl);
    if (!norm || norm.startsWith('data:image/')) return;
    const lower = norm.toLowerCase();
    if (/media-amazon\.com|ssl-images-amazon\.com|gr-assets\.com/.test(lower)) {
      addToBucket('amazonCdn', norm);
    } else if (/mzstatic\.com/.test(lower)) {
      addToBucket('brazilianHd', norm);
    } else if (/books\.google\./.test(lower)) {
      addToBucket('googleHd', norm);
    } else if (/covers\.openlibrary\.org/.test(lower)) {
      addToBucket('openLibrary', norm);
    } else {
      addToBucket('other', norm);
    }
  };

  const isbnClean = cleanIsbn(book.isbn);
  if (book.asin) {
    buildAmazonDirectCoverCandidates(book.asin).forEach((u) => addToBucket('amazonCdn', u));
  }
  if (isbnClean) {
    buildAmazonDirectCoverCandidates(isbnClean).forEach((u) => addToBucket('amazonCdn', u));
  }

  if (extra.goodreadsByIsbn) {
    addToBucket('goodreadsByIsbn', extra.goodreadsByIsbn);
  }
  if (extra.goodreadsByTitle) {
    addToBucket('goodreadsByTitle', extra.goodreadsByTitle);
  }

  const extraList = Array.isArray(extra.candidates) ? extra.candidates : [];
  const bookCandidates = Array.isArray(book.coverCandidates) ? book.coverCandidates : [];
  for (const url of [...bookCandidates, ...extraList, book.thumbnail, book.coverUrl]) {
    if (url) categorizeAndAdd(url);
  }

  if (isbnClean) {
    addToBucket('openLibrary', `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbnClean)}-L.jpg?default=false`);
  }

  const ordered = [];
  const seen = new Set();
  for (const list of [
    buckets.amazonCdn,
    buckets.goodreadsByIsbn,
    buckets.brazilianHd,
    buckets.other,
    buckets.goodreadsByTitle,
    buckets.googleHd,
    buckets.openLibrary
  ]) {
    for (const url of list) {
      if (!seen.has(url)) {
        seen.add(url);
        ordered.push(url);
      }
    }
  }
  return ordered;
}

function renderBookCoverImgAttrs(book = {}, idAttr = '') {
  const safeId = escapeHtml(book.id || '');
  const safeTitle = escapeHtml(book.title || 'Sem título');
  const safeAuthor = escapeHtml(book.author || 'Autor desconhecido');
  const safeIsbn = escapeHtml(book.isbn || '');
  const idHtml = idAttr ? `id="${escapeHtml(idAttr)}" ` : '';
  return `${idHtml}data-book-id="${safeId}" data-book-title="${safeTitle}" data-book-author="${safeAuthor}" data-book-isbn="${safeIsbn}" onload="handleBookCoverLoad(this)" onerror="handleBookCoverError(this)"`;
}

async function resolveBestCoverForBook({ title = '', author = '', isbn = '', asin = '', coverCandidates = [], thumbnail = '', coverUrl = '', skipExternalLookup = false } = {}) {
  const clean = cleanIsbn(isbn);

  // 1. Se já existem candidatos não-OpenLibrary (ex: resultado de busca multi-fonte), valida em paralelo de imediato
  const preExistingNonOl = buildOrderedCoverCandidates({
    title,
    author,
    isbn: clean,
    asin,
    coverCandidates,
    thumbnail,
    coverUrl
  }).filter((u) => !/covers\.openlibrary\.org/i.test(u));

  const hasTrustedHdInput = [...(Array.isArray(coverCandidates) ? coverCandidates : []), thumbnail, coverUrl]
    .filter(Boolean)
    .some((u) => !/covers\.openlibrary\.org/i.test(u));

  if (hasTrustedHdInput && preExistingNonOl.length > 0) {
    const immediateValid = await pickFirstValidCover(preExistingNonOl, 2200);
    if (immediateValid) return immediateValid;
  }

  // 2. Consulta rápida: Amazon CDN direta + Apple Books BR em paralelo
  const extraAppleCandidates = [];
  if (!skipExternalLookup && title && title !== 'Sem título') {
    const searchQ = [title, author && author !== 'Autor desconhecido' ? author : ''].filter(Boolean).join(' ');
    try {
      const items = await searchAppleBooksBR(searchQ);
      const titleNorm = normalizeSearchText(title).split(':')[0].trim();
      const authorParts = normalizeSearchText(author).split(',')[0].trim().split(/\s+/).filter(Boolean);
      const authorSurname = authorParts[authorParts.length - 1] || '';
      const matched = items.find((it) => {
        const itTitle = normalizeSearchText(it.title);
        const itAuthor = normalizeSearchText(it.author);
        const titleOk = titleNorm && itTitle.includes(titleNorm);
        if (!titleOk) return false;
        if (!authorSurname || authorSurname === 'desconhecido') return true;
        return itAuthor.includes(authorSurname);
      });
      if (matched && Array.isArray(matched.coverCandidates)) {
        extraAppleCandidates.push(...matched.coverCandidates);
      }
    } catch (_) {}
  }

  const primaryOrdered = buildOrderedCoverCandidates(
    { title, author, isbn: clean, asin, coverCandidates, thumbnail, coverUrl },
    { candidates: extraAppleCandidates }
  );
  const primaryNonOl = primaryOrdered.filter((u) => !/covers\.openlibrary\.org/i.test(u));
  if (primaryNonOl.length > 0) {
    const validPrimary = await pickFirstValidCover(primaryNonOl, 2200);
    if (validPrimary) return validPrimary;
  }

  // 3. Fallback adicional (Goodreads-Amazon com circuit-breaker + Google Books + Open Library)
  if (!skipExternalLookup && (clean || (title && title !== 'Sem título'))) {
    const q = clean ? `isbn:${clean}` : [title, author && author !== 'Autor desconhecido' ? author : ''].filter(Boolean).join(' ');
    const [grRes, gbRes, olRes] = await Promise.allSettled([
      fetchGoodreadsAmazonCover({ title, author, isbn: clean }),
      searchGoogleBooks(q),
      searchOpenLibrary(clean || q)
    ]);

    const extraFallback = [];
    if (grRes.status === 'fulfilled' && grRes.value) {
      extraFallback.push(grRes.value);
    }
    for (const res of [gbRes, olRes]) {
      if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value[0]) {
        const first = res.value[0];
        if (Array.isArray(first.coverCandidates)) extraFallback.push(...first.coverCandidates);
        if (first.thumbnail) extraFallback.push(first.thumbnail);
      }
    }

    const combinedFallback = buildOrderedCoverCandidates(
      { title, author, isbn: clean, asin, coverCandidates, thumbnail, coverUrl },
      { candidates: extraFallback }
    ).filter((u) => !primaryNonOl.includes(u));

    const validFallback = await pickFirstValidCover(combinedFallback, 2200);
    if (validFallback) return validFallback;
  }

  // Último recurso: Open Library da lista inicial
  const olOnly = primaryOrdered.filter((u) => /covers\.openlibrary\.org/i.test(u));
  if (olOnly.length > 0) {
    const validOl = await pickFirstValidCover(olOnly, 2200);
    if (validOl) return validOl;
  }

  return '';
}

async function resolveCoverGalleryForBook({ title = '', author = '', isbn = '', asin = '' } = {}) {
  const clean = cleanIsbn(isbn);
  const queryText = [title, author && author !== 'Autor desconhecido' ? author : ''].filter(Boolean).join(' ').trim();
  if (!clean && !asin && !queryText) return [];

  const tasks = [];
  if (clean) tasks.push(fetchGoodreadsAmazonCoverByIsbn(clean));
  if (title && title !== 'Sem título') tasks.push(fetchGoodreadsAmazonCoverByTitle(title, author));
  if (clean) tasks.push(searchBrasilApiIsbn(clean));
  if (queryText || clean) {
    tasks.push(searchAppleBooksBR(queryText || clean));
    tasks.push(searchGoogleBooks(clean ? `isbn:${clean}` : queryText));
    tasks.push(searchOpenLibrary(clean || queryText));
  }

  const settled = await Promise.allSettled(tasks);
  const rawUrls = [];

  if (asin) rawUrls.push(...buildAmazonDirectCoverCandidates(asin));
  if (clean) rawUrls.push(...buildAmazonDirectCoverCandidates(clean));

  for (const res of settled) {
    if (res.status !== 'fulfilled' || !res.value) continue;
    if (typeof res.value === 'string') {
      rawUrls.push(res.value);
    } else if (Array.isArray(res.value)) {
      for (const item of res.value.slice(0, 4)) {
        if (Array.isArray(item.coverCandidates)) rawUrls.push(...item.coverCandidates);
        if (item.thumbnail) rawUrls.push(item.thumbnail);
      }
    }
  }

  if (clean) {
    rawUrls.push(`https://covers.openlibrary.org/b/isbn/${encodeURIComponent(clean)}-L.jpg?default=false`);
  }

  const uniqueUrls = [];
  const seen = new Set();
  for (const u of rawUrls) {
    const norm = normalizeCoverCandidateUrl(u);
    if (norm && !norm.startsWith('data:image/') && !seen.has(norm)) {
      seen.add(norm);
      uniqueUrls.push(norm);
    }
  }

  const probed = await Promise.all(
    uniqueUrls.slice(0, 14).map(async (url) => {
      const valid = await probeImageUrl(url);
      return valid ? { url: valid, source: classifyCoverSource(valid) } : null;
    })
  );

  const gallery = [];
  const verifiedSeen = new Set();
  for (const entry of probed) {
    if (entry && !verifiedSeen.has(entry.url)) {
      verifiedSeen.add(entry.url);
      gallery.push(entry);
    }
  }
  return gallery;
}

function updateBookCoverInStateAndDom(bookId, title, author, isbn, resolvedUrl) {
  if (!resolvedUrl || !appState) return false;
  const cleanTargetIsbn = cleanIsbn(isbn);
  const normTitle = normalizeSearchText(title);
  const normAuthor = normalizeSearchText(author);

  const isSameBook = (b) => {
    if (!b) return false;
    if (bookId && b.id === bookId) return true;
    const bIsbn = cleanIsbn(b.isbn);
    if (cleanTargetIsbn && bIsbn && cleanTargetIsbn === bIsbn) return true;
    if (normTitle && normalizeSearchText(b.title) === normTitle) {
      if (!normAuthor || normAuthor === 'autor desconhecido' || normalizeSearchText(b.author) === normAuthor) {
        return true;
      }
    }
    return false;
  };

  let changed = false;
  if (Array.isArray(appState.books)) {
    for (const b of appState.books) {
      if (isSameBook(b) && b.coverUrl !== resolvedUrl) {
        b.coverUrl = resolvedUrl;
        changed = true;
      }
    }
  }
  if (Array.isArray(appState.accounts)) {
    for (const acc of appState.accounts) {
      if (!Array.isArray(acc.books)) continue;
      for (const b of acc.books) {
        if (isSameBook(b) && b.coverUrl !== resolvedUrl) {
          b.coverUrl = resolvedUrl;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    saveState();
  }

  document.querySelectorAll('img[data-book-id]').forEach((imgEl) => {
    const elId = imgEl.dataset.bookId || '';
    const elIsbn = cleanIsbn(imgEl.dataset.bookIsbn || '');
    const elTitle = normalizeSearchText(imgEl.dataset.bookTitle || '');
    const matches =
      (bookId && elId === bookId) ||
      (cleanTargetIsbn && elIsbn && elIsbn === cleanTargetIsbn) ||
      (normTitle && elTitle === normTitle);
    if (matches && imgEl.src !== resolvedUrl) {
      imgEl.dataset.fallbackApplied = '1';
      imgEl.dataset.healingApplied = '1';
      imgEl.src = resolvedUrl;
    }
  });

  return changed;
}

function healBookCover({ bookId = '', title = '', author = '', isbn = '' } = {}) {
  const cleanTargetIsbn = cleanIsbn(isbn);
  const key = cleanTargetIsbn || `${normalizeSearchText(title)}::${normalizeSearchText(author)}` || bookId;
  if (!key) return Promise.resolve('');

  if (pendingBookHeals.has(key)) {
    return pendingBookHeals.get(key);
  }

  const promise = resolveBestCoverForBook({ title, author, isbn: cleanTargetIsbn })
    .then((resolvedUrl) => {
      if (resolvedUrl) {
        updateBookCoverInStateAndDom(bookId, title, author, cleanTargetIsbn, resolvedUrl);
      }
      return resolvedUrl;
    })
    .catch(() => '')
    .finally(() => {
      pendingBookHeals.delete(key);
    });

  pendingBookHeals.set(key, promise);
  return promise;
}

async function healAllShelfCoversInBackground() {
  if (!appState) return;
  const candidates = [];
  const seenKeys = new Set();

  const collectBook = (b) => {
    if (!b) return;
    const rawCover = String(b.coverUrl || '').trim();
    const needsHeal = !rawCover || /covers\.openlibrary\.org/i.test(rawCover) || /images\/P\//i.test(rawCover);
    if (!needsHeal) return;

    const cleanTargetIsbn = cleanIsbn(b.isbn);
    const key = cleanTargetIsbn || `${normalizeSearchText(b.title)}::${normalizeSearchText(b.author)}` || b.id;
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    candidates.push(b);
  };

  (appState.books || []).forEach(collectBook);
  (appState.accounts || []).forEach((acc) => {
    (acc.books || []).forEach(collectBook);
  });

  if (candidates.length === 0) return;

  const concurrency = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < candidates.length) {
      const idx = cursor++;
      const book = candidates[idx];
      try {
        const rawCover = String(book.coverUrl || '').trim();
        if (rawCover && /[?&]default=false\b/i.test(rawCover)) {
          const alreadyValid = await probeImageUrl(rawCover, 2200);
          if (alreadyValid) continue;
        }
        await healBookCover({
          bookId: book.id,
          title: book.title,
          author: book.author,
          isbn: book.isbn || ''
        });
      } catch (_) {}
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
}

window.handleBookCoverLoad = function (img, bookId = '', title = '', author = '', isbn = '') {
  if (!img || !img.src || img.src.startsWith('data:image/')) return;
  if (img.naturalWidth <= 20 || img.naturalHeight <= 20) {
    handleBookCoverError(
      img,
      title || img.dataset.bookTitle || '',
      author || img.dataset.bookAuthor || '',
      bookId || img.dataset.bookId || '',
      isbn || img.dataset.bookIsbn || ''
    );
  }
};

window.handleBookCoverError = function (img, title = '', author = '', bookId = '', isbn = '') {
  if (!img) return;
  const resolvedTitle = title || img.dataset.bookTitle || '';
  const resolvedAuthor = author || img.dataset.bookAuthor || '';
  const resolvedBookId = bookId || img.dataset.bookId || '';
  const resolvedIsbn = isbn || img.dataset.bookIsbn || '';

  if (img.dataset.fallbackApplied !== '1') {
    img.dataset.fallbackApplied = '1';
    img.src = buildFallbackCoverDataUri(resolvedTitle, resolvedAuthor);
  }

  if (img.dataset.healingApplied === '1') return;
  img.dataset.healingApplied = '1';

  if ((!resolvedTitle || resolvedTitle === 'Sem título') && !resolvedIsbn) return;

  healBookCover({
    bookId: resolvedBookId,
    title: resolvedTitle,
    author: resolvedAuthor,
    isbn: resolvedIsbn
  }).then((resolvedUrl) => {
    if (!resolvedUrl) return;
    if (img.isConnected && (!resolvedBookId || img.dataset.bookId === resolvedBookId)) {
      img.src = resolvedUrl;
    }
  });
};

window.handleAvatarError = function (img, name) {
  if (img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  const initials = escapeHtml(
    (name || 'NM')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] || '')
      .join('')
      .toUpperCase()
  );
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" fill="#C85A32"/>
      <text x="100" y="114" text-anchor="middle" fill="#FFFFFF" font-family="Georgia, serif" font-size="72" font-weight="bold">${initials}</text>
    </svg>
  `.trim();
  img.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

/**
 * Gerador Automático de Links de Afiliado Amazon (Monetização Global da Plataforma)
 * - Utiliza exclusivamente a Tag global PLATFORM_AMAZON_TAG
 */
function buildAmazonUrl(book) {
  const query = [book?.title, book?.author].filter(Boolean).join(' ').trim() || book?.isbn || book?.asin || 'livros';
  return `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&tag=${encodeURIComponent(PLATFORM_AMAZON_TAG)}`;
}

function normalizeUsername(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function sanitizeProfile(profile = {}, fallback = {}) {
  const username = normalizeUsername(profile.username || fallback.username || 'oseunome') || 'oseunome';
  const rawFollowing = Array.isArray(profile.following)
    ? profile.following
    : (Array.isArray(fallback.following) ? fallback.following : []);
  const following = [...new Set(
    rawFollowing
      .map((u) => normalizeUsername(u))
      .filter((u) => u && u !== username)
  )];

  return {
    name: String(profile.name ?? fallback.name ?? 'Leitor(a)').trim() || 'Leitor(a)',
    username,
    bio: String(profile.bio ?? fallback.bio ?? ''),
    avatarUrl: String(profile.avatarUrl ?? fallback.avatarUrl ?? ''),
    instagramUrl: String(profile.instagramUrl ?? fallback.instagramUrl ?? ''),
    following
  };
}

function sanitizeBook(book = {}) {
  const rawCover = String(book.coverUrl || '').trim();
  const isbnKey = cleanIsbn(book.isbn);
  let resolvedCover = rawCover;
  if (
    isbnKey &&
    SEED_ISBN_COVERS[isbnKey] &&
    (!rawCover || /covers\.openlibrary\.org\/b\/isbn\//i.test(rawCover))
  ) {
    resolvedCover = SEED_ISBN_COVERS[isbnKey];
  }

  return {
    id: book.id || generateId('book'),
    title: String(book.title || '').trim() || 'Sem título',
    author: String(book.author || '').trim() || 'Autor desconhecido',
    coverUrl: resolvedCover,
    shelf: ['reading', 'read', 'wishlist'].includes(book.shelf) ? book.shelf : 'wishlist',
    rating: Math.max(0, Math.min(5, Number(book.rating) || 0)),
    progress: Math.max(0, Math.min(100, Number(book.progress) || 0)),
    synopsis: String(book.synopsis || ''),
    review: String(book.review || ''),
    isbn: String(book.isbn || ''),
    createdAt: book.createdAt || new Date().toISOString()
  };
}

function renderStars(rating, sizeClass = 'w-4 h-4') {
  const num = Math.max(0, Math.min(5, Number(rating) || 0));
  if (num === 0) return '';
  let html = '<div class="inline-flex items-center gap-0.5" aria-label="Nota ' + num + ' de 5 estrelas">';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= num;
    html += `<svg class="${sizeClass} ${filled ? 'text-amber-500 fill-amber-400' : 'text-stone-300 dark:text-stone-700'}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="${filled ? 'currentColor' : 'none'}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }
  html += '</div>';
  return html;
}

function formatRelativeDate(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getShelfMeta(shelf) {
  switch (shelf) {
    case 'reading':
      return {
        label: '📖 Lendo Agora',
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
      };
    case 'read':
      return {
        label: '⭐ Já Lidos & Recomendados',
        badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
      };
    case 'wishlist':
    default:
      return {
        label: '🎯 Quero Ler',
        badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
      };
  }
}

/* ==========================================================================
   PERSISTÊNCIA LOCAL + MULTI-USUÁRIO + SUPABASE AUTH & REST
   ========================================================================== */
function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function setAuthSession(session) {
  authSession = session || null;
  try {
    if (authSession) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(authSession));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  } catch (err) {
    console.warn('Erro ao salvar sessão:', err);
  }
}

function findLocalAccountById(userId) {
  return (appState?.accounts || []).find((a) => a.userId === userId) || null;
}

function findLocalAccountByUsername(username) {
  const target = normalizeUsername(username);
  if (!target) return null;
  return (appState?.accounts || []).find((a) => normalizeUsername(a.profile?.username) === target) || null;
}

function findLocalAccountByIdentifier(identifier) {
  const raw = String(identifier || '').trim().toLowerCase();
  if (!raw) return null;
  const slug = normalizeUsername(raw);
  return (appState?.accounts || []).find((a) => (
    String(a.email || '').trim().toLowerCase() === raw ||
    (slug && normalizeUsername(a.profile?.username) === slug)
  )) || null;
}

function loadAccountIntoWorkingState(account) {
  if (!account) return;
  const profile = sanitizeProfile(account.profile);
  const unpacked = unpackClubsAndAccountMeta(account.clubs || []);
  if (unpacked.following.length > 0 && profile.following.length === 0) {
    profile.following = unpacked.following;
  }
  appState.profile = { ...profile };
  appState.clubs = unpacked.clubs.map((c) => ({ ...c }));
  appState.books = Array.isArray(account.books) ? account.books.map((b) => sanitizeBook(b)) : [];
  appState.activePublicUsername = profile.username;
}

function commitWorkingStateToOwnerAccount() {
  if (!authSession || !appState) return;
  if (!Array.isArray(appState.accounts)) appState.accounts = [];

  let account = findLocalAccountById(authSession.userId);
  const existingFollowing = account?.profile?.following || [];
  const mergedProfileInput = {
    ...appState.profile,
    following: Array.isArray(appState.profile?.following) && appState.profile.following.length > 0
      ? appState.profile.following
      : existingFollowing
  };
  const cleanProfile = sanitizeProfile(mergedProfileInput, { username: authSession.username });
  appState.profile = cleanProfile;
  appState.activePublicUsername = cleanProfile.username;

  if (!account) {
    account = {
      userId: authSession.userId,
      email: authSession.email || '',
      password: '',
      passwordHash: '',
      profile: { ...cleanProfile },
      clubs: [],
      books: []
    };
    appState.accounts.unshift(account);
  }

  account.profile = { ...cleanProfile };
  account.clubs = (appState.clubs || []).filter((c) => c && !c._meta).map((c) => ({ ...c }));
  account.books = (appState.books || []).map((b) => sanitizeBook(b));
  saveState();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const seed = createSeedState();

      let accounts = [];
      if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
        accounts = parsed.accounts.map((acc) => {
          const unpacked = unpackClubsAndAccountMeta(acc.clubs || []);
          const prof = sanitizeProfile(acc.profile, { following: unpacked.following });
          return {
            userId: acc.userId || generateId('usr'),
            email: acc.email || '',
            password: acc.passwordHash ? '' : (acc.password || ''),
            passwordHash: acc.passwordHash || unpacked.passwordHash || '',
            profile: prof,
            clubs: unpacked.clubs,
            books: Array.isArray(acc.books) ? acc.books.map(sanitizeBook) : []
          };
        });
      } else {
        // Migração automática do estado MVP v1 para estrutura multi-usuário
        const migratedProfile = sanitizeProfile(parsed.profile, seed.profile);
        accounts = [{
          userId: DEMO_USER_ID,
          email: 'demo@naminhaestante.app',
          password: '',
          passwordHash: DEMO_PASSWORD_HASH,
          profile: migratedProfile,
          clubs: Array.isArray(parsed.clubs) ? parsed.clubs : seed.clubs,
          books: Array.isArray(parsed.books) ? parsed.books.map(sanitizeBook) : seed.books
        }];
      }

      // Garante que os perfis padrão da comunidade nunca sumam do diretório público
      accounts = mergeDefaultCommunityAccounts(accounts);

      const activeUsername = normalizeUsername(parsed.activePublicUsername || parsed.profile?.username) || accounts[0].profile.username;
      const activeAcc = accounts.find((a) => normalizeUsername(a.profile.username) === activeUsername) || accounts[0];

      const savedSb = parsed.supabase || {};
      const supabaseConfig = {
        url: String(savedSb.url || DEFAULT_SUPABASE_URL || '').trim(),
        anonKey: String(savedSb.anonKey || DEFAULT_SUPABASE_ANON_KEY || '').trim()
      };

      return {
        accounts,
        activePublicUsername: activeAcc.profile.username,
        profile: { ...activeAcc.profile },
        clubs: activeAcc.clubs.map((c) => ({ ...c })),
        books: activeAcc.books.map((b) => sanitizeBook(b)),
        comments: Array.isArray(parsed.comments) ? parsed.comments : seed.comments,
        supabase: supabaseConfig
      };
    }
  } catch (err) {
    console.warn('Erro ao ler localStorage, carregando dados iniciais:', err);
  }
  const initial = createSeedState();
  saveState(initial);
  return initial;
}

function saveState(stateToSave = appState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (err) {
    console.warn('Não foi possível salvar no localStorage:', err);
  }
}

function isSupabaseConfigured() {
  const url = String(appState?.supabase?.url || '').trim().replace(/\/+$/, '');
  const key = String(appState?.supabase?.anonKey || '').trim();
  return Boolean(url && key);
}

async function supabaseAuthRequest(endpoint, body = null, { method = 'POST', token = null } = {}) {
  const baseUrl = String(appState.supabase.url || '').trim().replace(/\/+$/, '');
  const anonKey = String(appState.supabase.anonKey || '').trim();
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase não configurado.');
  }

  const headers = {
    apikey: anonKey,
    'Content-Type': 'application/json'
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/auth/v1/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const msg = parsed?.msg || parsed?.error_description || parsed?.error || response.statusText;
    throw new Error(msg);
  }
  return parsed;
}

async function refreshSupabaseTokenIfNeeded() {
  if (!authSession || authSession.mode !== 'supabase' || !authSession.refreshToken) {
    return false;
  }
  try {
    const data = await supabaseAuthRequest('token?grant_type=refresh_token', {
      refresh_token: authSession.refreshToken
    });
    if (data?.access_token) {
      setAuthSession({
        ...authSession,
        accessToken: data.access_token,
        refreshToken: data.refresh_token || authSession.refreshToken
      });
      return true;
    }
  } catch (_) {
    // Refresh falhou
  }
  return false;
}

async function supabaseFetch(path, options = {}, retryOn401 = true) {
  const baseUrl = String(appState.supabase.url || '').trim().replace(/\/+$/, '');
  const anonKey = String(appState.supabase.anonKey || '').trim();
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase não configurado.');
  }

  const explicitToken = options.explicitToken || '';
  const useUserToken = !explicitToken && options.useUserToken !== false && authSession?.mode === 'supabase' && authSession?.accessToken;
  const bearerToken = explicitToken || (useUserToken ? authSession.accessToken : (anonKey.startsWith('eyJ') ? anonKey : ''));

  const headers = {
    apikey: anonKey,
    'Content-Type': 'application/json',
    ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    ...(options.headers || {})
  };

  const fetchOpts = { ...options };
  delete fetchOpts.useUserToken;
  delete fetchOpts.explicitToken;

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...fetchOpts,
    headers
  });

  if (response.status === 401 && useUserToken && retryOn401) {
    const refreshed = await refreshSupabaseTokenIfNeeded();
    if (refreshed) {
      return supabaseFetch(path, options, false);
    }
    if (authSession?.mode === 'supabase') {
      setAuthSession({ ...authSession, accessToken: null });
    }
    return supabaseFetch(path, { ...options, useUserToken: false }, false);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Supabase (${response.status}): ${errText || response.statusText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function packClubsWithAccountMeta(clubs = [], profile = {}, passwordHash = '') {
  const cleanClubs = (Array.isArray(clubs) ? clubs : []).filter((c) => c && !c._meta);
  const following = Array.isArray(profile?.following)
    ? [...new Set(profile.following.map(normalizeUsername).filter(Boolean))]
    : [];
  const meta = {
    _meta: 'nme_account_meta',
    following,
    ...(passwordHash ? { passwordHash } : {})
  };
  return [...cleanClubs, meta];
}

function unpackClubsAndAccountMeta(rawClubs = []) {
  const list = Array.isArray(rawClubs) ? rawClubs : [];
  const clubs = [];
  let following = [];
  let passwordHash = '';

  for (const item of list) {
    if (item && item._meta === 'nme_account_meta') {
      if (Array.isArray(item.following)) {
        following = [...new Set(item.following.map((u) => normalizeUsername(u)).filter(Boolean))];
      }
      if (item.passwordHash) {
        passwordHash = String(item.passwordHash);
      }
    } else if (item && item.name) {
      clubs.push(item);
    }
  }

  return { clubs, following, passwordHash };
}

function toDbProfile(profile, clubs, userId, email = '', passwordHash = '') {
  const resolvedHash = passwordHash || findLocalAccountById(userId)?.passwordHash || '';
  return {
    id: userId,
    email: String(email || '').trim().toLowerCase(),
    username: normalizeUsername(profile.username),
    name: profile.name,
    bio: profile.bio || '',
    avatar_url: profile.avatarUrl || '',
    instagram_url: profile.instagramUrl || '',
    clubs: packClubsWithAccountMeta(clubs, profile, resolvedHash),
    updated_at: new Date().toISOString()
  };
}

function toDbBook(book, userId) {
  return {
    id: book.id,
    user_id: userId,
    title: book.title,
    author: book.author,
    cover_url: book.coverUrl || '',
    shelf: book.shelf,
    rating: Number(book.rating) || 0,
    progress: Number(book.progress) || 0,
    synopsis: book.synopsis || '',
    review: book.review || '',
    isbn: book.isbn || '',
    created_at: book.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function fromDbBook(row) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url || '',
    shelf: row.shelf || 'wishlist',
    rating: Number(row.rating) || 0,
    progress: Number(row.progress) || 0,
    synopsis: row.synopsis || '',
    review: row.review || '',
    isbn: row.isbn || '',
    createdAt: row.created_at || new Date().toISOString()
  };
}

function toDbComment(comment) {
  return {
    id: comment.id,
    book_id: comment.bookId,
    author_name: comment.authorName,
    author_handle: comment.authorHandle || '',
    text: comment.text,
    rating: Number(comment.rating) || 0,
    created_at: comment.createdAt || new Date().toISOString()
  };
}

function fromDbComment(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    authorName: row.author_name,
    authorHandle: row.author_handle || '',
    text: row.text,
    rating: Number(row.rating) || 0,
    createdAt: row.created_at || new Date().toISOString()
  };
}

function canWriteToSupabaseOwnerData() {
  return isSupabaseConfigured() && Boolean(authSession?.userId);
}

async function syncSpecificProfileInBackground(account) {
  if (!isSupabaseConfigured() || !account || !account.userId || !account.profile) return;
  try {
    const isCurrentOwner = Boolean(authSession?.userId && authSession.userId === account.userId);
    await supabaseFetch('profile_settings', {
      method: 'POST',
      useUserToken: isCurrentOwner,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(
        toDbProfile(account.profile, account.clubs || [], account.userId, account.email || '', account.passwordHash || '')
      )
    });
  } catch (err) {
    console.warn('Falha ao sincronizar perfil no Supabase:', err);
  }
}

async function syncProfileInBackground() {
  if (!canWriteToSupabaseOwnerData()) return;
  const ownAcc = findLocalAccountById(authSession.userId);
  if (ownAcc) {
    await syncSpecificProfileInBackground(ownAcc);
    return;
  }
  try {
    await supabaseFetch('profile_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(toDbProfile(appState.profile, appState.clubs, authSession.userId, authSession.email || ''))
    });
  } catch (err) {
    console.warn('Falha ao sincronizar perfil no Supabase:', err);
  }
}

async function syncBookInBackground(book, ownerUserId = authSession?.userId) {
  if (!isSupabaseConfigured() || !ownerUserId) return;
  try {
    await supabaseFetch('books', {
      method: 'POST',
      useUserToken: ownerUserId === authSession?.userId,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(toDbBook(book, ownerUserId))
    });
  } catch (err) {
    // Se o perfil ainda não existir em profile_settings, cria o perfil e reenvia o livro
    if (String(err?.message || '').includes('23503') || String(err?.message || '').toLowerCase().includes('foreign key')) {
      try {
        const ownerAcc = findLocalAccountById(ownerUserId);
        if (ownerAcc) {
          await syncSpecificProfileInBackground(ownerAcc);
        } else {
          await syncProfileInBackground();
        }
        await supabaseFetch('books', {
          method: 'POST',
          useUserToken: ownerUserId === authSession?.userId,
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(toDbBook(book, ownerUserId))
        });
        return;
      } catch (retryErr) {
        console.warn('Falha ao sincronizar livro após criar perfil:', retryErr);
      }
    }
    console.warn('Falha ao sincronizar livro no Supabase:', err);
  }
}

async function deleteBookInBackground(bookId) {
  if (!canWriteToSupabaseOwnerData()) return;
  try {
    await supabaseFetch(`books?id=eq.${encodeURIComponent(bookId)}&user_id=eq.${encodeURIComponent(authSession.userId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('Falha ao excluir livro no Supabase:', err);
  }
}

async function syncCommentInBackground(comment) {
  if (!isSupabaseConfigured()) return;
  try {
    await supabaseFetch('comments', {
      method: 'POST',
      useUserToken: false,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(toDbComment(comment))
    });
  } catch (err) {
    console.warn('Falha ao salvar comentário no Supabase:', err);
  }
}

async function deleteCommentInBackground(commentId) {
  if (!isSupabaseConfigured() || !commentId) return;
  try {
    await supabaseFetch(`comments?id=eq.${encodeURIComponent(commentId)}`, {
      method: 'DELETE'
    });
  } catch (err) {
    console.warn('Falha ao excluir comentário no Supabase:', err);
  }
}

async function syncAccountsToSupabase(accountsList = [], commentsList = []) {
  if (!isSupabaseConfigured()) return;

  const profileRows = [];
  const bookRows = [];
  const seenProfileIds = new Set();
  const seenUsernames = new Set();

  for (const acc of accountsList) {
    if (!acc || !acc.userId || !acc.profile) continue;
    const slug = normalizeUsername(acc.profile.username);
    if (!slug || seenProfileIds.has(acc.userId) || seenUsernames.has(slug)) continue;
    seenProfileIds.add(acc.userId);
    seenUsernames.add(slug);

    profileRows.push(toDbProfile(acc.profile, acc.clubs || [], acc.userId, acc.email || '', acc.passwordHash || ''));
    for (const book of (acc.books || [])) {
      bookRows.push(toDbBook(sanitizeBook(book), acc.userId));
    }
  }

  if (profileRows.length > 0) {
    await supabaseFetch('profile_settings', {
      method: 'POST',
      useUserToken: false,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(profileRows)
    });
  }

  if (bookRows.length > 0) {
    await supabaseFetch('books', {
      method: 'POST',
      useUserToken: false,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(bookRows)
    });
  }

  const validBookIds = new Set(bookRows.map((b) => b.id));
  const commentsToSync = (commentsList || []).filter((c) => c && c.id && c.bookId && (validBookIds.size === 0 || validBookIds.has(c.bookId)));
  if (commentsToSync.length > 0) {
    await supabaseFetch('comments', {
      method: 'POST',
      useUserToken: false,
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(commentsToSync.map(toDbComment))
    });
  }
}

window.handleSaveSupabaseConfig = async function (event) {
  event.preventDefault();
  const url = document.getElementById('sb-url').value.trim().replace(/\/+$/, '');
  const anonKey = document.getElementById('sb-key').value.trim();

  appState.supabase = { url, anonKey };
  saveState();
  updateSupabaseBadges();

  if (!url || !anonKey) {
    if (authSession?.mode === 'supabase') {
      setAuthSession(null);
      updateAuthHeaderUI();
    }
    showToast('Credenciais limpas. Operando em modo local.', 'ℹ️');
    return;
  }

  try {
    await supabaseFetch('profile_settings?select=id&limit=1', { method: 'GET', useUserToken: false });
    showToast('Conexão com Supabase verificada! Clique em "Enviar Estante Local" para publicar seus perfis.', '✅');
  } catch (err) {
    showToast(`Configuração salva, mas o teste falhou: ${err.message}`, '⚠️');
  }
};

window.syncAllToSupabase = async function () {
  if (!isSupabaseConfigured()) {
    showToast('Preencha a URL e a Anon Key do Supabase primeiro.', '⚠️');
    return;
  }

  if (!authSession?.userId) {
    openAuthModal('login');
    showToast('Entre na sua conta para sincronizar sua estante com segurança.', '🔐');
    return;
  }

  try {
    if (normalizeUsername(appState.profile?.username) === normalizeUsername(authSession.username)) {
      commitWorkingStateToOwnerAccount();
    }

    const ownAccount = findLocalAccountById(authSession.userId);
    if (!ownAccount) {
      showToast('Conta autenticada não encontrada localmente para sincronizar.', '⚠️');
      return;
    }

    const ownBookIds = new Set((ownAccount.books || []).map((b) => b.id));
    const ownComments = (appState.comments || []).filter((c) => ownBookIds.has(c.bookId));

    await syncAccountsToSupabase([ownAccount], ownComments);
    showToast(`Sua estante @${ownAccount.profile.username} foi sincronizada com segurança!`, '☁️');
  } catch (err) {
    showToast(`Erro ao enviar para o Supabase: ${err.message}`, '❌');
  }
};

window.pullFromSupabase = async function ({ silent = false, targetUsername = null } = {}) {
  if (!isSupabaseConfigured()) {
    if (!silent) showToast('Configure o Supabase antes de baixar os dados.', '⚠️');
    return;
  }

  try {
    const desiredUser = normalizeUsername(
      targetUsername || getRequestedUsernameFromUrl() || authSession?.username || appState.activePublicUsername
    );

    const [profiles, allBooks, allComments] = await Promise.all([
      supabaseFetch('profile_settings?select=*&order=updated_at.asc', { useUserToken: false }),
      supabaseFetch('books?select=*&order=created_at.desc', { useUserToken: false }),
      supabaseFetch('comments?select=*&order=created_at.desc', { useUserToken: false })
    ]);

    const booksRows = Array.isArray(allBooks) ? allBooks : [];
    const commentsRows = Array.isArray(allComments) ? allComments : [];

    if (Array.isArray(profiles) && profiles.length > 0) {
      const dbAccounts = profiles.map((p) => {
        const unpacked = unpackClubsAndAccountMeta(p.clubs);
        const existingLocal = findLocalAccountById(p.id);
        const userBooks = booksRows.filter((b) => b.user_id === p.id).map(fromDbBook);
        return {
          userId: p.id,
          email: p.email || '',
          password: '',
          passwordHash: unpacked.passwordHash || existingLocal?.passwordHash || '',
          profile: sanitizeProfile({
            name: p.name,
            username: p.username,
            bio: p.bio,
            avatarUrl: p.avatar_url,
            instagramUrl: p.instagram_url,
            following: unpacked.following
          }),
          clubs: unpacked.clubs,
          books: userBooks
        };
      });

      const dbIds = new Set(dbAccounts.map((a) => a.userId));
      const dbUsernames = new Set(dbAccounts.map((a) => normalizeUsername(a.profile.username)));

      // Sincroniza automaticamente apenas se for a própria conta logada criada localmente e ainda ausente no banco
      const localOnlyOwnAccounts = (appState.accounts || []).filter((acc) => {
        const isDemo = String(acc.userId || '').startsWith('demo_');
        const slug = normalizeUsername(acc.profile?.username);
        const belongsToSession = Boolean(authSession?.userId && acc.userId === authSession.userId);
        return !isDemo && belongsToSession && acc.userId && !dbIds.has(acc.userId) && slug && !dbUsernames.has(slug);
      });

      if (localOnlyOwnAccounts.length > 0) {
        void syncAccountsToSupabase(localOnlyOwnAccounts, appState.comments || []).catch((err) => {
          console.warn('Falha ao enviar sua conta local para o Supabase:', err);
        });
      }

      // Mantém os perfis padrão da comunidade disponíveis na listagem caso não estejam no banco
      const mergedAccounts = mergeDefaultCommunityAccounts([...dbAccounts, ...localOnlyOwnAccounts]);

      appState.accounts = mergedAccounts;

      const selectedAcc =
        (desiredUser && mergedAccounts.find((a) => normalizeUsername(a.profile.username) === desiredUser)) ||
        mergedAccounts.find((a) => !String(a.userId || '').startsWith('demo_')) ||
        mergedAccounts[0];

      loadAccountIntoWorkingState(selectedAcc);

      const loadedComments = commentsRows.map(fromDbComment);
      const loadedCommentIds = new Set(loadedComments.map((c) => c.id));
      const localOnlyComments = (appState.comments || []).filter((c) => !loadedCommentIds.has(c.id));
      appState.comments = [...loadedComments, ...localOnlyComments];

      saveState();
      renderAll();
      void healAllShelfCoversInBackground();
      if (!silent) showToast(`Estante @${selectedAcc.profile.username} carregada do Supabase!`, '☁️');
    } else if (Array.isArray(profiles) && profiles.length === 0) {
      if (Array.isArray(appState.accounts) && appState.accounts.length > 0) {
        await syncAccountsToSupabase(appState.accounts, appState.comments || []);
        if (!silent) showToast('Comunidade inicial enviada para o Supabase!', '☁️');
      } else if (!silent) {
        showToast('Nenhum perfil encontrado no Supabase ainda.', 'ℹ️');
      }
    }
  } catch (err) {
    if (!silent) showToast(`Erro ao baixar do Supabase: ${err.message}`, '❌');
  }
};

window.copySupabaseSchema = async function () {
  try {
    await navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    showToast('SQL das tabelas copiado para a área de transferência!', '📋');
  } catch (_) {
    showToast('Copie o SQL diretamente do arquivo supabase_schema.sql.', 'ℹ️');
  }
};

/* ==========================================================================
   AUTENTICAÇÃO MULTI-USUÁRIO (CRIAR CONTA, ENTRAR, SAIR, TROCAR CONTA)
   ========================================================================== */
function updateAuthHeaderUI() {
  const btnAuth = document.getElementById('btn-header-auth');
  const userActions = document.getElementById('header-user-actions');
  const badgeText = document.getElementById('header-user-badge-text');
  const adminAccountLabel = document.getElementById('admin-current-account-label');

  if (authSession && authSession.userId) {
    if (btnAuth) btnAuth.classList.add('hidden');
    if (userActions) {
      userActions.classList.remove('hidden');
      userActions.classList.add('flex');
    }
    if (badgeText) badgeText.textContent = `@${authSession.username || 'conta'}`;
    if (adminAccountLabel) {
      const modeLabel = authSession.mode === 'supabase' ? 'Supabase' : 'Local';
      adminAccountLabel.textContent = `@${authSession.username || 'conta'} • ${modeLabel}`;
    }
  } else {
    if (btnAuth) btnAuth.classList.remove('hidden');
    if (userActions) {
      userActions.classList.add('hidden');
      userActions.classList.remove('flex');
    }
    if (adminAccountLabel) adminAccountLabel.textContent = '';
  }
}

function renderLocalAccountSwitcher() {
  const section = document.getElementById('auth-local-accounts-section');
  const list = document.getElementById('auth-local-accounts-list');
  if (!section || !list) return;

  if (isSupabaseConfigured() || !Array.isArray(appState?.accounts) || appState.accounts.length === 0) {
    section.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  section.classList.remove('hidden');
  list.innerHTML = appState.accounts.map((acc) => {
    const isCurrent = authSession?.userId === acc.userId;
    const u = acc.profile?.username || 'conta';
    const bookCount = (acc.books || []).length;
    return `
      <button type="button" onclick="switchLocalAccount('${escapeHtml(acc.userId)}')"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
          isCurrent
            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
            : 'bg-stone-50 hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200'
        }">
        <span>@${escapeHtml(u)}</span>
        <span class="text-[10px] opacity-70">(${bookCount})</span>
      </button>
    `;
  }).join('');
}

window.openAuthModal = function (tab = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  switchAuthTab(tab);
  renderLocalAccountSwitcher();
  updateSignupUsernamePreview(document.getElementById('signup-username')?.value || '');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  refreshIcons();
};

window.closeAuthModal = function () {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
};

window.switchAuthTab = function (tab) {
  const isSignup = tab === 'signup';
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  if (loginForm) loginForm.classList.toggle('hidden', isSignup);
  if (signupForm) signupForm.classList.toggle('hidden', !isSignup);

  document.querySelectorAll('.auth-tab').forEach((btn) => {
    const active = btn.dataset.authTab === (isSignup ? 'signup' : 'login');
    btn.className = active
      ? 'auth-tab px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
      : 'auth-tab px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white';
  });
};

window.updateSignupUsernamePreview = function (raw) {
  const slug = normalizeUsername(raw) || 'seunome';
  const el = document.getElementById('signup-url-preview');
  if (el) el.textContent = `?u=${slug}`;
};

window.switchLocalAccount = async function (userId) {
  const acc = findLocalAccountById(userId);
  if (!acc) return;

  setAuthSession({
    userId: acc.userId,
    email: acc.email,
    username: acc.profile.username,
    accessToken: null,
    refreshToken: null,
    mode: 'local'
  });
  loadAccountIntoWorkingState(acc);
  saveState();
  await applyPendingBookCopyAfterAuth();
  closeAuthModal();
  updateAuthHeaderUI();
  renderAll();
  if (pendingAdminAfterAuth || currentMainView === 'admin') {
    pendingAdminAfterAuth = false;
    switchMainView('admin');
  }
  showToast(`Conectado como @${acc.profile.username}!`, '✅');
};

window.loginWithDemoAccount = function () {
  if (isSupabaseConfigured()) {
    showToast('No modo Supabase, entre com seu e-mail ou crie uma conta na aba ao lado.', 'ℹ️');
    switchAuthTab('signup');
    return;
  }
  let demoAcc = findLocalAccountById(DEMO_USER_ID) || findLocalAccountByUsername('leitoracriativa');
  if (!demoAcc) {
    demoAcc = createDemoAccount();
    appState.accounts.unshift(demoAcc);
    saveState();
  }
  switchLocalAccount(demoAcc.userId);
};

window.handleAuthLogin = async function (event) {
  event.preventDefault();
  const identifier = document.getElementById('login-identifier').value.trim();
  const password = document.getElementById('login-password').value;
  if (!identifier || !password) return;

  const submitBtn = document.getElementById('btn-auth-login-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (isSupabaseConfigured()) {
      const isEmailLogin = identifier.includes('@');
      const localAcc = findLocalAccountByIdentifier(identifier);

      // Consulta perfil remoto pelo e-mail ou @username
      let remoteProfiles = [];
      try {
        const queryField = isEmailLogin
          ? `email=eq.${encodeURIComponent(identifier.toLowerCase())}`
          : `username=eq.${encodeURIComponent(normalizeUsername(identifier))}`;
        const res = await supabaseFetch(`profile_settings?${queryField}&select=*`, { useUserToken: false });
        if (Array.isArray(res)) remoteProfiles = res;
      } catch (_) {}

      const remoteProfile = remoteProfiles[0] || null;
      const remoteMeta = remoteProfile ? unpackClubsAndAccountMeta(remoteProfile.clubs) : null;
      const resolvedEmail = isEmailLogin
        ? identifier.toLowerCase()
        : (remoteProfile?.email || localAcc?.email || '');

      let userId = '';
      let accessToken = null;
      let refreshToken = null;
      let userMeta = {};

      if (resolvedEmail && resolvedEmail.includes('@')) {
        try {
          const authData = await supabaseAuthRequest('token?grant_type=password', {
            email: resolvedEmail,
            password
          });
          if (authData?.user && authData?.access_token) {
            userId = authData.user.id;
            accessToken = authData.access_token;
            refreshToken = authData.refresh_token || null;
            userMeta = authData.user.user_metadata || {};
          }
        } catch (authErr) {
          const passwordMatches = await verifyAccountPassword(password, localAcc, remoteMeta);
          if (passwordMatches && (remoteProfile || localAcc)) {
            userId = remoteProfile?.id || localAcc?.userId || '';
          } else {
            throw authErr;
          }
        }
      } else if (await verifyAccountPassword(password, localAcc, remoteMeta)) {
        userId = remoteProfile?.id || localAcc?.userId || '';
      }

      if (!userId) {
        showToast('E-mail/@username ou senha incorretos.', '❌');
        return;
      }

      let profileRow = remoteProfile;
      if (!profileRow) {
        const byId = await supabaseFetch(
          `profile_settings?id=eq.${encodeURIComponent(userId)}&select=*`,
          { useUserToken: Boolean(accessToken), explicitToken: accessToken || '' }
        ).catch(() => []);
        if (Array.isArray(byId) && byId[0]) {
          profileRow = byId[0];
        }
      }

      const rowMeta = profileRow ? unpackClubsAndAccountMeta(profileRow.clubs) : null;
      const computedHash = rowMeta?.passwordHash || localAcc?.passwordHash || (await hashPasswordSha256(password));

      let profileObj;
      let clubsArr = [];
      if (profileRow) {
        profileObj = sanitizeProfile({
          name: profileRow.name,
          username: profileRow.username,
          bio: profileRow.bio,
          avatarUrl: profileRow.avatar_url,
          instagramUrl: profileRow.instagram_url,
          following: rowMeta?.following || localAcc?.profile?.following || []
        });
        clubsArr = rowMeta?.clubs || [];
      } else if (localAcc) {
        profileObj = sanitizeProfile(localAcc.profile);
        clubsArr = Array.isArray(localAcc.clubs) ? localAcc.clubs.filter((c) => c && !c._meta) : [];
        await supabaseFetch('profile_settings', {
          method: 'POST',
          useUserToken: Boolean(accessToken),
          explicitToken: accessToken || '',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(toDbProfile(profileObj, clubsArr, userId, resolvedEmail, computedHash))
        });
      } else {
        const fallbackUsername = normalizeUsername(userMeta?.username || resolvedEmail.split('@')[0]) || `leitor${Date.now().toString().slice(-4)}`;
        profileObj = sanitizeProfile({
          name: userMeta?.name || fallbackUsername,
          username: fallbackUsername
        });
        await supabaseFetch('profile_settings', {
          method: 'POST',
          useUserToken: Boolean(accessToken),
          explicitToken: accessToken || '',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(toDbProfile(profileObj, [], userId, resolvedEmail, computedHash))
        });
      }

      const books = await supabaseFetch(
        `books?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc`,
        { useUserToken: false }
      ).catch(() => []);

      const loadedBooks = Array.isArray(books) && books.length > 0
        ? books.map(fromDbBook).map(sanitizeBook)
        : (localAcc?.books || []).map(sanitizeBook);

      const ownerAccount = {
        userId,
        email: resolvedEmail,
        password: '',
        passwordHash: computedHash,
        profile: profileObj,
        clubs: clubsArr,
        books: loadedBooks
      };

      const ownerIdx = (appState.accounts || []).findIndex(
        (a) => a.userId === userId || normalizeUsername(a.profile?.username) === profileObj.username
      );
      if (ownerIdx !== -1) {
        appState.accounts[ownerIdx] = ownerAccount;
      } else {
        appState.accounts.unshift(ownerAccount);
      }

      setAuthSession({
        userId,
        email: resolvedEmail,
        username: profileObj.username,
        accessToken,
        refreshToken,
        mode: 'supabase'
      });

      loadAccountIntoWorkingState(ownerAccount);
      commitWorkingStateToOwnerAccount();

      // Se a conta antiga ainda não tinha passwordHash no banco, grava agora com segurança
      if (profileRow && !rowMeta?.passwordHash && computedHash) {
        void syncSpecificProfileInBackground(ownerAccount);
      }

      await applyPendingBookCopyAfterAuth();

      document.getElementById('auth-login-form').reset();
      closeAuthModal();
      updateAuthHeaderUI();
      renderAll();
      pendingAdminAfterAuth = false;
      switchMainView('admin');
      showToast(`Bem-vindo(a), @${profileObj.username}!`, '✅');
      return;
    }

    // Modo Local (localStorage)
    const acc = findLocalAccountByIdentifier(identifier);
    if (!acc || !(await verifyAccountPassword(password, acc, null))) {
      showToast('E-mail/@username ou senha incorretos.', '❌');
      return;
    }

    await switchLocalAccount(acc.userId);
    document.getElementById('auth-login-form').reset();
  } catch (err) {
    showToast(`Erro ao entrar: ${err.message}`, '❌');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

window.handleAuthSignup = async function (event) {
  event.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const username = normalizeUsername(document.getElementById('signup-username').value);
  const email = document.getElementById('signup-email').value.trim().toLowerCase();
  const password = document.getElementById('signup-password').value;
  const bio = document.getElementById('signup-bio').value.trim();
  const instagramUrl = document.getElementById('signup-instagram').value.trim();

  if (!name || !username || username.length < 2) {
    showToast('Escolha um @username válido com pelo menos 2 caracteres (letras/números).', '⚠️');
    return;
  }
  if (!email || password.length < 6) {
    showToast('Informe um e-mail válido e senha com no mínimo 6 caracteres.', '⚠️');
    return;
  }

  const submitBtn = document.getElementById('btn-auth-signup-submit');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const passwordHash = await hashPasswordSha256(password);
    const inheritedFollowing = getVisitorFollowing().filter((u) => u && u !== username);

    if (isSupabaseConfigured()) {
      const existing = await supabaseFetch(
        `profile_settings?username=eq.${encodeURIComponent(username)}&select=id`,
        { useUserToken: false }
      );
      if (Array.isArray(existing) && existing.length > 0) {
        showToast('Esse @username já está em uso. Escolha outro!', '⚠️');
        return;
      }

      let token = null;
      let refreshToken = null;
      let userId = '';

      try {
        const signUpData = await supabaseAuthRequest('signup', {
          email,
          password,
          data: { name, username }
        });
        token = signUpData?.access_token || signUpData?.session?.access_token || null;
        refreshToken = signUpData?.refresh_token || signUpData?.session?.refresh_token || null;
        userId = signUpData?.user?.id || signUpData?.id || '';
      } catch (authErr) {
        const msg = String(authErr?.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists')) {
          showToast('Já existe uma conta cadastrada com este e-mail. Use a aba Entrar.', '⚠️');
          switchAuthTab('login');
          return;
        }
        console.warn('Supabase Auth signup fallback para perfil direto da comunidade:', authErr);
      }

      if (!userId) {
        userId = generateId('usr');
      }

      const newProfile = sanitizeProfile({
        name,
        username,
        bio,
        avatarUrl: '',
        instagramUrl,
        following: inheritedFollowing
      });

      await supabaseFetch('profile_settings', {
        method: 'POST',
        useUserToken: Boolean(token),
        explicitToken: token || '',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(toDbProfile(newProfile, [], userId, email, passwordHash))
      });

      const newAccount = {
        userId,
        email,
        password: '',
        passwordHash,
        profile: newProfile,
        clubs: [],
        books: []
      };

      const existingLocalIdx = (appState.accounts || []).findIndex(
        (a) => a.userId === userId || normalizeUsername(a.profile?.username) === username
      );
      if (existingLocalIdx !== -1) {
        appState.accounts[existingLocalIdx] = newAccount;
      } else {
        appState.accounts.unshift(newAccount);
      }

      setAuthSession({
        userId,
        email,
        username,
        accessToken: token,
        refreshToken,
        mode: 'supabase'
      });

      if (inheritedFollowing.length > 0) setVisitorFollowing([]);
      loadAccountIntoWorkingState(newAccount);
      saveState();
      await applyPendingBookCopyAfterAuth();

      document.getElementById('auth-signup-form').reset();
      closeAuthModal();
      updateAuthHeaderUI();
      renderAll();
      pendingAdminAfterAuth = false;
      switchMainView('admin');
      showToast(`Estante @${username} criada na comunidade com sucesso!`, '🎉');
      return;
    }

    // Modo Local (localStorage)
    if (findLocalAccountByUsername(username)) {
      showToast('Esse @username já está em uso. Escolha outro!', '⚠️');
      return;
    }
    if ((appState.accounts || []).some((a) => String(a.email || '').toLowerCase() === email)) {
      showToast('Já existe uma conta cadastrada com este e-mail.', '⚠️');
      return;
    }

    const newAccount = {
      userId: generateId('usr'),
      email,
      password: '',
      passwordHash,
      profile: sanitizeProfile({
        name,
        username,
        bio,
        avatarUrl: '',
        instagramUrl,
        following: inheritedFollowing
      }),
      clubs: [],
      books: []
    };

    if (inheritedFollowing.length > 0) setVisitorFollowing([]);
    appState.accounts.unshift(newAccount);
    setAuthSession({
      userId: newAccount.userId,
      email,
      username: newAccount.profile.username,
      accessToken: null,
      refreshToken: null,
      mode: 'local'
    });
    loadAccountIntoWorkingState(newAccount);
    saveState();
    await applyPendingBookCopyAfterAuth();

    document.getElementById('auth-signup-form').reset();
    closeAuthModal();
    updateAuthHeaderUI();
    renderAll();
    pendingAdminAfterAuth = false;
    switchMainView('admin');
    showToast(`Estante @${newAccount.profile.username} criada! Adicione seus primeiros livros.`, '🎉');
  } catch (err) {
    showToast(`Erro ao criar conta: ${err.message}`, '❌');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

window.handleAuthLogout = async function () {
  if (authSession?.mode === 'supabase' && authSession?.accessToken && isSupabaseConfigured()) {
    try {
      await supabaseAuthRequest('logout', null, {
        method: 'POST',
        token: authSession.accessToken
      });
    } catch (_) {
      // Logout local continua mesmo se a chamada remota falhar
    }
  }

  setAuthSession(null);
  pendingAdminAfterAuth = false;
  updateAuthHeaderUI();
  if (currentMainView === 'admin') {
    switchMainView('public');
  }
  showToast('Você saiu da sua conta.', '👋');
};

window.openMyAdminOrShelf = function () {
  if (!authSession) {
    openAuthModal('login');
    return;
  }
  if (currentMainView === 'admin') {
    const ownAcc = findLocalAccountById(authSession.userId);
    if (ownAcc) {
      loadAccountIntoWorkingState(ownAcc);
      saveState();
    }
    switchMainView('public');
  } else {
    switchMainView('admin');
  }
};

/* ==========================================================================
   NAVEGAÇÃO, ROTEAMENTO (?u=username), TEMA E RENDERIZAÇÃO PRINCIPAL
   ========================================================================== */
function getRequestedUsernameFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const qUser = normalizeUsername(params.get('u'));
    if (qUser) return qUser;
  } catch (_) {}

  const hash = String(window.location.hash || '');
  if (hash.startsWith('#/') && hash !== '#/admin' && hash !== '#/login' && hash !== '#/signup') {
    return normalizeUsername(hash.slice(2));
  }
  return '';
}

async function loadPublicShelfByUsername(username) {
  const clean = normalizeUsername(username);
  if (!clean) return;

  if (isSupabaseConfigured()) {
    await pullFromSupabase({ silent: true, targetUsername: clean });
    return;
  }

  const acc = findLocalAccountByUsername(clean);
  if (acc) {
    loadAccountIntoWorkingState(acc);
    saveState();
    renderAll();
  }
}

function updateSupabaseBadges() {
  const connected = isSupabaseConfigured();
  const headerPill = document.getElementById('supabase-status-pill');
  const dbBadge = document.getElementById('db-connection-badge');

  if (headerPill) {
    headerPill.innerHTML = connected
      ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Supabase'
      : '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Local';
  }
  if (dbBadge) {
    dbBadge.textContent = connected ? 'Supabase Conectado' : 'Modo Local (localStorage)';
    dbBadge.className = connected
      ? 'text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 w-fit'
      : 'text-xs font-semibold px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 w-fit';
  }
}

window.switchMainView = function (view) {
  if (view === 'admin' && !authSession) {
    pendingAdminAfterAuth = true;
    openAuthModal('login');
    showToast('Entre ou crie sua conta para gerenciar sua estante.', '🔐');
    return;
  }

  currentMainView = view === 'admin' ? 'admin' : 'public';
  const publicEl = document.getElementById('view-public');
  const adminEl = document.getElementById('view-admin');
  const btnPublic = document.getElementById('btn-view-public');
  const btnAdmin = document.getElementById('btn-view-admin');

  if (currentMainView === 'admin') {
    // Garante que o Painel Admin carregue os dados da conta autenticada
    const ownAccount = findLocalAccountById(authSession.userId);
    if (ownAccount && normalizeUsername(appState.profile?.username) !== normalizeUsername(ownAccount.profile?.username)) {
      loadAccountIntoWorkingState(ownAccount);
      saveState();
    }

    publicEl.classList.add('hidden');
    adminEl.classList.remove('hidden');
    btnPublic.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white';
    btnAdmin.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm';
    renderAdminCatalog();
    populateAdminProfileForm();
    renderAdminClubs();

    if (pendingBookToImport) {
      const imported = pendingBookToImport;
      pendingBookToImport = null;
      switchAdminTab('add');
      fillBookFormFromResult(imported);
    }
  } else {
    adminEl.classList.add('hidden');
    publicEl.classList.remove('hidden');
    btnAdmin.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white';
    btnPublic.className = 'px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm';
    renderPublicShelf();
  }

  updateAuthHeaderUI();
  refreshIcons();
};

window.switchAdminTab = function (tab) {
  currentAdminTab = tab;
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    const isActive = btn.dataset.adminTab === tab;
    btn.className = isActive
      ? 'admin-tab shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 bg-amber-600 text-white shadow-sm'
      : 'admin-tab shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700';
  });

  document.querySelectorAll('.admin-panel').forEach((panel) => panel.classList.add('hidden'));
  const target = document.getElementById(`admin-panel-${tab}`);
  if (target) target.classList.remove('hidden');

  if (tab === 'catalog') renderAdminCatalog();
  if (tab === 'profile') {
    populateAdminProfileForm();
    renderAdminClubs();
  }
  if (tab === 'database') {
    document.getElementById('sb-url').value = appState.supabase.url || '';
    document.getElementById('sb-key').value = appState.supabase.anonKey || '';
    updateSupabaseBadges();
  }

  refreshIcons();
};

window.toggleTheme = function () {
  const root = document.documentElement;
  const isDark = root.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  updateThemeIcons(isDark);
};

function updateThemeIcons(isDark) {
  const moon = document.getElementById('theme-icon-moon');
  const sun = document.getElementById('theme-icon-sun');
  if (!moon || !sun) return;
  if (isDark) {
    moon.classList.add('hidden');
    sun.classList.remove('hidden');
  } else {
    sun.classList.add('hidden');
    moon.classList.remove('hidden');
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefersDark;
  document.documentElement.classList.toggle('dark', isDark);
  updateThemeIcons(isDark);
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function showToast(message, icon = '✅') {
  const toast = document.getElementById('toast');
  const iconEl = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-message');
  if (!toast || !msgEl) return;

  iconEl.textContent = icon;
  msgEl.textContent = message;
  toast.classList.remove('hidden');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3400);
}

/* ==========================================================================
   VISÃO PÚBLICA: PERFIL, CLUBES E PRATELEIRAS
   ========================================================================== */
function getCleanUsername() {
  return String(appState.profile.username || 'oseunome').replace(/^@+/, '').trim() || 'oseunome';
}

function getShareUrl() {
  const slug = getCleanUsername();
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(slug)}`;
  }
  return `https://naminhaestante.app/?u=${encodeURIComponent(slug)}`;
}

function getVisitorFollowing() {
  try {
    const raw = localStorage.getItem(VISITOR_FOLLOWING_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? [...new Set(list.map(normalizeUsername).filter(Boolean))] : [];
  } catch (_) {
    return [];
  }
}

function setVisitorFollowing(list = []) {
  try {
    const clean = [...new Set((Array.isArray(list) ? list : []).map(normalizeUsername).filter(Boolean))];
    localStorage.setItem(VISITOR_FOLLOWING_KEY, JSON.stringify(clean));
  } catch (_) {}
}

function getActiveFollowingList() {
  if (authSession?.userId) {
    const ownAcc = findLocalAccountById(authSession.userId);
    const ownSlug = normalizeUsername(ownAcc?.profile?.username || authSession.username);
    const list = Array.isArray(ownAcc?.profile?.following) ? ownAcc.profile.following : [];
    return [...new Set(list.map(normalizeUsername).filter((u) => u && u !== ownSlug))];
  }
  return getVisitorFollowing();
}

function isFollowingUser(targetUsername) {
  const slug = normalizeUsername(targetUsername);
  if (!slug) return false;
  return getActiveFollowingList().includes(slug);
}

function getFollowingListForUser(username) {
  const slug = normalizeUsername(username);
  if (!slug) return [];
  const acc = findLocalAccountByUsername(slug);
  if (!acc) return [];
  const list = Array.isArray(acc.profile?.following) ? acc.profile.following : [];
  return [...new Set(list.map(normalizeUsername).filter((u) => u && u !== slug))];
}

function getFollowersListForUser(username) {
  const targetSlug = normalizeUsername(username);
  if (!targetSlug) return [];
  const followers = [];
  for (const acc of (appState?.accounts || [])) {
    const followerSlug = normalizeUsername(acc?.profile?.username);
    if (!followerSlug || followerSlug === targetSlug) continue;
    const list = Array.isArray(acc?.profile?.following) ? acc.profile.following : [];
    if (list.map(normalizeUsername).includes(targetSlug)) {
      followers.push(followerSlug);
    }
  }
  if (!authSession?.userId && getVisitorFollowing().includes(targetSlug)) {
    followers.push('visitante');
  }
  return followers;
}

window.toggleFollowUser = async function (targetUsername, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const targetSlug = normalizeUsername(targetUsername || getCleanUsername());
  if (!targetSlug) return;

  if (authSession?.userId) {
    const ownAcc = findLocalAccountById(authSession.userId);
    const ownSlug = normalizeUsername(ownAcc?.profile?.username || authSession.username);
    if (ownSlug && targetSlug === ownSlug) {
      showToast('Você já é o(a) dono(a) desta estante! 😉', 'ℹ️');
      return;
    }

    if (!ownAcc) return;
    const currentList = getActiveFollowingList();
    const already = currentList.includes(targetSlug);
    const nextList = already
      ? currentList.filter((u) => u !== targetSlug)
      : [...currentList, targetSlug];

    ownAcc.profile = sanitizeProfile({
      ...ownAcc.profile,
      following: nextList
    });

    if (normalizeUsername(appState.profile?.username) === ownSlug) {
      appState.profile.following = [...ownAcc.profile.following];
    }

    saveState();
    renderAll();
    showToast(
      already ? `Você deixou de seguir @${targetSlug}.` : `Agora você segue @${targetSlug}! 🌟`,
      already ? '👋' : '⭐'
    );
    if (isSupabaseConfigured()) {
      await syncSpecificProfileInBackground(ownAcc);
    }
    return;
  }

  // Visitante ainda não logado: salva localmente neste navegador
  const currentVisitorList = getVisitorFollowing();
  const already = currentVisitorList.includes(targetSlug);
  const nextVisitorList = already
    ? currentVisitorList.filter((u) => u !== targetSlug)
    : [...currentVisitorList, targetSlug];

  setVisitorFollowing(nextVisitorList);
  renderAll();
  showToast(
    already
      ? `Você deixou de seguir @${targetSlug}.`
      : `Agora você segue @${targetSlug}! Crie uma conta para sincronizar.`,
    already ? '👋' : '⭐'
  );
};

window.scrollToCommunityDirectory = function () {
  const section = document.getElementById('public-profiles-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  setTimeout(() => {
    const input = document.getElementById('platform-search-input');
    if (input) input.focus({ preventScroll: true });
  }, 450);
};

window.openFollowingInDirectory = function () {
  platformSearchScope = 'following';
  renderPublicProfilesDirectory();
  refreshIcons();
  const section = document.getElementById('public-profiles-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

function renderPublicProfile() {
  const p = appState.profile;
  const cleanUser = getCleanUsername();

  document.getElementById('header-route-preview').textContent = `/?u=${cleanUser}`;
  document.getElementById('profile-name').textContent = p.name || 'Leitor(a)';
  document.getElementById('profile-username-badge').textContent = `@${cleanUser}`;
  document.getElementById('profile-bio').textContent = p.bio || '';

  const followersCount = getFollowersListForUser(cleanUser).length;
  const followingCount = getFollowingListForUser(cleanUser).length;
  const booksTotalCount = (appState.books || []).length;

  const followersEl = document.getElementById('profile-followers-count');
  const followersLabelEl = document.getElementById('profile-followers-label');
  const followingEl = document.getElementById('profile-following-count');
  const booksCountEl = document.getElementById('profile-books-total-count');
  const booksLabelEl = document.getElementById('profile-books-total-label');
  if (followersEl) followersEl.textContent = String(followersCount);
  if (followersLabelEl) followersLabelEl.textContent = followersCount === 1 ? 'seguidor' : 'seguidores';
  if (followingEl) followingEl.textContent = String(followingCount);
  if (booksCountEl) booksCountEl.textContent = String(booksTotalCount);
  if (booksLabelEl) booksLabelEl.textContent = booksTotalCount === 1 ? 'livro' : 'livros';

  const followBtn = document.getElementById('btn-follow-active-profile');
  if (followBtn) {
    const isOwnProfile = Boolean(authSession?.userId && normalizeUsername(authSession.username) === cleanUser);
    if (isOwnProfile) {
      followBtn.classList.add('hidden');
    } else {
      const followingNow = isFollowingUser(cleanUser);
      followBtn.classList.remove('hidden');
      followBtn.className = followingNow
        ? 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs sm:text-sm font-bold shadow-sm transition'
        : 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs sm:text-sm font-bold shadow-sm transition';
      followBtn.innerHTML = followingNow
        ? '<span>✓</span><span>Seguindo</span>'
        : '<span>➕</span><span>Seguir Estante</span>';
    }
  }

  const avatarEl = document.getElementById('profile-avatar');
  avatarEl.dataset.fallbackApplied = '';
  avatarEl.onerror = function () {
    handleAvatarError(this, p.name);
  };
  avatarEl.src = safeUrl(p.avatarUrl, '') || (() => {
    handleAvatarError(avatarEl, p.name);
    return avatarEl.src;
  })();

  const igLink = document.getElementById('profile-instagram-link');
  const validIg = safeUrl(p.instagramUrl, '');
  if (validIg) {
    igLink.href = validIg;
    igLink.classList.remove('hidden');
  } else {
    igLink.classList.add('hidden');
  }

  // Clubes que Participo
  const clubsContainer = document.getElementById('clubs-container');
  const clubsCount = document.getElementById('clubs-count-label');
  const clubs = appState.clubs || [];
  clubsCount.textContent = `${clubs.length} ${clubs.length === 1 ? 'clube ativo' : 'clubes ativos'}`;

  if (clubs.length === 0) {
    clubsContainer.innerHTML = '<p class="text-xs text-stone-400 italic">Nenhum clube adicionado ainda. Adicione no Painel Admin.</p>';
  } else {
    clubsContainer.innerHTML = clubs.map((club) => {
      const link = safeUrl(club.meta, '');
      const metaBadge = club.meta && !link
        ? `<span class="text-[11px] font-medium text-amber-700/80 dark:text-amber-300/80 border-l border-amber-300/60 dark:border-amber-700/60 pl-2">${escapeHtml(club.meta)}</span>`
        : '';

      const inner = `
        <span class="text-base leading-none">${escapeHtml(club.emoji || '📚')}</span>
        <span class="font-semibold text-xs sm:text-sm text-stone-800 dark:text-stone-100">${escapeHtml(club.name)}</span>
        ${metaBadge}
      `;

      if (link) {
        return `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"
          class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-paper-100 hover:bg-amber-100/70 dark:bg-stone-800 dark:hover:bg-stone-700 border border-paper-200 dark:border-stone-700 transition shadow-2xs">
          ${inner}
          <i data-lucide="external-link" class="w-3 h-3 text-stone-400"></i>
        </a>`;
      }
      return `<span class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-paper-100 dark:bg-stone-800 border border-paper-200 dark:border-stone-700 shadow-2xs">
        ${inner}
      </span>`;
    }).join('');
  }
}

window.setShelfFilter = function (filter) {
  currentShelfFilter = filter;
  renderPublicShelf();
};

window.handlePublicSearch = function (term) {
  publicSearchTerm = String(term || '');
  const clearBtn = document.getElementById('btn-clear-public-search');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', publicSearchTerm.trim().length === 0);
  }
  renderPublicShelf();
};

window.clearPublicSearch = function () {
  const input = document.getElementById('public-search-input');
  if (input) input.value = '';
  handlePublicSearch('');
};

window.resetPublicFilters = function () {
  currentShelfFilter = 'all';
  clearPublicSearch();
};

function getCommentsCountForBook(bookId) {
  return (appState.comments || []).filter((c) => c.bookId === bookId).length;
}

function normalizeSearchText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getBookSearchableText(book) {
  const shelfKeywords =
    book.shelf === 'reading'
      ? 'lendo agora leitura atual em andamento'
      : book.shelf === 'read'
        ? 'ja lidos recomendados lido resenha'
        : 'quero ler lista de desejos wishlist';
  const ratingKeywords = Number(book.rating) > 0 ? `${book.rating} estrelas` : '';
  return normalizeSearchText([
    book.title,
    book.author,
    book.synopsis,
    book.review,
    book.isbn,
    shelfKeywords,
    ratingKeywords
  ].join(' '));
}

function getAccountSearchableText(acc, comments = []) {
  const p = acc.profile || {};
  const clubsText = (acc.clubs || []).map((c) => `${c.name || ''} ${c.meta || ''}`).join(' ');
  const books = acc.books || [];
  const bookIds = new Set(books.map((b) => b.id));
  const booksText = books.map((b) => getBookSearchableText(b)).join(' ');
  const commentsText = comments
    .filter((c) => bookIds.has(c.bookId))
    .map((c) => `${c.authorName || ''} ${c.authorHandle || ''} ${c.text || ''}`)
    .join(' ');

  return normalizeSearchText([
    p.name,
    p.username,
    `@${p.username || ''}`,
    p.bio,
    clubsText,
    booksText,
    commentsText
  ].join(' '));
}

function updatePlatformSearchControlsUI() {
  const input = document.getElementById('platform-search-input');
  if (input && input.value !== platformSearchTerm) {
    input.value = platformSearchTerm;
  }

  const clearBtn = document.getElementById('btn-clear-platform-search');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', platformSearchTerm.trim().length === 0);
  }

  document.querySelectorAll('.platform-scope-tab').forEach((btn) => {
    const active = btn.dataset.scope === platformSearchScope;
    btn.className = active
      ? 'platform-scope-tab shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm'
      : 'platform-scope-tab shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition bg-stone-100/80 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700';
  });

  const activeTopicNorm = normalizeSearchText(platformSearchTerm);
  document.querySelectorAll('.platform-topic-chip').forEach((btn) => {
    const chipTopic = normalizeSearchText(btn.dataset.topic || '');
    const active = chipTopic === activeTopicNorm;
    btn.className = active
      ? 'platform-topic-chip shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 shadow-2xs'
      : 'platform-topic-chip shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition bg-paper-100 dark:bg-stone-800 border-paper-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-amber-50 dark:hover:bg-stone-700';
  });
}

window.handlePlatformSearch = function (term) {
  platformSearchTerm = String(term || '');
  if (normalizeSearchText(platformSearchTerm) !== lastPlatformExternalQuery) {
    lastPlatformExternalResults = [];
    platformExternalLoading = false;
    platformExternalError = '';
  }
  renderPublicProfilesDirectory();
  refreshIcons();
};

window.clearPlatformSearch = function () {
  platformSearchTerm = '';
  lastPlatformExternalQuery = '';
  lastPlatformExternalResults = [];
  platformExternalLoading = false;
  platformExternalError = '';
  const input = document.getElementById('platform-search-input');
  if (input) input.value = '';
  renderPublicProfilesDirectory();
  refreshIcons();
};

window.setPlatformSearchScope = function (scope) {
  platformSearchScope = ['all', 'following', 'users', 'books', 'topics'].includes(scope) ? scope : 'all';
  renderPublicProfilesDirectory();
  refreshIcons();
};

window.applyPlatformTopicChip = function (topic) {
  platformSearchTerm = String(topic || '');
  const input = document.getElementById('platform-search-input');
  if (input) input.value = platformSearchTerm;
  renderPublicProfilesDirectory();
  refreshIcons();
};

window.openUserBookFromGlobalSearch = function (username, bookId) {
  const acc = findLocalAccountByUsername(username);
  if (!acc) return;

  loadAccountIntoWorkingState(acc);
  saveState();

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('u', acc.profile.username);
      window.history.replaceState(null, '', nextUrl.toString());
    } catch (_) {}
  }

  renderAll();
  openBookModal(bookId);
};

window.openProfileAndScroll = function (username) {
  selectPublicProfile(username);
};

function renderPlatformSearchResults(accounts, qNorm) {
  const container = document.getElementById('platform-search-results');
  if (!container) return;

  const shouldShow =
    platformSearchScope !== 'users' &&
    (Boolean(qNorm) || platformSearchScope === 'books' || platformSearchScope === 'topics');

  if (!shouldShow) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');

  const showBooks = platformSearchScope === 'all' || platformSearchScope === 'books';
  const showTopics = platformSearchScope === 'all' || platformSearchScope === 'topics';

  // Agrega livros de todas as pessoas cadastradas
  const matchedBooks = [];
  const bookOwnerMap = new Map();

  for (const acc of accounts) {
    const ownerName = acc.profile?.name || 'Leitor(a)';
    const ownerUsername = normalizeUsername(acc.profile?.username) || 'oseunome';
    for (const book of (acc.books || [])) {
      bookOwnerMap.set(book.id, { book, ownerName, ownerUsername });
      if (!showBooks) continue;
      const haystack = `${getBookSearchableText(book)} ${normalizeSearchText(ownerName)} ${normalizeSearchText(ownerUsername)}`;
      if (!qNorm || haystack.includes(qNorm)) {
        matchedBooks.push({ book, ownerName, ownerUsername });
      }
    }
  }

  // Agrega clubes de leitura & assuntos
  const matchedClubs = [];
  const matchedComments = [];

  if (showTopics) {
    for (const acc of accounts) {
      const ownerName = acc.profile?.name || 'Leitor(a)';
      const ownerUsername = normalizeUsername(acc.profile?.username) || 'oseunome';
      for (const club of (acc.clubs || [])) {
        const clubHaystack = normalizeSearchText(`${club.name || ''} ${club.meta || ''} ${ownerName} @${ownerUsername}`);
        if (!qNorm || clubHaystack.includes(qNorm)) {
          matchedClubs.push({ club, ownerName, ownerUsername });
        }
      }
    }

    for (const c of (appState.comments || [])) {
      const ref = bookOwnerMap.get(c.bookId);
      if (!ref) continue;
      const commentHaystack = normalizeSearchText(
        `${c.text || ''} ${c.authorName || ''} ${c.authorHandle || ''} ${ref.book.title || ''} ${ref.book.author || ''} @${ref.ownerUsername}`
      );
      if (!qNorm || commentHaystack.includes(qNorm)) {
        matchedComments.push({
          comment: c,
          book: ref.book,
          ownerName: ref.ownerName,
          ownerUsername: ref.ownerUsername
        });
      }
    }
  }

  const sectionsHtml = [];

  if (showBooks) {
    const rawTerm = platformSearchTerm.trim();
    const booksHtml = matchedBooks.length > 0
      ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${matchedBooks.map(({ book, ownerName, ownerUsername }) => {
            const coverSrc = safeUrl(book.coverUrl, '') || buildFallbackCoverDataUri(book.title, book.author);
            const shelfMeta = getShelfMeta(book.shelf);
            const amazonHref = buildAmazonUrl(book);
            return `
              <div class="flex gap-3 p-3 rounded-2xl bg-paper-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/80 items-start">
                <button type="button" onclick="openUserBookFromGlobalSearch('${escapeHtml(ownerUsername)}', '${escapeHtml(book.id)}')"
                  class="w-14 aspect-[2/3] rounded-lg overflow-hidden shadow-sm shrink-0 bg-stone-200 dark:bg-stone-700">
                  <img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(book.title)}"
                    ${renderBookCoverImgAttrs(book)}
                    class="w-full h-full object-cover" />
                </button>
                <div class="flex-1 min-w-0 space-y-1.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${shelfMeta.badgeClass}">
                      ${escapeHtml(shelfMeta.label)}
                    </span>
                    ${Number(book.rating) > 0 ? renderStars(book.rating, 'w-3 h-3') : ''}
                  </div>
                  <div>
                    <h4 onclick="openUserBookFromGlobalSearch('${escapeHtml(ownerUsername)}', '${escapeHtml(book.id)}')"
                      class="cursor-pointer font-serif font-bold text-sm text-stone-900 dark:text-white hover:text-terracotta-600 dark:hover:text-amber-400 transition line-clamp-1">
                      ${escapeHtml(book.title)}
                    </h4>
                    <p class="text-xs text-stone-500 dark:text-stone-400 truncate">${escapeHtml(book.author)}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <button type="button" onclick="openProfileAndScroll('${escapeHtml(ownerUsername)}')"
                      class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-[11px] font-semibold text-stone-700 dark:text-stone-200 hover:border-amber-400 transition">
                      <span>👤</span>
                      <span>@${escapeHtml(ownerUsername)}</span>
                    </button>
                    <button type="button" onclick="openUserBookFromGlobalSearch('${escapeHtml(ownerUsername)}', '${escapeHtml(book.id)}')"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 dark:bg-stone-700 dark:hover:bg-stone-600 text-white text-[11px] font-semibold transition">
                      Ver Livro
                    </button>
                    <a href="${escapeHtml(amazonHref)}" target="_blank" rel="noopener noreferrer"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 text-[11px] font-bold transition">
                      Amazon
                    </a>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>`
      : `<p class="text-xs text-stone-500 dark:text-stone-400 italic">Nenhum livro ou autor encontrado nas estantes para essa busca.</p>`;

    const externalDiscoveryHtml = rawTerm.length >= 2
      ? `<div class="p-4 rounded-2xl bg-gradient-to-br from-amber-50/80 via-paper-50 to-white dark:from-amber-950/30 dark:via-stone-900 dark:to-stone-900 border border-amber-200/80 dark:border-amber-800/50 space-y-3">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                <span>🔎</span>
                <span>Buscar mais livros e capas na Amazon / Catálogo Global</span>
              </h4>
              <p class="text-[11px] text-stone-600 dark:text-stone-300 mt-0.5">
                Pesquise qualquer título, autor, ISBN ou link da Amazon com capa em alta definição e opção de salvar na sua estante.
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2 shrink-0">
              <button type="button" onclick="searchExternalBooksForPlatform()"
                class="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition inline-flex items-center gap-1.5">
                <i data-lucide="search" class="w-3.5 h-3.5"></i>
                <span>Buscar "${escapeHtml(rawTerm)}" no Catálogo</span>
              </button>
              <a href="${escapeHtml(buildAmazonUrl({ title: rawTerm }))}" target="_blank" rel="noopener noreferrer"
                class="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold transition inline-flex items-center gap-1">
                <i data-lucide="shopping-bag" class="w-3.5 h-3.5"></i>
                <span>Ver na Amazon</span>
              </a>
            </div>
          </div>
          <div id="platform-external-search-results" class="space-y-2.5"></div>
        </div>`
      : '';

    sectionsHtml.push(`
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
            <span>📚</span>
            <span>Livros &amp; Autores nas Estantes (${matchedBooks.length})</span>
          </h3>
        </div>
        ${booksHtml}
        ${externalDiscoveryHtml}
      </div>
    `);
  }

  if (showTopics) {
    const clubsHtml = matchedClubs.length > 0
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          ${matchedClubs.map(({ club, ownerName, ownerUsername }) => {
            const clubLink = safeUrl(club.meta, '');
            const metaText = club.meta && !clubLink ? club.meta : '';
            return `
              <button type="button" onclick="openProfileAndScroll('${escapeHtml(ownerUsername)}')"
                class="text-left p-3 rounded-2xl bg-paper-50 hover:bg-white dark:bg-stone-800/60 dark:hover:bg-stone-800 border border-stone-200/80 dark:border-stone-700/80 transition flex items-center justify-between gap-3">
                <div class="flex items-center gap-2.5 min-w-0">
                  <span class="w-9 h-9 rounded-xl bg-amber-100/80 dark:bg-amber-950/60 flex items-center justify-center text-base shrink-0">${escapeHtml(club.emoji || '📚')}</span>
                  <div class="min-w-0">
                    <p class="font-semibold text-xs sm:text-sm text-stone-900 dark:text-white truncate">${escapeHtml(club.name)}</p>
                    <p class="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      ${metaText ? `${escapeHtml(metaText)} • ` : ''}por @${escapeHtml(ownerUsername)} (${escapeHtml(ownerName)})
                    </p>
                  </div>
                </div>
                <span class="shrink-0 text-[11px] font-bold text-amber-700 dark:text-amber-400">Ver →</span>
              </button>
            `;
          }).join('')}
        </div>`
      : '';

    const commentsHtml = matchedComments.length > 0
      ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          ${matchedComments.map(({ comment, book, ownerUsername }) => `
            <div class="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/70 dark:border-stone-700/70 space-y-1.5">
              <div class="flex items-center justify-between gap-2 text-xs">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="font-bold text-stone-900 dark:text-white truncate">${escapeHtml(comment.authorName)}</span>
                  ${comment.authorHandle ? `<span class="text-amber-700 dark:text-amber-400 font-medium truncate">${escapeHtml(comment.authorHandle)}</span>` : ''}
                </div>
                ${Number(comment.rating) > 0 ? renderStars(comment.rating, 'w-3 h-3') : ''}
              </div>
              <p class="text-xs text-stone-600 dark:text-stone-300 line-clamp-2">"${escapeHtml(comment.text)}"</p>
              <div class="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                <span class="text-stone-500 dark:text-stone-400 truncate">Em <strong>${escapeHtml(book.title)}</strong> (@${escapeHtml(ownerUsername)})</span>
                <button type="button" onclick="openUserBookFromGlobalSearch('${escapeHtml(ownerUsername)}', '${escapeHtml(book.id)}')"
                  class="shrink-0 font-bold text-amber-700 dark:text-amber-400 hover:underline">
                  Ir para discussão
                </button>
              </div>
            </div>
          `).join('')}
        </div>`
      : '';

    const emptyTopics = matchedClubs.length === 0 && matchedComments.length === 0
      ? '<p class="text-xs text-stone-500 dark:text-stone-400 italic">Nenhum clube de leitura, comentário ou assunto encontrado para essa busca.</p>'
      : '';

    sectionsHtml.push(`
      <div class="space-y-3">
        <h3 class="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
          <span>🏅</span>
          <span>Clubes de Leitura, Comentários &amp; Assuntos (${matchedClubs.length + matchedComments.length})</span>
        </h3>
        ${clubsHtml}
        ${commentsHtml}
        ${emptyTopics}
      </div>
    `);
  }

  container.innerHTML = sectionsHtml.join('');
  renderPlatformExternalResultsList();
}

function renderPlatformExternalResultsList() {
  const extEl = document.getElementById('platform-external-search-results');
  if (!extEl) return;

  if (platformExternalLoading) {
    extEl.innerHTML = '<p class="text-xs text-amber-800 dark:text-amber-300 font-medium">🔎 Buscando capas na Amazon, Apple Books BR, Google Books e Open Library...</p>';
    return;
  }

  if (platformExternalError) {
    extEl.innerHTML = `<p class="text-xs text-rose-600 dark:text-rose-400">${escapeHtml(platformExternalError)}</p>`;
    return;
  }

  if (normalizeSearchText(platformSearchTerm) !== lastPlatformExternalQuery || lastPlatformExternalResults.length === 0) {
    extEl.innerHTML = '';
    return;
  }

  extEl.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
      ${lastPlatformExternalResults.map((book, idx) => {
        const thumb = safeUrl(book.thumbnail, '') || buildFallbackCoverDataUri(book.title, book.author);
        const amazonHref = buildAmazonUrl(book);
        return `
          <div class="flex gap-3 p-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-700/80 items-start shadow-2xs">
            <img src="${escapeHtml(thumb)}" alt="${escapeHtml(book.title)}"
              ${renderBookCoverImgAttrs(book, `platform-ext-cover-${idx}`)}
              class="w-14 aspect-[2/3] rounded-lg object-cover shadow-sm shrink-0 bg-stone-200 dark:bg-stone-700" />
            <div class="flex-1 min-w-0 space-y-1.5">
              <div class="flex items-start justify-between gap-2">
                <h5 class="font-serif font-bold text-sm text-stone-900 dark:text-white line-clamp-1">${escapeHtml(book.title)}</h5>
                <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">${escapeHtml(book.source || 'Catálogo')}</span>
              </div>
              <p class="text-xs text-stone-500 dark:text-stone-400 truncate">${escapeHtml(book.author)}${book.publishedDate ? ` • ${escapeHtml(String(book.publishedDate).slice(0, 4))}` : ''}</p>
              <div class="flex flex-wrap items-center gap-1.5 pt-0.5">
                <a href="${escapeHtml(amazonHref)}" target="_blank" rel="noopener noreferrer"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-stone-950 text-[11px] font-bold transition">
                  Comprar na Amazon
                </a>
                <button type="button" onclick="addExternalBookToMyShelf(${idx})"
                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-[11px] font-semibold transition">
                  ➕ Adicionar à Minha Estante
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.searchExternalBooksForPlatform = async function () {
  const rawTerm = (document.getElementById('platform-search-input')?.value || platformSearchTerm || '').trim();
  if (rawTerm.length < 2) {
    showToast('Digite pelo menos 2 caracteres para buscar no catálogo global.', 'ℹ️');
    return;
  }

  platformSearchTerm = rawTerm;
  if (platformSearchScope === 'users' || platformSearchScope === 'topics') {
    platformSearchScope = 'all';
  }

  const seq = ++platformExternalSearchSeq;
  lastPlatformExternalQuery = normalizeSearchText(rawTerm);
  lastPlatformExternalResults = [];
  platformExternalLoading = true;
  platformExternalError = '';
  renderPublicProfilesDirectory();
  refreshIcons();

  try {
    const { books } = await searchBooksMultiSource(rawTerm);
    if (seq !== platformExternalSearchSeq) return;

    const limited = books.slice(0, 6);
    lastPlatformExternalResults = limited;
    platformExternalLoading = false;

    if (limited.length === 0) {
      platformExternalError = 'Nenhum resultado encontrado nas bases externas. Tente outro título, autor, ISBN ou link da Amazon.';
    }

    renderPlatformExternalResultsList();
    refreshIcons();

    if (limited.length > 0) {
      void resolveBestCoversForResults(limited, (idx, resolvedUrl) => {
        if (seq !== platformExternalSearchSeq || !lastPlatformExternalResults[idx] || !resolvedUrl) return;
        lastPlatformExternalResults[idx].thumbnail = resolvedUrl;
        const imgEl = document.getElementById(`platform-ext-cover-${idx}`);
        if (imgEl) {
          imgEl.dataset.fallbackApplied = '1';
          imgEl.dataset.healingApplied = '1';
          imgEl.src = resolvedUrl;
        }
      });
    }
  } catch (err) {
    if (seq !== platformExternalSearchSeq) return;
    platformExternalLoading = false;
    platformExternalError = `Erro ao consultar catálogo global: ${err.message}`;
    renderPlatformExternalResultsList();
  }
};

window.addExternalBookToMyShelf = function (index) {
  const picked = lastPlatformExternalResults[index];
  if (!picked) return;

  if (!authSession) {
    pendingBookToImport = picked;
    pendingAdminAfterAuth = true;
    openAuthModal('login');
    showToast('Entre ou crie sua conta para adicionar este livro à sua estante.', '🔐');
    return;
  }

  switchMainView('admin');
  switchAdminTab('add');
  fillBookFormFromResult(picked);
};

function renderPublicProfilesDirectory() {
  const listEl = document.getElementById('public-profiles-list');
  const countEl = document.getElementById('public-profiles-count');
  if (!listEl) return;

  updatePlatformSearchControlsUI();

  const accounts = appState?.accounts || [];
  const comments = appState?.comments || [];
  const activeSlug = normalizeUsername(appState?.profile?.username);
  const ownSlug = authSession?.userId ? normalizeUsername(authSession.username) : '';
  const followingList = getActiveFollowingList();
  const followingSet = new Set(followingList);
  const qNorm = normalizeSearchText(platformSearchTerm);

  const topCommunityCountEl = document.getElementById('top-community-count-badge');
  const topFollowingCountEl = document.getElementById('top-following-count-badge');
  const tabFollowingCountEl = document.getElementById('platform-following-tab-count');
  if (topCommunityCountEl) {
    topCommunityCountEl.textContent = `${accounts.length} ${accounts.length === 1 ? 'perfil' : 'perfis'}`;
  }
  if (topFollowingCountEl) topFollowingCountEl.textContent = String(followingList.length);
  if (tabFollowingCountEl) tabFollowingCountEl.textContent = String(followingList.length);

  const scopeAccounts = platformSearchScope === 'following'
    ? accounts.filter((acc) => followingSet.has(normalizeUsername(acc.profile?.username)))
    : accounts;

  const filteredAccounts = qNorm
    ? scopeAccounts.filter((acc) => getAccountSearchableText(acc, comments).includes(qNorm))
    : scopeAccounts;

  if (countEl) {
    if (platformSearchScope === 'following') {
      countEl.textContent = `${filteredAccounts.length} seguido(s)`;
    } else {
      countEl.textContent = qNorm
        ? `${filteredAccounts.length} de ${accounts.length} ${accounts.length === 1 ? 'perfil' : 'perfis'}`
        : `${accounts.length} ${accounts.length === 1 ? 'perfil ativo' : 'perfis ativos'}`;
    }
  }

  const showUsersGrid = platformSearchScope === 'all' || platformSearchScope === 'users' || platformSearchScope === 'following';
  listEl.classList.toggle('hidden', !showUsersGrid);

  if (showUsersGrid) {
    const profileCardsHtml = filteredAccounts.map((acc) => {
      const p = acc.profile || {};
      const slug = normalizeUsername(p.username) || 'oseunome';
      const isActive = slug === activeSlug;
      const isOwnCard = Boolean(ownSlug && slug === ownSlug);
      const isFollowing = followingSet.has(slug);
      const followersCount = getFollowersListForUser(slug).length;
      const books = Array.isArray(acc.books) ? acc.books : [];
      const clubs = Array.isArray(acc.clubs) ? acc.clubs : [];
      const bookCount = books.length;
      const currentReading = books.find((b) => b.shelf === 'reading');
      const avatarSrc = safeUrl(p.avatarUrl, '');
      const initials = escapeHtml(
        (p.name || slug || 'NM')
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0] || '')
          .join('')
          .toUpperCase()
      );

      const avatarHtml = avatarSrc
        ? `<img src="${escapeHtml(avatarSrc)}" alt="${escapeHtml(p.name || slug)}" onerror="handleAvatarError(this, '${escapeHtml(p.name || slug)}')" class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover ring-4 ring-paper-100 dark:ring-stone-700 shadow-md shrink-0 bg-stone-200 dark:bg-stone-700" />`
        : `<div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-terracotta-500 text-white font-serif font-bold text-xl flex items-center justify-center ring-4 ring-paper-100 dark:ring-stone-700 shadow-md shrink-0">${initials}</div>`;

      const visibleClubs = clubs.slice(0, 2);
      const extraClubs = clubs.length > 2 ? clubs.length - 2 : 0;
      const clubsBadgesHtml = visibleClubs.length > 0
        ? `<div class="flex flex-wrap items-center justify-center gap-1 w-full">
            ${visibleClubs.map((c) => `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-paper-100 dark:bg-stone-800 border border-paper-200 dark:border-stone-700 text-[10px] font-medium text-stone-700 dark:text-stone-300 max-w-full truncate">
                <span>${escapeHtml(c.emoji || '📚')}</span>
                <span class="truncate">${escapeHtml(c.name)}</span>
              </span>
            `).join('')}
            ${extraClubs > 0 ? `<span class="text-[10px] font-semibold text-stone-400">+${extraClubs}</span>` : ''}
          </div>`
        : '';

      const readingBadgeHtml = currentReading
        ? `<div class="w-full px-2.5 py-1 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 text-[10px] font-semibold text-amber-900 dark:text-amber-200 truncate">
            📖 Lendo: ${escapeHtml(currentReading.title)}
          </div>`
        : '';

      const followCardBtnHtml = isOwnCard
        ? ''
        : `<button type="button" onclick="toggleFollowUser('${escapeHtml(slug)}', event)"
            class="shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition border ${
              isFollowing
                ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                : 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }" title="${isFollowing ? 'Deixar de seguir' : 'Seguir estante'}">
            ${isFollowing ? '✓ Seguindo' : '➕ Seguir'}
          </button>`;

      return `
        <div role="button" tabindex="0" onclick="selectPublicProfile('${escapeHtml(slug)}')"
          onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPublicProfile('${escapeHtml(slug)}'); }"
          class="group cursor-pointer relative min-h-[320px] h-full rounded-2xl p-4 border flex flex-col items-center justify-between gap-2.5 text-center transition focus:outline-none focus:ring-2 focus:ring-amber-500 ${
            isActive
              ? 'bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/40 dark:to-stone-900 border-amber-400 dark:border-amber-600 shadow-soft ring-2 ring-amber-400/40'
              : 'bg-paper-50 hover:bg-white dark:bg-stone-800/60 dark:hover:bg-stone-800 border-stone-200/80 dark:border-stone-700/80 hover:shadow-soft'
          }">
          <div class="w-full flex justify-end min-h-[1.25rem]">
            ${isActive
              ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-stone-950">✓ Estante Ativa</span>'
              : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-200/70 dark:bg-stone-700/70 text-stone-600 dark:text-stone-300 opacity-85 group-hover:opacity-100">Perfil</span>'}
          </div>

          <div class="flex flex-col items-center gap-2 min-w-0 w-full">
            ${avatarHtml}
            <div class="min-w-0 w-full space-y-0.5">
              <h3 class="font-serif font-bold text-sm sm:text-base text-stone-900 dark:text-white line-clamp-1">${escapeHtml(p.name || slug)}</h3>
              <p class="text-xs font-semibold text-amber-700 dark:text-amber-400 truncate">@${escapeHtml(slug)}</p>
            </div>
            <p class="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2 leading-snug px-1">
              ${escapeHtml(p.bio || 'Estante literária aberta para recomendações e leituras.')}
            </p>
            ${clubsBadgesHtml}
            ${readingBadgeHtml}
          </div>

          <div class="w-full space-y-2 pt-1">
            <div class="flex flex-wrap items-center justify-center gap-1.5">
              <span class="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-paper-100 dark:bg-stone-800 border border-paper-200 dark:border-stone-700 text-[10px] font-semibold text-stone-700 dark:text-stone-200">
                👥 ${followersCount} ${followersCount === 1 ? 'seg.' : 'segs.'}
              </span>
              <span class="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-paper-100 dark:bg-stone-800 border border-paper-200 dark:border-stone-700 text-[10px] font-semibold text-stone-700 dark:text-stone-200">
                📚 ${bookCount} ${bookCount === 1 ? 'livro' : 'livros'}
              </span>
            </div>
            <div class="flex items-center gap-1.5 w-full">
              <span class="flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
                isActive
                  ? 'bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950'
                  : 'bg-stone-100 group-hover:bg-amber-500 text-stone-700 group-hover:text-stone-950 dark:bg-stone-700 dark:text-stone-200 dark:group-hover:bg-amber-500 dark:group-hover:text-stone-950'
              }">
                ${isActive ? '✓ Em Destaque' : 'Ver Estante'}
              </span>
              ${followCardBtnHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const emptyUsersHtml = filteredAccounts.length === 0
      ? (platformSearchScope === 'following' && !qNorm && followingList.length === 0
        ? `<div class="col-span-full rounded-2xl p-6 border border-dashed border-stone-300 dark:border-stone-700 text-center space-y-2 bg-stone-50/70 dark:bg-stone-800/40">
            <p class="text-sm font-semibold text-stone-700 dark:text-stone-200">Você ainda não segue nenhuma estante.</p>
            <p class="text-xs text-stone-500 dark:text-stone-400">Clique em "➕ Seguir" nos perfis da comunidade para acompanhar as leituras por aqui.</p>
            <button type="button" onclick="setPlatformSearchScope('all')"
              class="mt-1 inline-flex items-center px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition">
              Explorar todos os perfis
            </button>
          </div>`
        : `<div class="col-span-full rounded-2xl p-6 border border-dashed border-stone-300 dark:border-stone-700 text-center space-y-2 bg-stone-50/70 dark:bg-stone-800/40">
            <p class="text-sm font-semibold text-stone-700 dark:text-stone-200">Nenhuma pessoa encontrada para "${escapeHtml(platformSearchTerm.trim())}"</p>
            <p class="text-xs text-stone-500 dark:text-stone-400">Tente buscar outro nome, @usuario, livro ou assunto.</p>
            <button type="button" onclick="clearPlatformSearch()"
              class="mt-1 inline-flex items-center px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition">
              Limpar busca
            </button>
          </div>`)
      : '';

    const addProfileCardHtml = platformSearchScope === 'following'
      ? ''
      : `
        <button type="button" onclick="openAuthModal('signup')"
          class="group min-h-[320px] h-full rounded-2xl p-4 border-2 border-dashed border-stone-300 hover:border-amber-500 dark:border-stone-700 dark:hover:border-amber-500 bg-stone-50/50 hover:bg-amber-50/40 dark:bg-stone-900/40 dark:hover:bg-amber-950/20 flex flex-col items-center justify-center text-center gap-3 transition">
          <div class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center text-2xl shadow-xs group-hover:scale-105 transition">
            ➕
          </div>
          <div class="space-y-1">
            <p class="font-serif font-bold text-sm sm:text-base text-stone-800 dark:text-stone-100">Criar Meu Perfil</p>
            <p class="text-[11px] text-stone-500 dark:text-stone-400 leading-snug px-2">Cadastre sua estante e apareça aqui na vitrine</p>
          </div>
        </button>
      `;

    listEl.innerHTML = filteredAccounts.length > 0
      ? profileCardsHtml + addProfileCardHtml
      : emptyUsersHtml;
  }

  renderPlatformSearchResults(scopeAccounts, qNorm);
}

window.selectPublicProfile = function (username, options = {}) {
  const acc = findLocalAccountByUsername(username);
  if (!acc) return;

  loadAccountIntoWorkingState(acc);
  saveState();

  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('u', acc.profile.username);
      window.history.replaceState(null, '', nextUrl.toString());
    } catch (_) {}
  }

  renderAll();
  showToast(`Visualizando a estante de @${acc.profile.username}`, '📚');

  if (options.scroll !== false) {
    const heroCard = document.getElementById('active-profile-card') || document.getElementById('profile-name');
    if (heroCard) {
      heroCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      heroCard.classList.add('ring-4', 'ring-amber-400/70');
      if (profileHighlightTimeout) clearTimeout(profileHighlightTimeout);
      profileHighlightTimeout = setTimeout(() => {
        heroCard.classList.remove('ring-4', 'ring-amber-400/70');
      }, 1400);
    }
  }
};

function renderPublicShelf() {
  renderPublicProfilesDirectory();
  renderPublicProfile();

  const allBooks = appState.books || [];
  const counts = {
    all: allBooks.length,
    reading: allBooks.filter((b) => b.shelf === 'reading').length,
    read: allBooks.filter((b) => b.shelf === 'read').length,
    wishlist: allBooks.filter((b) => b.shelf === 'wishlist').length
  };

  document.getElementById('count-all').textContent = counts.all;
  document.getElementById('count-reading').textContent = counts.reading;
  document.getElementById('count-read').textContent = counts.read;
  document.getElementById('count-wishlist').textContent = counts.wishlist;

  // Estilo ativo nas abas de filtro
  document.querySelectorAll('.shelf-tab').forEach((btn) => {
    const active = btn.dataset.filter === currentShelfFilter;
    btn.className = active
      ? 'shelf-tab shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm'
      : 'shelf-tab shrink-0 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition bg-stone-100/80 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700';
  });

  const q = publicSearchTerm.trim().toLowerCase();
  const filteredBooks = allBooks.filter((b) => {
    if (!q) return true;
    return (
      (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.synopsis || '').toLowerCase().includes(q) ||
      (b.review || '').toLowerCase().includes(q)
    );
  });

  const readingBooks = filteredBooks.filter((b) => b.shelf === 'reading');
  const readBooks = filteredBooks.filter((b) => b.shelf === 'read');
  const wishlistBooks = filteredBooks.filter((b) => b.shelf === 'wishlist');

  const showReading = currentShelfFilter === 'all' || currentShelfFilter === 'reading';
  const showRead = currentShelfFilter === 'all' || currentShelfFilter === 'read';
  const showWishlist = currentShelfFilter === 'all' || currentShelfFilter === 'wishlist';

  const secReading = document.getElementById('section-reading');
  const secRead = document.getElementById('section-read');
  const secWishlist = document.getElementById('section-wishlist');
  const emptySearchEl = document.getElementById('public-empty-search');

  const readingVisible = showReading && (readingBooks.length > 0 || (currentShelfFilter === 'reading' && !q));
  const readVisible = showRead && (readBooks.length > 0 || (currentShelfFilter === 'read' && !q));
  const wishlistVisible = showWishlist && (wishlistBooks.length > 0 || (currentShelfFilter === 'wishlist' && !q));

  secReading.classList.toggle('hidden', !readingVisible);
  secRead.classList.toggle('hidden', !readVisible);
  secWishlist.classList.toggle('hidden', !wishlistVisible);

  const nothingVisible = !readingVisible && !readVisible && !wishlistVisible;
  emptySearchEl.classList.toggle('hidden', !nothingVisible);

  renderReadingCards(readingBooks);
  renderGridCards('read-books-container', readBooks, 'read');
  renderGridCards('wishlist-books-container', wishlistBooks, 'wishlist');
  refreshIcons();
}

function renderReadingCards(books) {
  const container = document.getElementById('reading-books-container');
  if (books.length === 0) {
    container.innerHTML = `
      <div class="bg-white dark:bg-stone-900 rounded-3xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-sm text-stone-500">
        Nenhum livro em "Lendo Agora" no momento. Adicione ou mova um livro pelo Painel Admin.
      </div>`;
    return;
  }

  container.innerHTML = books.map((book) => {
    const coverSrc = safeUrl(book.coverUrl, '') || buildFallbackCoverDataUri(book.title, book.author);
    const amazonHref = buildAmazonUrl(book);
    const commentsCount = getCommentsCountForBook(book.id);
    const progress = Math.max(0, Math.min(100, Number(book.progress) || 0));

    return `
      <article class="relative overflow-hidden bg-gradient-to-br from-white via-paper-50 to-amber-50/50 dark:from-stone-900 dark:via-stone-900 dark:to-amber-950/20 border border-amber-200/70 dark:border-stone-800 rounded-3xl p-5 sm:p-7 shadow-soft">
        <div class="flex flex-col sm:flex-row gap-6 items-center sm:items-stretch">
          <!-- Capa em destaque -->
          <button type="button" onclick="openBookModal('${escapeHtml(book.id)}')"
            class="group relative w-36 sm:w-44 aspect-[2/3] rounded-2xl overflow-hidden shadow-book book-spine-effect shrink-0 bg-stone-200 dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500">
            <img src="${escapeHtml(coverSrc)}" alt="Capa de ${escapeHtml(book.title)}"
              ${renderBookCoverImgAttrs(book)}
              class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
          </button>

          <!-- Informações do Livro Atual -->
          <div class="flex-1 flex flex-col justify-between space-y-4 text-center sm:text-left min-w-0">
            <div class="space-y-2.5">
              <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                  <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Leitura em Andamento
                </span>
                <span class="text-xs font-semibold text-stone-500 dark:text-stone-400">${progress}% concluído</span>
              </div>

              <div>
                <h3 onclick="openBookModal('${escapeHtml(book.id)}')"
                  class="cursor-pointer font-serif text-2xl sm:text-3xl font-bold text-stone-900 dark:text-white hover:text-terracotta-600 dark:hover:text-amber-400 transition leading-tight">
                  ${escapeHtml(book.title)}
                </h3>
                <p class="text-sm sm:text-base font-medium text-stone-500 dark:text-stone-400 mt-1">${escapeHtml(book.author)}</p>
              </div>

              <!-- Barra de Progresso -->
              <div class="w-full max-w-md mx-auto sm:mx-0">
                <div class="h-2.5 w-full rounded-full bg-stone-200/80 dark:bg-stone-800 overflow-hidden">
                  <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-terracotta-500 transition-all duration-500" style="width: ${progress}%"></div>
                </div>
              </div>

              <p class="text-sm text-stone-600 dark:text-stone-300 leading-relaxed line-clamp-3">
                ${escapeHtml(book.synopsis || book.review || 'Clique para ver os detalhes desta obra e participar da discussão.')}
              </p>
            </div>

            <!-- Botões de Ação -->
            <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
              <a href="${escapeHtml(amazonHref)}" target="_blank" rel="noopener noreferrer"
                class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-sm shadow-sm transition">
                <i data-lucide="shopping-bag" class="w-4 h-4"></i>
                <span>Comprar na Amazon</span>
                <i data-lucide="external-link" class="w-3.5 h-3.5 opacity-75"></i>
              </a>

              <button type="button" onclick="openBookModal('${escapeHtml(book.id)}')"
                class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 text-sm font-semibold transition">
                <i data-lucide="message-circle" class="w-4 h-4 text-amber-600"></i>
                <span>Comentários (${commentsCount})</span>
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderGridCards(containerId, books, shelfType) {
  const container = document.getElementById(containerId);
  if (books.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-white dark:bg-stone-900 rounded-3xl border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center text-sm text-stone-500">
        Nenhum livro nesta prateleira ainda.
      </div>`;
    return;
  }

  container.innerHTML = books.map((book) => {
    const coverSrc = safeUrl(book.coverUrl, '') || buildFallbackCoverDataUri(book.title, book.author);
    const amazonHref = buildAmazonUrl(book);
    const commentsCount = getCommentsCountForBook(book.id);
    const snippet = shelfType === 'read'
      ? (book.review || book.synopsis || '')
      : (book.synopsis || book.review || '');

    return `
      <article class="group bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-3xl p-4 sm:p-5 shadow-sm hover:shadow-soft transition flex flex-col justify-between gap-4">
        <div class="space-y-4">
          <!-- Topo com Capa + Título + Nota -->
          <div class="flex gap-4">
            <button type="button" onclick="openBookModal('${escapeHtml(book.id)}')"
              class="w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-book book-spine-effect shrink-0 bg-stone-200 dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500">
              <img src="${escapeHtml(coverSrc)}" alt="Capa de ${escapeHtml(book.title)}"
                ${renderBookCoverImgAttrs(book)}
                class="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
            </button>

            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <h3 onclick="openBookModal('${escapeHtml(book.id)}')"
                  class="cursor-pointer font-serif font-bold text-lg text-stone-900 dark:text-white group-hover:text-terracotta-600 dark:group-hover:text-amber-400 transition leading-snug line-clamp-2">
                  ${escapeHtml(book.title)}
                </h3>
                <p class="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1 truncate">${escapeHtml(book.author)}</p>
              </div>

              <div class="pt-2">
                ${shelfType === 'read' && Number(book.rating) > 0
                  ? renderStars(book.rating, 'w-4 h-4')
                  : '<span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300">Na lista de desejos</span>'}
              </div>
            </div>
          </div>

          <!-- Resenha ou Sinopse curta -->
          ${snippet ? `
            <p class="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed line-clamp-3">
              ${escapeHtml(snippet)}
            </p>
          ` : ''}
        </div>

        <!-- Rodapé do Card -->
        <div class="pt-3 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
          <a href="${escapeHtml(amazonHref)}" target="_blank" rel="noopener noreferrer"
            class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold text-xs shadow-2xs transition">
            <i data-lucide="shopping-bag" class="w-3.5 h-3.5"></i>
            <span>Amazon</span>
          </a>

          <button type="button" onclick="openBookModal('${escapeHtml(book.id)}')"
            class="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 text-xs font-semibold transition"
            title="Ver detalhes e comentários">
            <i data-lucide="message-circle" class="w-3.5 h-3.5 text-amber-600"></i>
            <span>${commentsCount}</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

/* ==========================================================================
   MODAL DE LIVRO & COMENTÁRIOS COM LOGIN ULTRARRÁPIDO
   ========================================================================== */
function getVisitor() {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function setVisitor(visitor) {
  if (visitor) {
    localStorage.setItem(VISITOR_KEY, JSON.stringify(visitor));
  } else {
    localStorage.removeItem(VISITOR_KEY);
  }
}

window.openBookModal = function (bookId) {
  const book = (appState.books || []).find((b) => b.id === bookId);
  if (!book) return;
  activeModalBookId = bookId;

  const modal = document.getElementById('book-modal');
  const shelfMeta = getShelfMeta(book.shelf);
  const badgeEl = document.getElementById('modal-book-shelf-badge');
  badgeEl.textContent = shelfMeta.label;
  badgeEl.className = `inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${shelfMeta.badgeClass}`;

  const coverEl = document.getElementById('modal-book-cover');
  coverEl.dataset.fallbackApplied = '';
  coverEl.dataset.healingApplied = '';
  coverEl.dataset.bookId = book.id || '';
  coverEl.dataset.bookTitle = book.title || '';
  coverEl.dataset.bookAuthor = book.author || '';
  coverEl.dataset.bookIsbn = book.isbn || '';
  coverEl.onload = function () {
    handleBookCoverLoad(this);
  };
  coverEl.onerror = function () {
    handleBookCoverError(this);
  };
  coverEl.src = safeUrl(book.coverUrl, '') || buildFallbackCoverDataUri(book.title, book.author);
  coverEl.alt = `Capa de ${book.title}`;

  document.getElementById('modal-book-title').textContent = book.title;
  document.getElementById('modal-book-author').textContent = book.author;

  // Meta (Estrelas ou Progresso)
  const metaEl = document.getElementById('modal-book-meta');
  const metaItems = [];
  if (Number(book.rating) > 0) {
    metaItems.push(`<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-xs font-semibold">${renderStars(book.rating, 'w-3.5 h-3.5')} (${book.rating}/5)</span>`);
  }
  if (book.shelf === 'reading') {
    metaItems.push(`<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-xs font-semibold">Progresso: ${Number(book.progress) || 0}%</span>`);
  }
  if (book.isbn) {
    metaItems.push(`<span class="inline-flex items-center px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-[11px] font-mono text-stone-500">ISBN: ${escapeHtml(book.isbn)}</span>`);
  }
  metaEl.innerHTML = metaItems.join('');

  document.getElementById('modal-book-amazon-btn').href = buildAmazonUrl(book);
  updateModalCopyBookButton(book);

  const reviewBox = document.getElementById('modal-book-review-box');
  const reviewEl = document.getElementById('modal-book-review');
  if (book.review && book.review.trim()) {
    reviewEl.textContent = book.review;
    reviewBox.classList.remove('hidden');
  } else {
    reviewBox.classList.add('hidden');
  }

  const synopsisEl = document.getElementById('modal-book-synopsis');
  synopsisEl.textContent = book.synopsis && book.synopsis.trim()
    ? book.synopsis
    : 'Nenhuma sinopse cadastrada para esta obra ainda.';

  renderModalVisitorArea();
  renderModalComments(bookId);

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  refreshIcons();
};

window.closeBookModal = function () {
  const modal = document.getElementById('book-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
  activeModalBookId = null;
};

function renderModalVisitorArea() {
  const visitor = getVisitor();
  const loginForm = document.getElementById('visitor-quick-login-form');
  const commentForm = document.getElementById('visitor-comment-form');

  if (visitor && visitor.name) {
    loginForm.classList.add('hidden');
    commentForm.classList.remove('hidden');
    const handleText = visitor.handle ? ` (${visitor.handle})` : '';
    document.getElementById('visitor-current-label').textContent = `${visitor.name}${handleText}`;
  } else {
    commentForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  }
}

window.handleVisitorLogin = function (event) {
  event.preventDefault();
  const name = document.getElementById('visitor-name-input').value.trim();
  let handle = document.getElementById('visitor-handle-input').value.trim();
  if (!name) return;

  if (handle && !handle.startsWith('@')) {
    handle = `@${handle}`;
  }

  setVisitor({ name, handle });
  renderModalVisitorArea();
  showToast(`Bem-vindo(a), ${name}! Comentários liberados.`, '⚡');
};

window.logoutVisitor = function () {
  setVisitor(null);
  renderModalVisitorArea();
};

function findDuplicateBookInAccount(booksList = [], srcBook = {}) {
  const targetIsbn = cleanIsbn(srcBook.isbn);
  const targetTitle = normalizeSearchText(srcBook.title);
  const targetAuthor = normalizeSearchText(srcBook.author);
  return (Array.isArray(booksList) ? booksList : []).find((b) => {
    if (targetIsbn && cleanIsbn(b.isbn) === targetIsbn) return true;
    return targetTitle && normalizeSearchText(b.title) === targetTitle && normalizeSearchText(b.author) === targetAuthor;
  }) || null;
}

function updateModalCopyBookButton(book) {
  const copyBtn = document.getElementById('modal-book-copy-btn');
  if (!copyBtn || !book) return;

  const viewedSlug = getCleanUsername();
  const isOwnShelf = Boolean(authSession?.userId && normalizeUsername(authSession.username) === viewedSlug);
  if (isOwnShelf) {
    copyBtn.classList.add('hidden');
    return;
  }

  const ownAcc = authSession?.userId ? findLocalAccountById(authSession.userId) : null;
  const alreadyHas = ownAcc ? Boolean(findDuplicateBookInAccount(ownAcc.books, book)) : false;

  copyBtn.classList.remove('hidden');
  copyBtn.disabled = alreadyHas;
  if (alreadyHas) {
    copyBtn.className = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold text-sm w-full sm:w-auto cursor-default';
    copyBtn.innerHTML = '<span>✓</span><span>Já está na sua estante</span>';
  } else {
    copyBtn.className = 'inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-stone-100 hover:bg-amber-100 dark:bg-stone-800 dark:hover:bg-amber-950/60 text-stone-800 dark:text-stone-100 border border-stone-200 dark:border-stone-700 font-semibold text-sm transition w-full sm:w-auto';
    copyBtn.innerHTML = '<span>➕</span><span>Quero Ler na Minha Estante</span>';
  }
}

async function addBookToOwnWishlist(srcBook) {
  if (!authSession?.userId || !srcBook) return null;
  const ownAcc = findLocalAccountById(authSession.userId);
  if (!ownAcc) return null;

  const existing = findDuplicateBookInAccount(ownAcc.books, srcBook);
  if (existing) {
    return { book: existing, created: false };
  }

  const copiedBook = sanitizeBook({
    id: generateId('book'),
    title: srcBook.title,
    author: srcBook.author,
    coverUrl: srcBook.coverUrl || srcBook.thumbnail || '',
    shelf: 'wishlist',
    rating: 0,
    progress: 0,
    synopsis: srcBook.synopsis || srcBook.description || '',
    review: '',
    isbn: srcBook.isbn || '',
    createdAt: new Date().toISOString()
  });

  if (!Array.isArray(ownAcc.books)) ownAcc.books = [];
  ownAcc.books.unshift(copiedBook);

  if (normalizeUsername(appState.profile?.username) === normalizeUsername(ownAcc.profile?.username)) {
    appState.books.unshift(copiedBook);
  }
  saveState();
  await syncBookInBackground(copiedBook, ownAcc.userId);
  return { book: copiedBook, created: true };
}

async function applyPendingBookCopyAfterAuth() {
  if (!pendingBookToImport || !pendingBookToImport.directCopyWishlist || !authSession?.userId) {
    return false;
  }
  const srcBook = pendingBookToImport;
  pendingBookToImport = null;
  const result = await addBookToOwnWishlist(srcBook);
  if (result?.created) {
    showToast(`"${result.book.title}" salvo em Quero Ler na sua estante! 🎯`, '✅');
  } else if (result?.book) {
    showToast(`"${result.book.title}" já estava na sua estante.`, 'ℹ️');
  }
  return true;
}

window.copyModalBookToMyShelf = async function () {
  const book = (appState.books || []).find((b) => b.id === activeModalBookId);
  if (!book) return;

  if (!authSession?.userId) {
    pendingBookToImport = {
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl || '',
      synopsis: book.synopsis || '',
      isbn: book.isbn || '',
      directCopyWishlist: true
    };
    pendingAdminAfterAuth = false;
    closeBookModal();
    openAuthModal('login');
    showToast('Entre ou crie sua conta para salvar este livro em "Quero Ler".', '🔐');
    return;
  }

  const result = await addBookToOwnWishlist(book);
  if (result) {
    updateModalCopyBookButton(book);
    renderPublicProfilesDirectory();
    if (result.created) {
      showToast(`"${book.title}" adicionado à sua lista Quero Ler! 🎯`, '✅');
    } else {
      showToast(`"${book.title}" já está na sua estante!`, 'ℹ️');
    }
  }
};

function getVisitorOwnedCommentIds() {
  try {
    const raw = localStorage.getItem(VISITOR_COMMENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function addVisitorOwnedCommentId(commentId) {
  if (!commentId) return;
  try {
    const list = getVisitorOwnedCommentIds();
    if (!list.includes(commentId)) {
      list.push(commentId);
      localStorage.setItem(VISITOR_COMMENTS_KEY, JSON.stringify(list.slice(-100)));
    }
  } catch (_) {}
}

function canDeleteComment(comment) {
  if (!comment || !comment.id) return false;
  const isShelfOwner = Boolean(authSession?.userId && normalizeUsername(authSession.username) === getCleanUsername());
  if (isShelfOwner) return true;
  if (comment.authorUserId && authSession?.userId && comment.authorUserId === authSession.userId) return true;
  return getVisitorOwnedCommentIds().includes(comment.id);
}

window.handleDeleteComment = async function (commentId) {
  const target = (appState.comments || []).find((c) => c.id === commentId);
  if (!target || !canDeleteComment(target)) {
    showToast('Você só pode excluir comentários na sua própria estante.', '🔒');
    return;
  }
  if (!window.confirm('Excluir este comentário permanentemente?')) return;

  appState.comments = (appState.comments || []).filter((c) => c.id !== commentId);
  saveState();
  if (activeModalBookId) {
    renderModalComments(activeModalBookId);
  }
  renderPublicShelf();
  showToast('Comentário excluído.', '🗑️');
  await deleteCommentInBackground(commentId);
};

window.handleAddComment = async function (event) {
  event.preventDefault();
  if (!activeModalBookId) return;
  const visitor = getVisitor();
  if (!visitor) {
    renderModalVisitorArea();
    return;
  }

  const text = document.getElementById('comment-text-input').value.trim();
  const rating = Number(document.getElementById('comment-rating-input').value) || 0;
  if (!text) return;

  const newComment = {
    id: generateId('cmt'),
    bookId: activeModalBookId,
    authorName: visitor.name,
    authorHandle: visitor.handle || '',
    authorUserId: authSession?.userId || '',
    text,
    rating,
    createdAt: new Date().toISOString()
  };

  addVisitorOwnedCommentId(newComment.id);
  appState.comments.unshift(newComment);
  saveState();

  document.getElementById('comment-text-input').value = '';
  document.getElementById('comment-rating-input').value = '0';

  renderModalComments(activeModalBookId);
  renderPublicShelf();
  showToast('Comentário publicado na estante!', '💬');

  await syncCommentInBackground(newComment);
};

function renderModalComments(bookId) {
  const comments = (appState.comments || []).filter((c) => c.bookId === bookId);
  document.getElementById('modal-comments-count').textContent = comments.length;
  const listEl = document.getElementById('modal-comments-list');

  if (comments.length === 0) {
    listEl.innerHTML = '<p class="text-xs text-stone-400 italic py-2">Seja o primeiro leitor a deixar um comentário sobre esta obra!</p>';
    return;
  }

  listEl.innerHTML = comments.map((c) => {
    const deletable = canDeleteComment(c);
    return `
      <div class="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-800 space-y-1.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="font-bold text-xs sm:text-sm text-stone-900 dark:text-white">${escapeHtml(c.authorName)}</span>
            ${c.authorHandle ? `<span class="text-xs text-amber-700 dark:text-amber-400 font-medium">${escapeHtml(c.authorHandle)}</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            ${Number(c.rating) > 0 ? renderStars(c.rating, 'w-3 h-3') : ''}
            <span class="text-[11px] text-stone-400">${escapeHtml(formatRelativeDate(c.createdAt))}</span>
            ${deletable ? `
              <button type="button" onclick="handleDeleteComment('${escapeHtml(c.id)}')"
                title="Excluir comentário"
                class="ml-1 px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[10px] font-semibold transition">
                🗑️ Excluir
              </button>
            ` : ''}
          </div>
        </div>
        <p class="text-xs sm:text-sm text-stone-700 dark:text-stone-200 leading-relaxed">${escapeHtml(c.text)}</p>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   MODAL DE QR CODE & COMPARTILHAMENTO
   ========================================================================== */
window.openQrModal = function () {
  const modal = document.getElementById('qr-modal');
  const cleanUser = getCleanUsername();
  const titleEl = document.getElementById('qr-modal-title');
  if (titleEl) {
    titleEl.textContent = `Compartilhar Estante (@${cleanUser})`;
  }
  const shareUrl = getShareUrl();
  document.getElementById('share-url-input').value = shareUrl;

  const qrContainer = document.getElementById('qr-code-container');
  qrContainer.innerHTML = '';

  if (typeof window.qrcode === 'function') {
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(shareUrl);
      qr.make();
      qrContainer.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      const svg = qrContainer.querySelector('svg');
      if (svg) {
        svg.setAttribute('class', 'w-full h-full');
      }
    } catch (_) {
      renderQrFallback(qrContainer, shareUrl);
    }
  } else {
    renderQrFallback(qrContainer, shareUrl);
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('overflow-hidden');
  refreshIcons();
};

function renderQrFallback(container, url) {
  container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}" alt="QR Code da Estante" class="w-full h-full object-contain rounded-lg" />`;
}

window.closeQrModal = function () {
  const modal = document.getElementById('qr-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
};

window.copyShareUrl = async function () {
  const val = document.getElementById('share-url-input').value;
  try {
    await navigator.clipboard.writeText(val);
    showToast('Link da sua estante copiado!', '🔗');
  } catch (_) {
    document.getElementById('share-url-input').select();
    document.execCommand('copy');
    showToast('Link copiado!', '🔗');
  }
};

window.downloadQrSvg = function () {
  const svg = document.querySelector('#qr-code-container svg');
  if (!svg) {
    showToast('QR Code SVG disponível apenas quando gerado localmente no navegador.', 'ℹ️');
    return;
  }
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qrcode-estante-${getCleanUsername()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('QR Code baixado em SVG!', '📱');
};

window.handleBackdropClick = function (event, modalId) {
  if (event.target && event.target.id === modalId) {
    if (modalId === 'book-modal') closeBookModal();
    if (modalId === 'qr-modal') closeQrModal();
    if (modalId === 'auth-modal') closeAuthModal();
  }
};

/* ==========================================================================
   PAINEL ADMIN — SUB-ABA 1: BUSCA MULTI-FONTE (AMAZON / APPLE BR / GOOGLE / OL) & FORMULÁRIO
   ========================================================================== */
let adminSearchSeq = 0;
let platformExternalSearchSeq = 0;
let formCoverLookupSeq = 0;

async function searchAppleBooksBR(query) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return [];
  const endpoint = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&media=ebook&entity=ebook&country=br&limit=10`;
  const data = await fetchJsonWithTimeout(endpoint, 6000);
  const items = Array.isArray(data.results) ? data.results : [];

  return items.map((item) => {
    const rawArt = safeUrl(item.artworkUrl100 || item.artworkUrl60 || '', '');
    const hdArt = rawArt ? rawArt.replace(/\d+x\d+bb/i, '600x900bb') : '';
    const sqArt = rawArt ? rawArt.replace(/\d+x\d+bb/i, '600x600bb') : '';
    const candidates = [hdArt, sqArt, rawArt].filter(Boolean);

    return {
      title: item.trackName || 'Sem título',
      author: item.artistName || 'Autor desconhecido',
      description: stripHtmlTags(item.description || ''),
      thumbnail: hdArt || sqArt || rawArt,
      coverCandidates: candidates,
      isbn: '',
      asin: '',
      publishedDate: item.releaseDate ? String(item.releaseDate).slice(0, 10) : '',
      source: 'Amazon / Apple Books BR'
    };
  });
}

async function fetchGoodreadsAmazonCoverByIsbn(isbn) {
  if (goodreadsConsecutiveFailures >= 2) return '';
  const clean = cleanIsbn(isbn);
  const isbn13 = clean.length === 10 ? isbn10ToIsbn13(clean) : clean;
  if (!isbn13 || isbn13.length !== 13) return '';

  const cacheKey = `isbn:${isbn13}`;
  if (goodreadsCoverCache.has(cacheKey)) {
    return goodreadsCoverCache.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const data = await fetchJsonWithTimeout(
        `https://bookcover.longitood.com/bookcover?isbn=${encodeURIComponent(isbn13)}`,
        1800
      );
      const url = normalizeCoverCandidateUrl(data?.url || '');
      if (url) goodreadsConsecutiveFailures = 0;
      return url;
    } catch (_) {
      goodreadsConsecutiveFailures++;
      return '';
    }
  })();

  goodreadsCoverCache.set(cacheKey, promise);
  return promise;
}

async function fetchGoodreadsAmazonCoverByTitle(title, author) {
  if (goodreadsConsecutiveFailures >= 2) return '';
  const cleanTitle = String(title || '').trim();
  const cleanAuthor = String(author || '').trim();
  if (!cleanTitle || cleanTitle === 'Sem título' || !cleanAuthor || cleanAuthor === 'Autor desconhecido') {
    return '';
  }

  const cacheKey = `title:${normalizeSearchText(cleanTitle)}::${normalizeSearchText(cleanAuthor)}`;
  if (goodreadsCoverCache.has(cacheKey)) {
    return goodreadsCoverCache.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const url = `https://bookcover.longitood.com/bookcover?book_title=${encodeURIComponent(cleanTitle)}&author_name=${encodeURIComponent(cleanAuthor)}`;
      const data = await fetchJsonWithTimeout(url, 1800);
      const resolved = normalizeCoverCandidateUrl(data?.url || '');
      if (resolved) goodreadsConsecutiveFailures = 0;
      return resolved;
    } catch (_) {
      goodreadsConsecutiveFailures++;
      return '';
    }
  })();

  goodreadsCoverCache.set(cacheKey, promise);
  return promise;
}

async function fetchGoodreadsAmazonCover({ title = '', author = '', isbn = '' } = {}) {
  const byIsbn = await fetchGoodreadsAmazonCoverByIsbn(isbn);
  if (byIsbn) return byIsbn;
  return fetchGoodreadsAmazonCoverByTitle(title, author);
}

async function searchBrasilApiIsbn(isbn) {
  const clean = cleanIsbn(isbn);
  if (!clean) return [];
  const data = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/isbn/v1/${encodeURIComponent(clean)}`, 5500);
  if (!data || !data.title) return [];

  const title = [data.title, data.subtitle].filter(Boolean).join(': ').trim() || 'Sem título';
  const author = Array.isArray(data.authors) && data.authors.length ? data.authors.join(', ') : 'Autor desconhecido';
  const resolvedIsbn = cleanIsbn(data.isbn) || clean;
  const asin = isbn13ToIsbn10(resolvedIsbn);
  const directCover = normalizeCoverCandidateUrl(data.cover_url || '');
  const olFallback = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(resolvedIsbn)}-L.jpg?default=false`;
  const candidates = [
    ...buildAmazonDirectCoverCandidates(asin || resolvedIsbn),
    directCover,
    olFallback
  ].filter(Boolean);

  return [{
    title,
    author,
    description: stripHtmlTags(data.synopsis || ''),
    thumbnail: directCover || candidates[0] || '',
    coverCandidates: candidates,
    isbn: resolvedIsbn,
    asin,
    publishedDate: data.year ? String(data.year) : '',
    source: 'BrasilAPI / ISBN'
  }];
}

function parseGoogleBookItems(items = []) {
  return items.map((item) => {
    const info = item.volumeInfo || {};
    const imageLinks = info.imageLinks || {};
    const rawThumb = imageLinks.thumbnail || imageLinks.smallThumbnail || '';
    const thumb = normalizeCoverCandidateUrl(rawThumb);
    const highResVariants = [
      normalizeCoverCandidateUrl(imageLinks.extraLarge || ''),
      normalizeCoverCandidateUrl(imageLinks.large || ''),
      normalizeCoverCandidateUrl(imageLinks.medium || ''),
      thumb && /([?&])zoom=\d+/i.test(thumb) ? thumb.replace(/([?&])zoom=\d+/i, '$1zoom=2') : '',
      thumb
    ].filter(Boolean);

    const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
    const isbn13 = identifiers.find((id) => id.type === 'ISBN_13');
    const isbn10 = identifiers.find((id) => id.type === 'ISBN_10');
    const isbn = cleanIsbn((isbn13 || isbn10 || {}).identifier || '');
    const asin = (isbn10 && cleanIsbn(isbn10.identifier)) || isbn13ToIsbn10(isbn);
    const olFallback = isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false` : '';

    const coverCandidates = [
      ...buildAmazonDirectCoverCandidates(asin || isbn),
      ...highResVariants,
      olFallback
    ].filter(Boolean);

    return {
      title: info.title || 'Sem título',
      author: Array.isArray(info.authors) && info.authors.length ? info.authors.join(', ') : 'Autor desconhecido',
      description: stripHtmlTags(info.description || ''),
      thumbnail: highResVariants[0] || thumb || olFallback || '',
      coverCandidates,
      isbn,
      asin,
      publishedDate: info.publishedDate || '',
      source: 'Google Books'
    };
  });
}

async function searchGoogleBooks(query) {
  const raw = String(query || '').trim();
  if (!raw) return [];

  const isbnQuery = raw.replace(/^isbn:/i, '');
  const detectedIsbn = cleanIsbn(isbnQuery);

  if (detectedIsbn) {
    const endpoint = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(detectedIsbn)}&maxResults=8`;
    const data = await fetchJsonWithTimeout(endpoint, 6000);
    return parseGoogleBookItems(Array.isArray(data.items) ? data.items : []);
  }

  const ptEndpoint = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(raw)}&langRestrict=pt&maxResults=8`;
  const allEndpoint = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(raw)}&maxResults=8`;
  const [ptRes, allRes] = await Promise.allSettled([
    fetchJsonWithTimeout(ptEndpoint, 6000),
    fetchJsonWithTimeout(allEndpoint, 6000)
  ]);

  if (ptRes.status === 'rejected' && allRes.status === 'rejected') {
    throw ptRes.reason || allRes.reason;
  }

  const ptItems = ptRes.status === 'fulfilled' && Array.isArray(ptRes.value?.items) ? parseGoogleBookItems(ptRes.value.items) : [];
  const allItems = allRes.status === 'fulfilled' && Array.isArray(allRes.value?.items) ? parseGoogleBookItems(allRes.value.items) : [];
  return mergeUniqueBookResults(ptItems, allItems, 10);
}

async function searchOpenLibrary(query) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return [];
  const endpoint = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanQ)}&limit=8&fields=key,title,author_name,first_publish_year,isbn,cover_i,first_sentence,id_amazon`;
  const data = await fetchJsonWithTimeout(endpoint, 6500);
  const docs = Array.isArray(data.docs) ? data.docs : [];

  return docs.map((doc) => {
    const isbnList = Array.isArray(doc.isbn) ? doc.isbn.map((i) => cleanIsbn(i)).filter(Boolean) : [];
    const isbn13 = isbnList.find((i) => i.length === 13 && i.startsWith('978')) || isbnList.find((i) => i.length === 13) || '';
    const isbn = isbn13 || isbnList[0] || '';
    const amazonIds = Array.isArray(doc.id_amazon) ? doc.id_amazon.map((a) => String(a || '').trim().toUpperCase()).filter(Boolean) : [];
    const asin = amazonIds[0] || isbn13ToIsbn10(isbn);

    const olById = doc.cover_i ? `https://covers.openlibrary.org/b/id/${encodeURIComponent(doc.cover_i)}-L.jpg?default=false` : '';
    const olByIsbn = isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false` : '';

    const coverCandidates = [
      ...buildAmazonDirectCoverCandidates(asin || isbn),
      olById,
      olByIsbn
    ].filter(Boolean);

    let description = '';
    if (typeof doc.first_sentence === 'string') {
      description = doc.first_sentence;
    } else if (Array.isArray(doc.first_sentence) && doc.first_sentence.length) {
      description = String(doc.first_sentence[0]);
    } else if (doc.first_sentence && typeof doc.first_sentence === 'object' && doc.first_sentence.value) {
      description = String(doc.first_sentence.value);
    }

    return {
      title: doc.title || 'Sem título',
      author: Array.isArray(doc.author_name) && doc.author_name.length ? doc.author_name.join(', ') : 'Autor desconhecido',
      description: stripHtmlTags(description),
      thumbnail: olById || olByIsbn || coverCandidates[0] || '',
      coverCandidates,
      isbn,
      asin,
      publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
      source: 'Open Library'
    };
  });
}

function getBookMatchSignature(book) {
  const baseTitle = normalizeSearchText(book?.title || '')
    .split(/[:(\[]/)[0]
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const firstAuthor = normalizeSearchText(book?.author || '').split(',')[0].trim();
  const authorParts = firstAuthor.split(/\s+/).filter(Boolean);
  const lastSurname = authorParts[authorParts.length - 1] || '';
  return { baseTitle, lastSurname };
}

function mergeUniqueBookResults(primary, secondary, limit = 8) {
  const merged = [...primary];
  const seen = new Set(
    primary.map((b) => {
      const sig = getBookMatchSignature(b);
      return `${sig.baseTitle}::${sig.lastSurname}`;
    })
  );

  for (const item of secondary) {
    if (merged.length >= limit) break;
    const sig = getBookMatchSignature(item);
    const key = `${sig.baseTitle}::${sig.lastSurname}`;
    const duplicateIsbn = item.isbn && merged.some((m) => m.isbn && m.isbn === item.isbn);
    if (!seen.has(key) && !duplicateIsbn) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function mergeAndEnrichBookResults(sourceBuckets, parsedInput = {}, limit = 10) {
  const merged = [];

  const findExistingMatch = (item) => {
    const itemIsbn = cleanIsbn(item.isbn);
    const itemSig = getBookMatchSignature(item);
    return merged.find((existing) => {
      const exIsbn = cleanIsbn(existing.isbn);
      if (itemIsbn && exIsbn && itemIsbn === exIsbn) return true;
      const exSig = getBookMatchSignature(existing);
      if (!itemSig.baseTitle || !exSig.baseTitle) return false;
      if (itemSig.baseTitle !== exSig.baseTitle) return false;
      if (!itemSig.lastSurname || !exSig.lastSurname || itemSig.lastSurname === 'desconhecido' || exSig.lastSurname === 'desconhecido') {
        return true;
      }
      return itemSig.lastSurname === exSig.lastSurname;
    });
  };

  for (const bucket of sourceBuckets) {
    for (const rawItem of bucket) {
      const item = {
        ...rawItem,
        isbn: cleanIsbn(rawItem.isbn),
        asin: rawItem.asin || (rawItem.isbn ? isbn13ToIsbn10(rawItem.isbn) : ''),
        coverCandidates: Array.isArray(rawItem.coverCandidates) ? [...rawItem.coverCandidates] : []
      };

      const existing = findExistingMatch(item);
      if (existing) {
        if (!existing.isbn && item.isbn) existing.isbn = item.isbn;
        if (!existing.asin && item.asin) existing.asin = item.asin;
        if ((!existing.author || existing.author === 'Autor desconhecido') && item.author && item.author !== 'Autor desconhecido') {
          existing.author = item.author;
        }
        if ((item.description || '').length > (existing.description || '').length) {
          existing.description = item.description;
        }
        if (!existing.publishedDate && item.publishedDate) {
          existing.publishedDate = item.publishedDate;
        }
        existing.coverCandidates = buildOrderedCoverCandidates({
          ...existing,
          coverCandidates: [...existing.coverCandidates, ...item.coverCandidates, item.thumbnail]
        });
        if (item.source && !existing.source.includes(item.source)) {
          existing.source = `${existing.source} + ${item.source}`;
        }
        if (!existing.thumbnail && item.thumbnail) {
          existing.thumbnail = item.thumbnail;
        }
      } else if (merged.length < limit) {
        item.coverCandidates = buildOrderedCoverCandidates(item);
        merged.push(item);
      }
    }
  }

  if (parsedInput.asin && merged[0]) {
    if (!merged[0].asin) merged[0].asin = parsedInput.asin;
    if (!merged[0].isbn && parsedInput.isbn13) merged[0].isbn = parsedInput.isbn13;
    merged[0].coverCandidates = buildOrderedCoverCandidates(merged[0]);
  }

  return merged;
}

async function searchBooksMultiSource(rawQuery) {
  const parsed = parseAmazonInput(rawQuery);
  const effectiveIsbn = parsed.isbn13 || parsed.isbn10 || '';
  const effectiveText = parsed.slugQuery || (!parsed.isAmazonUrl ? String(rawQuery || '').trim() : '');

  if (parsed.isAmazonUrl && !parsed.asin && !effectiveIsbn && !effectiveText) {
    return { books: [], parsed, allFailed: false };
  }

  const googleQuery = effectiveIsbn ? `isbn:${effectiveIsbn}` : effectiveText;
  const openLibQuery = effectiveIsbn || effectiveText;
  const appleQuery = effectiveText || effectiveIsbn;

  const [brRes, appleRes, googleRes, olRes] = await Promise.allSettled([
    effectiveIsbn ? searchBrasilApiIsbn(effectiveIsbn) : Promise.resolve([]),
    appleQuery ? searchAppleBooksBR(appleQuery) : Promise.resolve([]),
    googleQuery ? searchGoogleBooks(googleQuery) : Promise.resolve([]),
    openLibQuery ? searchOpenLibrary(openLibQuery) : Promise.resolve([])
  ]);

  const brBooks = brRes.status === 'fulfilled' ? brRes.value : [];
  let appleBooks = appleRes.status === 'fulfilled' ? appleRes.value : [];
  let googleBooks = googleRes.status === 'fulfilled' ? googleRes.value : [];
  const olBooks = olRes.status === 'fulfilled' ? olRes.value : [];

  // Se pesquisou apenas por ISBN e Google não trouxe nada, tenta pelo texto extraído ou título da BrasilAPI/OL
  const discoveredBook = brBooks[0] || googleBooks[0] || olBooks[0];
  if (effectiveIsbn && appleBooks.length === 0 && discoveredBook && discoveredBook.title && discoveredBook.title !== 'Sem título') {
    const titleAuthorQ = [
      discoveredBook.title,
      discoveredBook.author && discoveredBook.author !== 'Autor desconhecido' ? discoveredBook.author : ''
    ].filter(Boolean).join(' ');
    if (titleAuthorQ) {
      const [extraApple, extraGoogle] = await Promise.allSettled([
        searchAppleBooksBR(titleAuthorQ),
        googleBooks.length === 0 ? searchGoogleBooks(titleAuthorQ) : Promise.resolve(googleBooks)
      ]);
      if (extraApple.status === 'fulfilled') appleBooks = extraApple.value;
      if (extraGoogle.status === 'fulfilled' && googleBooks.length === 0) googleBooks = extraGoogle.value;
    }
  }

  let books = mergeAndEnrichBookResults([brBooks, appleBooks, googleBooks, olBooks], parsed, 10);

  // Caso o usuário tenha colado um ASIN Kindle sem slug de título e os catálogos não retornaram, tenta capa direta da Amazon
  if (books.length === 0 && parsed.asin) {
    const directCandidates = buildAmazonDirectCoverCandidates(parsed.asin);
    let foundDirect = '';
    for (const candidate of directCandidates) {
      const ok = await probeImageUrl(candidate);
      if (ok) {
        foundDirect = ok;
        break;
      }
    }
    if (foundDirect) {
      books = [{
        title: effectiveText || `Livro Amazon (${parsed.asin})`,
        author: 'Autor desconhecido',
        description: '',
        thumbnail: foundDirect,
        coverCandidates: [foundDirect, ...directCandidates],
        isbn: effectiveIsbn,
        asin: parsed.asin,
        publishedDate: '',
        source: 'Amazon CDN'
      }];
    }
  }

  const allFailed = [brRes, appleRes, googleRes, olRes].every((r) => r.status === 'rejected');
  return { books, parsed, allFailed };
}

async function resolveBestCoversForResults(books, onCoverUpdated) {
  if (!Array.isArray(books) || books.length === 0) return;

  const concurrency = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < books.length) {
      const idx = cursor++;
      const book = books[idx];
      if (!book) continue;
      try {
        const resolvedUrl = await resolveBestCoverForBook({
          title: book.title,
          author: book.author,
          isbn: book.isbn || '',
          asin: book.asin || '',
          coverCandidates: book.coverCandidates || [],
          thumbnail: book.thumbnail || ''
        });
        if (resolvedUrl) {
          onCoverUpdated(idx, resolvedUrl);
        }
      } catch (_) {}
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, books.length) }, () => worker()));
}

window.handleGoogleBooksSearch = async function (event) {
  event.preventDefault();
  const query = document.getElementById('google-books-query').value.trim();
  if (!query) return;

  const mySeq = ++adminSearchSeq;
  const statusEl = document.getElementById('google-books-status');
  const resultsEl = document.getElementById('google-books-results');
  const btn = document.getElementById('btn-google-search');

  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Buscando obras e capas na Amazon, Apple Books BR, Google Books e Open Library...';
  resultsEl.innerHTML = '';
  btn.disabled = true;

  try {
    const { books, parsed, allFailed } = await searchBooksMultiSource(query);
    if (mySeq !== adminSearchSeq) return;

    lastBookSearchResults = books;

    if (books.length === 0) {
      if (parsed.isAmazonUrl && !parsed.asin && !parsed.slugQuery) {
        statusEl.textContent = 'Link encurtado da Amazon sem ASIN visível. Cole o link completo (amazon.com.br/.../dp/...) ou busque pelo título/ISBN.';
      } else if (allFailed) {
        statusEl.textContent = 'Não foi possível consultar os catálogos externos no momento. Preencha os campos manualmente abaixo.';
      } else {
        statusEl.textContent = 'Nenhum livro encontrado nas bases consultadas. Tente outro termo ou preencha os campos manualmente abaixo.';
      }
      return;
    }

    statusEl.textContent = `${books.length} resultados encontrados. Verificando melhores capas da Amazon... Clique em "Usar este livro" para preencher abaixo:`;
    resultsEl.innerHTML = books.map((book, idx) => {
      const thumb = safeUrl(book.thumbnail, '') || buildFallbackCoverDataUri(book.title, book.author);
      const amazonHref = buildAmazonUrl(book);
      const isAmazonOrApple = /Amazon|Apple|BrasilAPI/i.test(book.source || '');
      const sourceBadgeClass = isAmazonOrApple
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';

      return `
        <div class="flex gap-3.5 p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200/80 dark:border-stone-700/80 items-start">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(book.title)}"
            ${renderBookCoverImgAttrs(book, `search-result-cover-${idx}`)}
            class="w-16 h-24 rounded-lg object-cover shadow-sm shrink-0 bg-stone-200 dark:bg-stone-700" />
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-bold text-sm text-stone-900 dark:text-white line-clamp-2 leading-snug">${escapeHtml(book.title)}</h4>
              <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceBadgeClass}">${escapeHtml(book.source || 'Catálogo')}</span>
            </div>
            <p class="text-xs text-stone-500 dark:text-stone-400 truncate">
              ${escapeHtml(book.author)}${book.publishedDate ? ` • ${escapeHtml(String(book.publishedDate).slice(0, 4))}` : ''}${book.isbn ? ` • ISBN ${escapeHtml(book.isbn)}` : ''}
            </p>
            <p class="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2">${escapeHtml(book.description || 'Sem sinopse na base.')}</p>
            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <button type="button" onclick="selectGoogleBook(${idx})"
                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition">
                <span>Usar este livro</span>
              </button>
              <a href="${escapeHtml(amazonHref)}" target="_blank" rel="noopener noreferrer"
                class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-xs font-semibold transition">
                <span>Ver na Amazon</span>
              </a>
            </div>
          </div>
        </div>
      `;
    }).join('');

    void resolveBestCoversForResults(books, (idx, resolvedUrl) => {
      if (mySeq !== adminSearchSeq || !lastBookSearchResults[idx] || !resolvedUrl) return;
      lastBookSearchResults[idx].thumbnail = resolvedUrl;
      const imgEl = document.getElementById(`search-result-cover-${idx}`);
      if (imgEl) {
        imgEl.dataset.fallbackApplied = '1';
        imgEl.dataset.healingApplied = '1';
        imgEl.src = resolvedUrl;
      }
    }).then(() => {
      if (mySeq === adminSearchSeq && statusEl && lastBookSearchResults.length > 0) {
        statusEl.textContent = `${lastBookSearchResults.length} resultados encontrados. Clique em "Usar este livro" para preencher o formulário abaixo:`;
      }
    });
  } catch (err) {
    if (mySeq === adminSearchSeq) {
      statusEl.textContent = `Não foi possível consultar as bases de livros (${err.message}). Você pode preencher os campos manualmente abaixo.`;
    }
  } finally {
    if (mySeq === adminSearchSeq) {
      btn.disabled = false;
    }
  }
};

function fillBookFormFromResult(picked) {
  if (!picked) return;
  const seq = ++formCoverLookupSeq;
  document.getElementById('book-title').value = picked.title || '';
  document.getElementById('book-author').value = picked.author || '';
  document.getElementById('book-cover').value = picked.thumbnail || '';
  document.getElementById('book-synopsis').value = picked.description || '';
  document.getElementById('book-isbn').value = picked.isbn || '';
  updateCoverPreview(picked.thumbnail || '');
  renderFormCoverGallery([], '');

  const rawCandidates = (Array.isArray(picked.coverCandidates) ? picked.coverCandidates : [])
    .filter((u) => u && !u.startsWith('data:image/'))
    .slice(0, 8);

  if (rawCandidates.length > 0) {
    void Promise.all(rawCandidates.map((u) => probeImageUrl(u))).then((probed) => {
      if (seq !== formCoverLookupSeq) return;
      const validEntries = [];
      const seen = new Set();
      for (const validUrl of probed) {
        if (validUrl && !seen.has(validUrl)) {
          seen.add(validUrl);
          validEntries.push({ url: validUrl, source: classifyCoverSource(validUrl) });
        }
      }
      if (validEntries.length > 1) {
        renderFormCoverGallery(validEntries, 'Outras capas verificadas para esta obra (clique para alternar):');
      }
    });
  }

  document.getElementById('book-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`Dados importados (${picked.source || 'Catálogo'})! Escolha a prateleira e salve.`, '📚');
}

window.selectGoogleBook = function (index) {
  fillBookFormFromResult(lastBookSearchResults[index]);
};

function renderFormCoverGallery(items = [], statusMessage = '', isError = false) {
  const galleryEl = document.getElementById('book-cover-gallery');
  if (!galleryEl) return;

  lastFormCoverGallery = Array.isArray(items) ? items : [];

  if (!statusMessage && lastFormCoverGallery.length === 0) {
    galleryEl.classList.add('hidden');
    galleryEl.innerHTML = '';
    return;
  }

  galleryEl.classList.remove('hidden');
  const currentCover = (document.getElementById('book-cover')?.value || '').trim();

  const headerHtml = statusMessage
    ? `<p class="text-[11px] font-semibold ${isError ? 'text-rose-600 dark:text-rose-400' : 'text-stone-600 dark:text-stone-300'}">${escapeHtml(statusMessage)}</p>`
    : '';

  const thumbsHtml = lastFormCoverGallery.length > 0
    ? `<div class="flex flex-wrap gap-2.5 pt-1">
        ${lastFormCoverGallery.map((entry, idx) => {
          const isSelected = currentCover === entry.url;
          return `
            <button type="button" onclick="selectFormCoverFromGallery(${idx})"
              class="group flex flex-col items-center gap-1 p-1.5 rounded-xl border transition text-center w-20 ${
                isSelected
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-400/40'
                  : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-amber-400'
              }">
              <img src="${escapeHtml(entry.url)}" alt="${escapeHtml(entry.source)}"
                class="w-14 h-20 object-cover rounded-lg bg-stone-200 dark:bg-stone-800 shadow-xs" />
              <span class="text-[10px] font-semibold text-stone-600 dark:text-stone-300 line-clamp-1 w-full">${escapeHtml(entry.source)}</span>
            </button>
          `;
        }).join('')}
      </div>`
    : '';

  galleryEl.innerHTML = headerHtml + thumbsHtml;
}

window.selectFormCoverFromGallery = function (index) {
  const entry = lastFormCoverGallery[index];
  if (!entry) return;
  document.getElementById('book-cover').value = entry.url;
  updateCoverPreview(entry.url);
  renderFormCoverGallery(lastFormCoverGallery, `Capa selecionada (${entry.source}). Clique em "Salvar na Estante" para confirmar.`);
  showToast(`Capa (${entry.source}) aplicada ao formulário!`, '🖼️');
};

window.handleBookCoverInput = async function (rawValue) {
  const value = String(rawValue || '').trim();
  const parsed = parseAmazonInput(value);

  if (!parsed.isAmazonUrl) {
    updateCoverPreview(value);
    return;
  }

  // Evita carregar página HTML da Amazon diretamente como <img>
  updateCoverPreview('');
  const seq = ++formCoverLookupSeq;
  renderFormCoverGallery([], '🔎 Link da Amazon detectado! Extraindo capa oficial e dados do livro...');

  try {
    const titleVal = document.getElementById('book-title').value.trim();
    const authorVal = document.getElementById('book-author').value.trim();
    const isbnVal = document.getElementById('book-isbn').value.trim();

    const { books } = await searchBooksMultiSource(value);
    if (seq !== formCoverLookupSeq) return;

    const first = books[0];
    if (first) {
      if (!titleVal && first.title && first.title !== 'Sem título') {
        document.getElementById('book-title').value = first.title;
      }
      if (!authorVal && first.author && first.author !== 'Autor desconhecido') {
        document.getElementById('book-author').value = first.author;
      }
      if (!document.getElementById('book-synopsis').value.trim() && first.description) {
        document.getElementById('book-synopsis').value = first.description;
      }
      if (!isbnVal && first.isbn) {
        document.getElementById('book-isbn').value = first.isbn;
      }
    }

    const gallery = await resolveCoverGalleryForBook({
      title: first?.title || titleVal || parsed.slugQuery,
      author: first?.author || authorVal,
      isbn: first?.isbn || parsed.isbn13 || parsed.isbn10 || isbnVal,
      asin: first?.asin || parsed.asin
    });
    if (seq !== formCoverLookupSeq) return;

    if (gallery.length > 0) {
      document.getElementById('book-cover').value = gallery[0].url;
      updateCoverPreview(gallery[0].url);
      renderFormCoverGallery(gallery, `${gallery.length} ${gallery.length === 1 ? 'capa encontrada' : 'capas encontradas'} para o link da Amazon. Clique para escolher:`);
      showToast('Capa extraída a partir do link da Amazon!', '🖼️');
    } else {
      renderFormCoverGallery([], 'Não foi possível extrair uma capa deste link da Amazon (links curtos como a.co não expõem o ASIN). Digite o título acima e clique em "Buscar Capas na Amazon".', true);
    }
  } catch (err) {
    if (seq === formCoverLookupSeq) {
      renderFormCoverGallery([], `Erro ao processar link da Amazon: ${err.message}`, true);
    }
  }
};

window.handleFetchCoverGalleryForForm = async function () {
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  const isbn = document.getElementById('book-isbn').value.trim();
  const coverField = document.getElementById('book-cover').value.trim();
  const parsed = parseAmazonInput(coverField);

  const effectiveTitle = title || parsed.slugQuery;
  const effectiveIsbn = isbn || parsed.isbn13 || parsed.isbn10;
  const effectiveAsin = parsed.asin;

  if (!effectiveTitle && !effectiveIsbn && !effectiveAsin) {
    showToast('Digite o título do livro, ISBN ou cole um link da Amazon primeiro.', 'ℹ️');
    return;
  }

  const seq = ++formCoverLookupSeq;
  const btn = document.getElementById('btn-fetch-amazon-covers');
  if (btn) btn.disabled = true;
  renderFormCoverGallery([], '🔎 Buscando capas na Amazon CDN, Apple Books BR, Google Books e Open Library...');

  try {
    const gallery = await resolveCoverGalleryForBook({
      title: effectiveTitle,
      author,
      isbn: effectiveIsbn,
      asin: effectiveAsin
    });
    if (seq !== formCoverLookupSeq) return;

    if (gallery.length === 0) {
      renderFormCoverGallery([], 'Nenhuma capa externa válida encontrada. Você pode colar manualmente uma URL direta de imagem (.jpg/.png).', true);
      return;
    }

    if (!coverField || parsed.isAmazonUrl) {
      document.getElementById('book-cover').value = gallery[0].url;
      updateCoverPreview(gallery[0].url);
    }

    renderFormCoverGallery(gallery, `${gallery.length} ${gallery.length === 1 ? 'capa verificada encontrada' : 'capas verificadas encontradas'}. Clique em uma miniatura para aplicar:`);
  } catch (err) {
    if (seq === formCoverLookupSeq) {
      renderFormCoverGallery([], `Falha ao buscar capas: ${err.message}`, true);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.updateCoverPreview = function (url) {
  const img = document.getElementById('book-cover-preview');
  const placeholder = document.getElementById('book-cover-placeholder');
  if (!img || !placeholder) return;

  const parsed = parseAmazonInput(url);
  if (parsed.isAmazonUrl) {
    img.src = '';
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
    return;
  }

  const clean = normalizeCoverCandidateUrl(url);
  if (clean) {
    img.referrerPolicy = 'no-referrer';
    img.onload = function () {
      if (!img.src.startsWith('data:image/') && (img.naturalWidth <= 20 || img.naturalHeight <= 20)) {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
      } else {
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
      }
    };
    img.onerror = function () {
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    };
    img.src = clean;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
    img.onload = null;
    img.onerror = null;
    img.src = '';
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }
};

window.toggleBookShelfFields = function () {
  const shelf = document.getElementById('book-shelf').value;
  const ratingWrap = document.getElementById('field-rating-wrapper');
  const progressWrap = document.getElementById('field-progress-wrapper');

  progressWrap.classList.toggle('hidden', shelf !== 'reading');
  ratingWrap.classList.toggle('opacity-50', shelf === 'wishlist');
};

window.resetBookForm = function () {
  formCoverLookupSeq++;
  document.getElementById('book-form').reset();
  document.getElementById('book-id').value = '';
  document.getElementById('book-isbn').value = '';
  document.getElementById('book-progress').value = 50;
  document.getElementById('book-progress-value').textContent = '50%';
  document.getElementById('book-form-heading').textContent = 'Adicionar Livro à Estante';
  document.getElementById('book-form-submit-label').textContent = 'Salvar na Estante';
  document.getElementById('btn-cancel-edit').classList.add('hidden');
  renderFormCoverGallery([], '');
  updateCoverPreview('');
  toggleBookShelfFields();
};

window.handleSaveBook = async function (event) {
  event.preventDefault();
  if (!authSession) {
    openAuthModal('login');
    return;
  }

  const id = document.getElementById('book-id').value.trim();
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  if (!title || !author) return;

  const shelf = document.getElementById('book-shelf').value;
  const bookObj = {
    id: id || generateId('book'),
    title,
    author,
    coverUrl: document.getElementById('book-cover').value.trim(),
    shelf,
    rating: shelf === 'wishlist' ? 0 : (Number(document.getElementById('book-rating').value) || 0),
    progress: shelf === 'reading' ? (Number(document.getElementById('book-progress').value) || 0) : (shelf === 'read' ? 100 : 0),
    synopsis: document.getElementById('book-synopsis').value.trim(),
    review: document.getElementById('book-review').value.trim(),
    isbn: document.getElementById('book-isbn').value.trim(),
    createdAt: new Date().toISOString()
  };

  if (id) {
    const idx = appState.books.findIndex((b) => b.id === id);
    if (idx !== -1) {
      bookObj.createdAt = appState.books[idx].createdAt || bookObj.createdAt;
      appState.books[idx] = bookObj;
    } else {
      appState.books.unshift(bookObj);
    }
  } else {
    appState.books.unshift(bookObj);
  }

  commitWorkingStateToOwnerAccount();
  resetBookForm();
  renderAll();
  showToast(id ? 'Livro atualizado na estante!' : 'Livro adicionado à estante!', '✅');

  await syncBookInBackground(bookObj);
};

/* ==========================================================================
   PAINEL ADMIN — SUB-ABA 2: GERENCIAR ACERVO
   ========================================================================== */
function renderAdminCatalog() {
  const books = appState.books || [];
  document.getElementById('admin-books-count').textContent = books.length;
  const listEl = document.getElementById('admin-catalog-list');

  if (books.length === 0) {
    listEl.innerHTML = '<p class="py-8 text-center text-sm text-stone-400">Seu acervo está vazio. Use a aba "Buscar Livros &amp; Adicionar" para cadastrar seu primeiro livro.</p>';
    return;
  }

  listEl.innerHTML = books.map((book) => {
    const coverSrc = safeUrl(book.coverUrl, '') || buildFallbackCoverDataUri(book.title, book.author);
    return `
      <div class="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5 min-w-0">
          <img src="${escapeHtml(coverSrc)}" alt="${escapeHtml(book.title)}"
            ${renderBookCoverImgAttrs(book)}
            class="w-12 h-18 aspect-[2/3] rounded-lg object-cover shadow-sm shrink-0 bg-stone-200 dark:bg-stone-800" />
          <div class="min-w-0">
            <h4 class="font-bold text-sm sm:text-base text-stone-900 dark:text-white truncate">${escapeHtml(book.title)}</h4>
            <p class="text-xs text-stone-500 dark:text-stone-400 truncate">${escapeHtml(book.author)}</p>
            <div class="mt-1 flex items-center gap-2">
              ${Number(book.rating) > 0 ? renderStars(book.rating, 'w-3 h-3') : ''}
              <span class="text-[11px] text-stone-400">${getCommentsCountForBook(book.id)} comentários</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <select aria-label="Alterar prateleira de ${escapeHtml(book.title)}"
            onchange="quickChangeShelf('${escapeHtml(book.id)}', this.value)"
            class="px-2.5 py-1.5 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-xs font-semibold">
            <option value="reading" ${book.shelf === 'reading' ? 'selected' : ''}>📖 Lendo Agora</option>
            <option value="read" ${book.shelf === 'read' ? 'selected' : ''}>⭐ Já Lidos</option>
            <option value="wishlist" ${book.shelf === 'wishlist' ? 'selected' : ''}>🎯 Quero Ler</option>
          </select>

          <button type="button" onclick="editBook('${escapeHtml(book.id)}')"
            class="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-semibold transition">
            Editar
          </button>
          <button type="button" onclick="deleteBook('${escapeHtml(book.id)}')"
            class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold transition">
            Excluir
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.quickChangeShelf = async function (bookId, newShelf) {
  const book = appState.books.find((b) => b.id === bookId);
  if (!book) return;
  book.shelf = newShelf;
  if (newShelf === 'read' && !book.rating) book.rating = 5;
  if (newShelf === 'read') book.progress = 100;
  commitWorkingStateToOwnerAccount();
  renderAll();
  showToast(`"${book.title}" movido para ${getShelfMeta(newShelf).label}.`, '📚');
  await syncBookInBackground(book);
};

window.editBook = function (bookId) {
  const book = appState.books.find((b) => b.id === bookId);
  if (!book) return;

  switchAdminTab('add');
  document.getElementById('book-id').value = book.id;
  document.getElementById('book-isbn').value = book.isbn || '';
  document.getElementById('book-title').value = book.title || '';
  document.getElementById('book-author').value = book.author || '';
  document.getElementById('book-cover').value = book.coverUrl || '';
  document.getElementById('book-shelf').value = book.shelf || 'read';
  document.getElementById('book-rating').value = String(book.rating ?? 5);
  document.getElementById('book-progress').value = String(book.progress ?? 50);
  document.getElementById('book-progress-value').textContent = `${book.progress ?? 50}%`;
  document.getElementById('book-synopsis').value = book.synopsis || '';
  document.getElementById('book-review').value = book.review || '';

  document.getElementById('book-form-heading').textContent = `Editando: ${book.title}`;
  document.getElementById('book-form-submit-label').textContent = 'Atualizar Livro';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');

  formCoverLookupSeq++;
  renderFormCoverGallery([], '');
  updateCoverPreview(book.coverUrl || '');
  toggleBookShelfFields();
  document.getElementById('book-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteBook = async function (bookId) {
  const book = appState.books.find((b) => b.id === bookId);
  if (!book) return;
  if (!window.confirm(`Remover "${book.title}" da sua estante?`)) return;

  appState.books = appState.books.filter((b) => b.id !== bookId);
  appState.comments = appState.comments.filter((c) => c.bookId !== bookId);
  commitWorkingStateToOwnerAccount();
  renderAll();
  showToast('Livro removido da estante.', '🗑️');
  await deleteBookInBackground(bookId);
};

/* ==========================================================================
   PAINEL ADMIN — SUB-ABA 3: PERFIL & CLUBES
   ========================================================================== */
function populateAdminProfileForm() {
  const p = appState.profile;
  document.getElementById('cfg-name').value = p.name || '';
  document.getElementById('cfg-username').value = getCleanUsername();
  document.getElementById('cfg-bio').value = p.bio || '';
  document.getElementById('cfg-avatar').value = p.avatarUrl || '';
  document.getElementById('cfg-instagram').value = p.instagramUrl || '';
  updateProfileAvatarPreview(p.avatarUrl || '');
}

window.updateProfileAvatarPreview = function (url) {
  const img = document.getElementById('cfg-avatar-preview');
  if (!img) return;
  const cleanUrl = safeUrl(url, '');
  const displayName = document.getElementById('cfg-name')?.value || appState?.profile?.name || 'Perfil';
  img.dataset.fallbackApplied = '';
  img.onerror = function () {
    handleAvatarError(this, displayName);
  };
  if (cleanUrl) {
    img.src = cleanUrl;
  } else {
    handleAvatarError(img, displayName);
  }
};

window.handleAvatarFileUpload = function (event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!String(file.type || '').startsWith('image/')) {
    showToast('Escolha um arquivo de imagem válido (JPG, PNG ou WebP).', '⚠️');
    return;
  }

  const reader = new FileReader();
  reader.onload = function (loadEvt) {
    const dataSrc = String(loadEvt?.target?.result || '');
    if (!dataSrc) return;
    const tempImg = new Image();
    tempImg.onload = function () {
      try {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const minSide = Math.min(tempImg.width, tempImg.height) || 1;
        const sx = (tempImg.width - minSide) / 2;
        const sy = (tempImg.height - minSide) / 2;
        ctx.drawImage(tempImg, sx, sy, minSide, minSide, 0, 0, size, size);
        const compressedUri = canvas.toDataURL('image/jpeg', 0.82);
        const cfgAvatar = document.getElementById('cfg-avatar');
        if (cfgAvatar) cfgAvatar.value = compressedUri;
        updateProfileAvatarPreview(compressedUri);
        showToast('Foto carregada! Clique em "Salvar Perfil" para aplicar.', '📷');
      } catch (err) {
        showToast(`Não foi possível processar a imagem: ${err.message}`, '❌');
      }
      event.target.value = '';
    };
    tempImg.onerror = function () {
      showToast('Erro ao carregar a imagem selecionada.', '❌');
      event.target.value = '';
    };
    tempImg.src = dataSrc;
  };
  reader.readAsDataURL(file);
};

window.handleSaveProfile = async function (event) {
  event.preventDefault();
  if (!authSession) {
    openAuthModal('login');
    return;
  }

  const name = document.getElementById('cfg-name').value.trim();
  const username = normalizeUsername(document.getElementById('cfg-username').value);
  if (!name || !username || username.length < 2) {
    showToast('Informe um nome e um @username válido (mínimo 2 caracteres).', '⚠️');
    return;
  }

  // Verifica unicidade de @username
  if (isSupabaseConfigured()) {
    try {
      const existing = await supabaseFetch(
        `profile_settings?username=eq.${encodeURIComponent(username)}&select=id`,
        { useUserToken: false }
      );
      if (Array.isArray(existing) && existing.some((row) => row.id !== authSession.userId)) {
        showToast('Esse @username já está sendo usado por outra pessoa.', '⚠️');
        return;
      }
    } catch (err) {
      console.warn('Falha ao validar username no Supabase:', err);
    }
  } else {
    const conflict = (appState.accounts || []).find(
      (a) => a.userId !== authSession.userId && normalizeUsername(a.profile?.username) === username
    );
    if (conflict) {
      showToast('Esse @username já está sendo usado por outra conta local.', '⚠️');
      return;
    }
  }

  const updatedProfile = sanitizeProfile({
    name,
    username,
    bio: document.getElementById('cfg-bio').value.trim(),
    avatarUrl: document.getElementById('cfg-avatar').value.trim(),
    instagramUrl: document.getElementById('cfg-instagram').value.trim(),
    following: appState.profile?.following || []
  });

  // Se estiver editando a conta padrão (@leitoracriativa) com outro @username, preserva o perfil padrão e cria um novo separado
  const isEditingDemoWithNewUsername =
    (authSession.userId === DEMO_USER_ID || (!isSupabaseConfigured() && normalizeUsername(authSession.username) === 'leitoracriativa')) &&
    username !== 'leitoracriativa';

  if (isEditingDemoWithNewUsername) {
    const demoSeed = createDemoAccount();
    const demoBookIds = new Set(demoSeed.books.map((b) => b.id));
    const customBooks = (appState.books || []).filter((b) => !demoBookIds.has(b.id));

    // Restaura/preserva @leitoracriativa intacto na lista de contas
    const demoIdx = (appState.accounts || []).findIndex(
      (a) => a.userId === DEMO_USER_ID || normalizeUsername(a.profile?.username) === 'leitoracriativa'
    );
    if (demoIdx !== -1) {
      appState.accounts[demoIdx] = demoSeed;
    } else {
      appState.accounts.unshift(demoSeed);
    }

    const newAccount = {
      userId: generateId('usr'),
      email: `${username}@local.estante`,
      password: '',
      passwordHash: DEMO_PASSWORD_HASH,
      profile: updatedProfile,
      clubs: [],
      books: customBooks
    };
    appState.accounts.unshift(newAccount);
    setAuthSession({
      userId: newAccount.userId,
      email: newAccount.email,
      username,
      accessToken: null,
      refreshToken: null,
      mode: isSupabaseConfigured() ? 'supabase' : 'local'
    });
    loadAccountIntoWorkingState(newAccount);
    saveState();
    updateAuthHeaderUI();
    renderAll();
    if (isSupabaseConfigured()) {
      void syncAccountsToSupabase([newAccount], []).catch(() => {});
    }
    showToast(`Novo perfil @${username} criado mantendo @leitoracriativa ativo!`, '🎉');
    return;
  }

  appState.profile = updatedProfile;

  setAuthSession({
    ...authSession,
    username
  });
  commitWorkingStateToOwnerAccount();
  updateAuthHeaderUI();
  renderAll();
  showToast('Perfil atualizado com sucesso!', '✅');
  await syncProfileInBackground();
};

function renderAdminClubs() {
  const container = document.getElementById('admin-clubs-list');
  const clubs = appState.clubs || [];

  if (clubs.length === 0) {
    container.innerHTML = '<p class="text-xs text-stone-400 italic">Nenhum clube cadastrado ainda.</p>';
    return;
  }

  container.innerHTML = clubs.map((club) => `
    <div class="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-paper-100 dark:bg-stone-800 border border-paper-200 dark:border-stone-700 text-xs sm:text-sm">
      <span>${escapeHtml(club.emoji || '📚')}</span>
      <span class="font-semibold">${escapeHtml(club.name)}</span>
      ${club.meta ? `<span class="text-xs text-stone-500 dark:text-stone-400">(${escapeHtml(club.meta)})</span>` : ''}
      <button type="button" onclick="removeClub('${escapeHtml(club.id)}')" title="Remover clube"
        class="ml-1 text-stone-400 hover:text-rose-600 transition font-bold px-1">
        ×
      </button>
    </div>
  `).join('');
}

window.handleAddClub = async function (event) {
  event.preventDefault();
  const emoji = document.getElementById('club-emoji').value.trim() || '📚';
  const name = document.getElementById('club-name').value.trim();
  const meta = document.getElementById('club-tag').value.trim();
  if (!name) return;

  appState.clubs.push({
    id: generateId('club'),
    emoji,
    name,
    meta
  });

  commitWorkingStateToOwnerAccount();
  document.getElementById('club-name').value = '';
  document.getElementById('club-tag').value = '';
  renderAll();
  showToast(`Clube "${name}" adicionado!`, '🏅');
  await syncProfileInBackground();
};

window.removeClub = async function (clubId) {
  appState.clubs = (appState.clubs || []).filter((c) => c.id !== clubId);
  commitWorkingStateToOwnerAccount();
  renderAll();
  showToast('Clube removido.', '🗑️');
  await syncProfileInBackground();
};

/* ==========================================================================
   BACKUP JSON & RESTAURAÇÃO DE DADOS DE EXEMPLO
   ========================================================================== */
window.exportBackupJson = function () {
  const safeAccounts = (appState.accounts || []).map((acc) => ({
    ...acc,
    password: ''
  }));
  const payload = JSON.stringify({ ...appState, accounts: safeAccounts }, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-na-minha-estante-${getCleanUsername()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup JSON exportado!', '💾');
};

window.importBackupJson = function (event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(String(e.target.result || '{}'));
      if (!parsed.profile && !Array.isArray(parsed.accounts)) {
        throw new Error('Formato inválido de backup.');
      }
      const seed = createSeedState();

      if (Array.isArray(parsed.accounts) && parsed.accounts.length > 0) {
        const accounts = parsed.accounts.map((acc) => {
          const unpacked = unpackClubsAndAccountMeta(acc.clubs || []);
          return {
            userId: acc.userId || generateId('usr'),
            email: acc.email || '',
            password: acc.passwordHash ? '' : (acc.password || ''),
            passwordHash: acc.passwordHash || unpacked.passwordHash || '',
            profile: sanitizeProfile(acc.profile, { following: unpacked.following }),
            clubs: unpacked.clubs,
            books: Array.isArray(acc.books) ? acc.books.map(sanitizeBook) : []
          };
        });
        const activeAcc = accounts[0];
        appState = {
          accounts,
          activePublicUsername: activeAcc.profile.username,
          profile: { ...activeAcc.profile },
          clubs: activeAcc.clubs.map((c) => ({ ...c })),
          books: activeAcc.books.map((b) => sanitizeBook(b)),
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
          supabase: parsed.supabase || appState.supabase
        };
      } else {
        if (!Array.isArray(parsed.books)) {
          throw new Error('Formato inválido de backup.');
        }
        const importedProfile = sanitizeProfile(parsed.profile, seed.profile);
        const importedBooks = parsed.books.map(sanitizeBook);
        const importedClubs = Array.isArray(parsed.clubs) ? parsed.clubs : [];
        const importedAcc = {
          userId: authSession?.userId || DEMO_USER_ID,
          email: authSession?.email || 'demo@naminhaestante.app',
          password: '',
          profile: importedProfile,
          clubs: importedClubs,
          books: importedBooks
        };
        appState = {
          accounts: [importedAcc],
          activePublicUsername: importedProfile.username,
          profile: { ...importedProfile },
          clubs: importedClubs,
          books: importedBooks,
          comments: Array.isArray(parsed.comments) ? parsed.comments : [],
          supabase: parsed.supabase || appState.supabase
        };
      }

      saveState();
      renderAll();
      showToast('Backup importado com sucesso!', '✅');
    } catch (err) {
      showToast(`Erro ao importar JSON: ${err.message}`, '❌');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
};

window.restoreDemoData = function () {
  if (!window.confirm('Restaurar os livros e perfil de demonstração? Isso substituirá seus dados locais atuais.')) {
    return;
  }
  const currentSb = appState.supabase;
  appState = createSeedState();
  appState.supabase = currentSb;
  saveState();
  if (authSession?.mode === 'local') {
    const demo = createDemoAccount();
    setAuthSession({
      userId: demo.userId,
      email: demo.email,
      username: demo.profile.username,
      accessToken: null,
      refreshToken: null,
      mode: 'local'
    });
  }
  updateAuthHeaderUI();
  renderAll();
  void healAllShelfCoversInBackground();
  showToast('Dados de demonstração restaurados!', '✨');
};

/* ==========================================================================
   INICIALIZAÇÃO
   ========================================================================== */
function renderAll() {
  updateSupabaseBadges();
  updateAuthHeaderUI();
  renderPublicShelf();
  renderAdminCatalog();
  populateAdminProfileForm();
  renderAdminClubs();
  refreshIcons();
}

async function initApp() {
  if (!document.getElementById('view-public')) return;
  initTheme();
  authSession = loadAuthSession();
  appState = loadState();
  toggleBookShelfFields();

  const requestedUser = getRequestedUsernameFromUrl();
  if (requestedUser && !isSupabaseConfigured()) {
    const localAcc = findLocalAccountByUsername(requestedUser);
    if (localAcc) {
      loadAccountIntoWorkingState(localAcc);
    }
  }

  renderAll();

  if (window.location.hash === '#/admin') {
    switchMainView('admin');
  } else {
    switchMainView('public');
  }
  switchAdminTab('add');

  if (isSupabaseConfigured()) {
    await pullFromSupabase({ silent: true, targetUsername: requestedUser || null });
  }

  void healAllShelfCoversInBackground();
}

window.addEventListener('hashchange', async () => {
  if (window.location.hash === '#/admin') {
    switchMainView('admin');
    return;
  }
  const requested = getRequestedUsernameFromUrl();
  if (requested) {
    await loadPublicShelfByUsername(requested);
    switchMainView('public');
  }
});

window.addEventListener('popstate', async () => {
  const requested = getRequestedUsernameFromUrl();
  if (requested) {
    await loadPublicShelfByUsername(requested);
    switchMainView('public');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeBookModal();
    closeQrModal();
    closeAuthModal();
  }
});

document.addEventListener('DOMContentLoaded', initApp);
