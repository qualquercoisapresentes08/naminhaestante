/* ==========================================================================
   NA MINHA ESTANTE - MULTI-USUÁRIO + MONETIZAÇÃO GLOBAL + OPEN LIBRARY
   ========================================================================== */

const PLATFORM_AMAZON_TAG = 'qualquercoi05-20';

const STORAGE_KEY = 'nme_state_v1';
const AUTH_KEY = 'nme_auth_v1';
const VISITOR_KEY = 'nme_visitor_v1';
const THEME_KEY = 'nme_theme_v1';
const DEMO_USER_ID = 'demo_leitoracriativa';

const SUPABASE_SCHEMA_SQL = `-- ==========================================================================
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
`;

// Estado global da aplicação
let appState = null;
let authSession = null; // { userId, email, username, accessToken, refreshToken, mode: 'local' | 'supabase' }
let currentMainView = 'public'; // 'public' | 'admin'
let currentAdminTab = 'add'; // 'add' | 'catalog' | 'profile' | 'database'
let currentShelfFilter = 'all'; // 'all' | 'reading' | 'read' | 'wishlist'
let publicSearchTerm = '';
let activeModalBookId = null;
let lastBookSearchResults = [];
let pendingAdminAfterAuth = false;
let toastTimeout = null;

/* ==========================================================================
   DADOS INICIAIS DE DEMONSTRAÇÃO (SEED DATA)
   ========================================================================== */
function createDemoAccount() {
  const now = new Date().toISOString();
  return {
    userId: DEMO_USER_ID,
    email: 'demo@naminhaestante.app',
    password: '123456',
    profile: {
      name: 'Clara Mendes',
      username: 'leitoracriativa',
      bio: 'Criadora literária & apaixonada por ficção contemporânea, thrillers psicológicos e literatura brasileira. Todos os meus livros e indicações em um só lugar.',
      avatarUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=300&q=80',
      instagramUrl: 'https://instagram.com/leitoracriativa'
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
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9786555871784-L.jpg',
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
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9786558380542-L.jpg',
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
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9786580309313-L.jpg',
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
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9788584391509-L.jpg',
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
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9788556510150-L.jpg',
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
        coverUrl: 'https://covers.openlibrary.org/b/isbn/9788535924084-L.jpg',
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

function createSeedState() {
  const demo = createDemoAccount();
  return {
    accounts: [demo],
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
      url: '',
      anonKey: ''
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

window.handleBookCoverError = function (img, title, author) {
  if (img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.src = buildFallbackCoverDataUri(title, author);
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
  const query = [book?.title, book?.author].filter(Boolean).join(' ').trim() || 'livros';
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
  return {
    name: String(profile.name ?? fallback.name ?? 'Leitor(a)').trim() || 'Leitor(a)',
    username,
    bio: String(profile.bio ?? fallback.bio ?? ''),
    avatarUrl: String(profile.avatarUrl ?? fallback.avatarUrl ?? ''),
    instagramUrl: String(profile.instagramUrl ?? fallback.instagramUrl ?? '')
  };
}

function sanitizeBook(book = {}) {
  return {
    id: book.id || generateId('book'),
    title: String(book.title || '').trim() || 'Sem título',
    author: String(book.author || '').trim() || 'Autor desconhecido',
    coverUrl: String(book.coverUrl || '').trim(),
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
  appState.profile = { ...profile };
  appState.clubs = Array.isArray(account.clubs) ? account.clubs.map((c) => ({ ...c })) : [];
  appState.books = Array.isArray(account.books) ? account.books.map((b) => sanitizeBook(b)) : [];
  appState.activePublicUsername = profile.username;
}

function commitWorkingStateToOwnerAccount() {
  if (!authSession || !appState) return;
  if (!Array.isArray(appState.accounts)) appState.accounts = [];

  const cleanProfile = sanitizeProfile(appState.profile, { username: authSession.username });
  appState.profile = cleanProfile;
  appState.activePublicUsername = cleanProfile.username;

  let account = findLocalAccountById(authSession.userId);
  if (!account) {
    account = {
      userId: authSession.userId,
      email: authSession.email || '',
      password: '',
      profile: { ...cleanProfile },
      clubs: [],
      books: []
    };
    appState.accounts.push(account);
  }

  account.profile = { ...cleanProfile };
  account.clubs = (appState.clubs || []).map((c) => ({ ...c }));
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
        accounts = parsed.accounts.map((acc) => ({
          userId: acc.userId || generateId('usr'),
          email: acc.email || '',
          password: acc.password || '',
          profile: sanitizeProfile(acc.profile),
          clubs: Array.isArray(acc.clubs) ? acc.clubs : [],
          books: Array.isArray(acc.books) ? acc.books.map(sanitizeBook) : []
        }));
      } else {
        // Migração automática do estado MVP v1 para estrutura multi-usuário
        const migratedProfile = sanitizeProfile(parsed.profile, seed.profile);
        accounts = [{
          userId: DEMO_USER_ID,
          email: 'demo@naminhaestante.app',
          password: '123456',
          profile: migratedProfile,
          clubs: Array.isArray(parsed.clubs) ? parsed.clubs : seed.clubs,
          books: Array.isArray(parsed.books) ? parsed.books.map(sanitizeBook) : seed.books
        }];
      }

      // Garante que o perfil padrão (@leitoracriativa) nunca suma do diretório público
      if (!accounts.some((a) => normalizeUsername(a.profile?.username) === 'leitoracriativa')) {
        accounts.unshift(createDemoAccount());
      }

      const activeUsername = normalizeUsername(parsed.activePublicUsername || parsed.profile?.username) || accounts[0].profile.username;
      const activeAcc = accounts.find((a) => normalizeUsername(a.profile.username) === activeUsername) || accounts[0];

      return {
        accounts,
        activePublicUsername: activeAcc.profile.username,
        profile: { ...activeAcc.profile },
        clubs: activeAcc.clubs.map((c) => ({ ...c })),
        books: activeAcc.books.map((b) => sanitizeBook(b)),
        comments: Array.isArray(parsed.comments) ? parsed.comments : seed.comments,
        supabase: { ...seed.supabase, ...(parsed.supabase || {}) }
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

  const useUserToken = options.useUserToken !== false && authSession?.mode === 'supabase' && authSession?.accessToken;
  const bearerToken = useUserToken ? authSession.accessToken : anonKey;

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const fetchOpts = { ...options };
  delete fetchOpts.useUserToken;

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...fetchOpts,
    headers
  });

  if (response.status === 401 && useUserToken && retryOn401) {
    const refreshed = await refreshSupabaseTokenIfNeeded();
    if (refreshed) {
      return supabaseFetch(path, options, false);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Supabase (${response.status}): ${errText || response.statusText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function toDbProfile(profile, clubs, userId) {
  return {
    id: userId,
    username: normalizeUsername(profile.username),
    name: profile.name,
    bio: profile.bio || '',
    avatar_url: profile.avatarUrl || '',
    instagram_url: profile.instagramUrl || '',
    clubs: clubs || [],
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
  return isSupabaseConfigured() && authSession?.mode === 'supabase' && Boolean(authSession?.accessToken);
}

async function syncProfileInBackground() {
  if (!canWriteToSupabaseOwnerData()) return;
  try {
    await supabaseFetch('profile_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(toDbProfile(appState.profile, appState.clubs, authSession.userId))
    });
  } catch (err) {
    console.warn('Falha ao sincronizar perfil no Supabase:', err);
  }
}

async function syncBookInBackground(book) {
  if (!canWriteToSupabaseOwnerData()) return;
  try {
    await supabaseFetch('books', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(toDbBook(book, authSession.userId))
    });
  } catch (err) {
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
    showToast('Conexão com Supabase verificada! Crie ou entre na sua conta Supabase.', '✅');
  } catch (err) {
    showToast(`Configuração salva, mas o teste falhou: ${err.message}`, '⚠️');
  }
};

window.syncAllToSupabase = async function () {
  if (!isSupabaseConfigured()) {
    showToast('Preencha a URL e a Anon Key do Supabase primeiro.', '⚠️');
    return;
  }
  if (authSession?.mode !== 'supabase' || !authSession?.accessToken) {
    showToast('Entre ou crie uma conta com o Supabase conectado para enviar sua estante.', '🔐');
    openAuthModal('login');
    return;
  }

  try {
    await supabaseFetch('profile_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(toDbProfile(appState.profile, appState.clubs, authSession.userId))
    });

    if (appState.books.length > 0) {
      await supabaseFetch('books', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(appState.books.map((b) => toDbBook(b, authSession.userId)))
      });
    }

    if (appState.comments.length > 0) {
      await supabaseFetch('comments', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(appState.comments.map(toDbComment))
      });
    }

    showToast('Estante da sua conta enviada para o Supabase!', '☁️');
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
        const userBooks = booksRows.filter((b) => b.user_id === p.id).map(fromDbBook);
        return {
          userId: p.id,
          email: '',
          password: '',
          profile: sanitizeProfile({
            name: p.name,
            username: p.username,
            bio: p.bio,
            avatarUrl: p.avatar_url,
            instagramUrl: p.instagram_url
          }),
          clubs: Array.isArray(p.clubs) ? p.clubs : [],
          books: userBooks
        };
      });

      // Mantém o perfil padrão (@leitoracriativa) disponível na listagem caso não esteja no banco
      if (!dbAccounts.some((a) => normalizeUsername(a.profile?.username) === 'leitoracriativa')) {
        dbAccounts.unshift(createDemoAccount());
      }

      appState.accounts = dbAccounts;

      const selectedAcc =
        (desiredUser && dbAccounts.find((a) => normalizeUsername(a.profile.username) === desiredUser)) ||
        dbAccounts.find((a) => a.userId !== DEMO_USER_ID) ||
        dbAccounts[0];

      loadAccountIntoWorkingState(selectedAcc);

      const loadedComments = commentsRows.map(fromDbComment);
      const loadedCommentIds = new Set(loadedComments.map((c) => c.id));
      const localOnlyComments = (appState.comments || []).filter((c) => !loadedCommentIds.has(c.id));
      appState.comments = [...loadedComments, ...localOnlyComments];

      saveState();
      renderAll();
      if (!silent) showToast(`Estante @${selectedAcc.profile.username} carregada do Supabase!`, '☁️');
    } else if (!silent) {
      showToast('Nenhum perfil encontrado no Supabase ainda.', 'ℹ️');
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

window.switchLocalAccount = function (userId) {
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
      if (!identifier.includes('@')) {
        showToast('No modo Supabase, informe o e-mail cadastrado.', '⚠️');
        return;
      }

      const authData = await supabaseAuthRequest('token?grant_type=password', {
        email: identifier,
        password
      });

      const user = authData?.user;
      if (!user || !authData?.access_token) {
        throw new Error('Não foi possível iniciar sessão.');
      }

      setAuthSession({
        userId: user.id,
        email: user.email,
        username: normalizeUsername(user.user_metadata?.username || user.email.split('@')[0]),
        accessToken: authData.access_token,
        refreshToken: authData.refresh_token || null,
        mode: 'supabase'
      });

      // Busca perfil do usuário no Supabase
      let profiles = await supabaseFetch(
        `profile_settings?id=eq.${encodeURIComponent(user.id)}&select=*`
      );

      let profileObj;
      let clubsArr = [];
      if (Array.isArray(profiles) && profiles[0]) {
        const p = profiles[0];
        profileObj = sanitizeProfile({
          name: p.name,
          username: p.username,
          bio: p.bio,
          avatarUrl: p.avatar_url,
          instagramUrl: p.instagram_url
        });
        clubsArr = Array.isArray(p.clubs) ? p.clubs : [];
      } else {
        const fallbackUsername = normalizeUsername(user.user_metadata?.username || user.email.split('@')[0]) || `leitor${Date.now().toString().slice(-4)}`;
        profileObj = sanitizeProfile({
          name: user.user_metadata?.name || fallbackUsername,
          username: fallbackUsername
        });
        await supabaseFetch('profile_settings', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify(toDbProfile(profileObj, [], user.id))
        });
      }

      const books = await supabaseFetch(
        `books?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc`
      );

      setAuthSession({
        ...authSession,
        username: profileObj.username
      });

      appState.profile = profileObj;
      appState.clubs = clubsArr;
      appState.books = Array.isArray(books) ? books.map(fromDbBook) : [];
      appState.activePublicUsername = profileObj.username;
      commitWorkingStateToOwnerAccount();

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
    if (!acc || (acc.password && acc.password !== password)) {
      showToast('E-mail/@username ou senha incorretos.', '❌');
      return;
    }

    switchLocalAccount(acc.userId);
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
    if (isSupabaseConfigured()) {
      const existing = await supabaseFetch(
        `profile_settings?username=eq.${encodeURIComponent(username)}&select=id`,
        { useUserToken: false }
      );
      if (Array.isArray(existing) && existing.length > 0) {
        showToast('Esse @username já está em uso. Escolha outro!', '⚠️');
        return;
      }

      const signUpData = await supabaseAuthRequest('signup', {
        email,
        password,
        data: { name, username }
      });

      const token = signUpData?.access_token || signUpData?.session?.access_token;
      const userId = signUpData?.user?.id || signUpData?.id;

      if (!token || !userId) {
        showToast('Conta criada! Verifique seu e-mail para confirmar e depois faça login.', '📧');
        switchAuthTab('login');
        return;
      }

      const newProfile = sanitizeProfile({
        name,
        username,
        bio,
        avatarUrl: '',
        instagramUrl
      });

      setAuthSession({
        userId,
        email,
        username,
        accessToken: token,
        refreshToken: signUpData?.refresh_token || signUpData?.session?.refresh_token || null,
        mode: 'supabase'
      });

      await supabaseFetch('profile_settings', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(toDbProfile(newProfile, [], userId))
      });

      appState.profile = newProfile;
      appState.clubs = [];
      appState.books = [];
      appState.activePublicUsername = username;
      commitWorkingStateToOwnerAccount();

      document.getElementById('auth-signup-form').reset();
      closeAuthModal();
      updateAuthHeaderUI();
      renderAll();
      pendingAdminAfterAuth = false;
      switchMainView('admin');
      showToast(`Estante @${username} criada com sucesso!`, '🎉');
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
      password,
      profile: sanitizeProfile({
        name,
        username,
        bio,
        avatarUrl: '',
        instagramUrl
      }),
      clubs: [],
      books: []
    };

    appState.accounts.push(newAccount);
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

function renderPublicProfile() {
  const p = appState.profile;
  const cleanUser = getCleanUsername();

  document.getElementById('header-route-preview').textContent = `/?u=${cleanUser}`;
  document.getElementById('profile-name').textContent = p.name || 'Leitor(a)';
  document.getElementById('profile-username-badge').textContent = `@${cleanUser}`;
  document.getElementById('profile-bio').textContent = p.bio || '';

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

function renderPublicProfilesDirectory() {
  const listEl = document.getElementById('public-profiles-list');
  const countEl = document.getElementById('public-profiles-count');
  if (!listEl) return;

  const accounts = appState?.accounts || [];
  const activeSlug = normalizeUsername(appState?.profile?.username);

  if (countEl) {
    countEl.textContent = `${accounts.length} ${accounts.length === 1 ? 'perfil ativo' : 'perfis ativos'}`;
  }

  const profileCardsHtml = accounts.map((acc) => {
    const p = acc.profile || {};
    const slug = normalizeUsername(p.username) || 'oseunome';
    const isActive = slug === activeSlug;
    const bookCount = Array.isArray(acc.books) ? acc.books.length : 0;
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

    return `
      <button type="button" onclick="selectPublicProfile('${escapeHtml(slug)}')"
        class="group relative aspect-[2/3] rounded-2xl p-4 border flex flex-col items-center justify-between text-center transition ${
          isActive
            ? 'bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/40 dark:to-stone-900 border-amber-400 dark:border-amber-600 shadow-soft ring-2 ring-amber-400/40'
            : 'bg-paper-50 hover:bg-white dark:bg-stone-800/60 dark:hover:bg-stone-800 border-stone-200/80 dark:border-stone-700/80 hover:shadow-soft'
        }">
        <div class="w-full flex justify-end min-h-[1.25rem]">
          ${isActive
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-stone-950">Ativa</span>'
            : '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-200/70 dark:bg-stone-700/70 text-stone-600 dark:text-stone-300 opacity-80 group-hover:opacity-100">Perfil</span>'}
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
        </div>

        <div class="w-full space-y-2">
          <span class="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-full bg-paper-100 dark:bg-stone-800 border border-paper-200 dark:border-stone-700 text-[11px] font-semibold text-stone-700 dark:text-stone-200">
            📚 ${bookCount} ${bookCount === 1 ? 'livro' : 'livros'} na estante
          </span>
          <div class="w-full py-1.5 rounded-xl text-xs font-bold transition ${
            isActive
              ? 'bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-950'
              : 'bg-stone-100 group-hover:bg-amber-500 text-stone-700 group-hover:text-stone-950 dark:bg-stone-700 dark:text-stone-200 dark:group-hover:bg-amber-500 dark:group-hover:text-stone-950'
          }">
            ${isActive ? '✓ Selecionada' : 'Ver Estante'}
          </div>
        </div>
      </button>
    `;
  }).join('');

  const addProfileCardHtml = `
    <button type="button" onclick="openAuthModal('signup')"
      class="group aspect-[2/3] rounded-2xl p-4 border-2 border-dashed border-stone-300 hover:border-amber-500 dark:border-stone-700 dark:hover:border-amber-500 bg-stone-50/50 hover:bg-amber-50/40 dark:bg-stone-900/40 dark:hover:bg-amber-950/20 flex flex-col items-center justify-center text-center gap-3 transition">
      <div class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center text-2xl shadow-xs group-hover:scale-105 transition">
        ➕
      </div>
      <div class="space-y-1">
        <p class="font-serif font-bold text-sm sm:text-base text-stone-800 dark:text-stone-100">Criar Meu Perfil</p>
        <p class="text-[11px] text-stone-500 dark:text-stone-400 leading-snug px-2">Cadastre sua estante e apareça aqui na vitrine</p>
      </div>
    </button>
  `;

  listEl.innerHTML = profileCardsHtml + addProfileCardHtml;
}

window.selectPublicProfile = function (username) {
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
              onerror="handleBookCoverError(this, '${escapeHtml(book.title)}', '${escapeHtml(book.author)}')"
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
                onerror="handleBookCoverError(this, '${escapeHtml(book.title)}', '${escapeHtml(book.author)}')"
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
  coverEl.onerror = function () {
    handleBookCoverError(this, book.title, book.author);
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
    text,
    rating,
    createdAt: new Date().toISOString()
  };

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

  listEl.innerHTML = comments.map((c) => `
    <div class="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-800 space-y-1.5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="font-bold text-xs sm:text-sm text-stone-900 dark:text-white">${escapeHtml(c.authorName)}</span>
          ${c.authorHandle ? `<span class="text-xs text-amber-700 dark:text-amber-400 font-medium">${escapeHtml(c.authorHandle)}</span>` : ''}
        </div>
        <div class="flex items-center gap-2">
          ${Number(c.rating) > 0 ? renderStars(c.rating, 'w-3 h-3') : ''}
          <span class="text-[11px] text-stone-400">${escapeHtml(formatRelativeDate(c.createdAt))}</span>
        </div>
      </div>
      <p class="text-xs sm:text-sm text-stone-700 dark:text-stone-200 leading-relaxed">${escapeHtml(c.text)}</p>
    </div>
  `).join('');
}

/* ==========================================================================
   MODAL DE QR CODE & COMPARTILHAMENTO
   ========================================================================== */
window.openQrModal = function () {
  const modal = document.getElementById('qr-modal');
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
   PAINEL ADMIN — SUB-ABA 1: GOOGLE BOOKS + OPEN LIBRARY FALLBACK & FORMULÁRIO
   ========================================================================== */
async function searchGoogleBooks(query) {
  const endpoint = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map((item) => {
    const info = item.volumeInfo || {};
    const imageLinks = info.imageLinks || {};
    let thumb = imageLinks.thumbnail || imageLinks.smallThumbnail || '';
    if (thumb) {
      thumb = thumb.replace(/^http:\/\//i, 'https://').replace(/&edge=curl/gi, '');
    }

    const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
    const isbn13 = identifiers.find((id) => id.type === 'ISBN_13');
    const isbn10 = identifiers.find((id) => id.type === 'ISBN_10');
    const isbn = (isbn13 || isbn10 || {}).identifier || '';

    if (!thumb && isbn) {
      thumb = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
    }

    return {
      title: info.title || 'Sem título',
      author: Array.isArray(info.authors) && info.authors.length ? info.authors.join(', ') : 'Autor desconhecido',
      description: info.description || '',
      thumbnail: thumb,
      isbn,
      publishedDate: info.publishedDate || '',
      source: 'Google Books'
    };
  });
}

async function searchOpenLibrary(query) {
  const endpoint = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=8&fields=key,title,author_name,first_publish_year,isbn,cover_i,first_sentence`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Open Library HTTP ${res.status}`);
  }
  const data = await res.json();
  const docs = Array.isArray(data.docs) ? data.docs : [];

  return docs.map((doc) => {
    const isbn = Array.isArray(doc.isbn) && doc.isbn.length ? String(doc.isbn[0]) : '';
    let thumb = '';
    if (doc.cover_i) {
      thumb = `https://covers.openlibrary.org/b/id/${encodeURIComponent(doc.cover_i)}-L.jpg`;
    } else if (isbn) {
      thumb = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
    }

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
      description,
      thumbnail: thumb,
      isbn,
      publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
      source: 'Open Library'
    };
  });
}

function mergeUniqueBookResults(primary, secondary, limit = 8) {
  const merged = [...primary];
  const seen = new Set(
    primary.map((b) => `${(b.title || '').toLowerCase()}::${(b.author || '').toLowerCase()}`)
  );

  for (const item of secondary) {
    if (merged.length >= limit) break;
    const key = `${(item.title || '').toLowerCase()}::${(item.author || '').toLowerCase()}`;
    const duplicateIsbn = item.isbn && merged.some((m) => m.isbn && m.isbn === item.isbn);
    if (!seen.has(key) && !duplicateIsbn) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

window.handleGoogleBooksSearch = async function (event) {
  event.preventDefault();
  const query = document.getElementById('google-books-query').value.trim();
  if (!query) return;

  const statusEl = document.getElementById('google-books-status');
  const resultsEl = document.getElementById('google-books-results');
  const btn = document.getElementById('btn-google-search');

  statusEl.classList.remove('hidden');
  statusEl.textContent = 'Buscando obras no Google Books...';
  resultsEl.innerHTML = '';
  btn.disabled = true;

  try {
    let books = [];
    let googleFailed = false;

    try {
      books = await searchGoogleBooks(query);
    } catch (err) {
      googleFailed = true;
      console.warn('Google Books falhou, acionando fallback Open Library:', err);
    }

    if (googleFailed || books.length === 0) {
      statusEl.textContent = googleFailed
        ? 'Google Books indisponível. Consultando Open Library como plano B...'
        : 'Nenhum resultado no Google Books. Consultando Open Library...';
      const olBooks = await searchOpenLibrary(query);
      books = olBooks;
    } else if (books.length < 4) {
      try {
        const olBooks = await searchOpenLibrary(query);
        books = mergeUniqueBookResults(books, olBooks, 8);
      } catch (olErr) {
        console.warn('Complemento Open Library falhou:', olErr);
      }
    }

    lastBookSearchResults = books;

    if (books.length === 0) {
      statusEl.textContent = 'Nenhum livro encontrado no Google Books nem na Open Library. Preencha os campos manualmente abaixo.';
      return;
    }

    statusEl.textContent = `${books.length} resultados encontrados. Clique em "Usar este livro" para preencher o formulário abaixo:`;
    resultsEl.innerHTML = books.map((book, idx) => {
      const thumb = book.thumbnail || buildFallbackCoverDataUri(book.title, book.author);
      const isOpenLibrary = book.source === 'Open Library';
      const sourceBadgeClass = isOpenLibrary
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';

      return `
        <div class="flex gap-3.5 p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200/80 dark:border-stone-700/80 items-start">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(book.title)}"
            onerror="handleBookCoverError(this, '${escapeHtml(book.title)}', '${escapeHtml(book.author)}')"
            class="w-16 h-24 rounded-lg object-cover shadow-sm shrink-0 bg-stone-200 dark:bg-stone-700" />
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex items-start justify-between gap-2">
              <h4 class="font-bold text-sm text-stone-900 dark:text-white line-clamp-2 leading-snug">${escapeHtml(book.title)}</h4>
              <span class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${sourceBadgeClass}">${escapeHtml(book.source || 'Google Books')}</span>
            </div>
            <p class="text-xs text-stone-500 dark:text-stone-400 truncate">${escapeHtml(book.author)}${book.publishedDate ? ` • ${escapeHtml(book.publishedDate.slice(0, 4))}` : ''}</p>
            <p class="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2">${escapeHtml(book.description || 'Sem sinopse na base.')}</p>
            <button type="button" onclick="selectGoogleBook(${idx})"
              class="mt-1.5 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition">
              <span>Usar este livro</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    statusEl.textContent = `Não foi possível consultar as bases de livros (${err.message}). Você pode preencher os campos manualmente abaixo.`;
  } finally {
    btn.disabled = false;
  }
};

window.selectGoogleBook = function (index) {
  const picked = lastBookSearchResults[index];
  if (!picked) return;

  document.getElementById('book-title').value = picked.title;
  document.getElementById('book-author').value = picked.author;
  document.getElementById('book-cover').value = picked.thumbnail;
  document.getElementById('book-synopsis').value = picked.description;
  document.getElementById('book-isbn').value = picked.isbn || '';
  updateCoverPreview(picked.thumbnail);

  document.getElementById('book-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`Dados importados (${picked.source || 'Google Books'})! Escolha a prateleira e salve.`, '📚');
};

window.updateCoverPreview = function (url) {
  const img = document.getElementById('book-cover-preview');
  const placeholder = document.getElementById('book-cover-placeholder');
  const clean = safeUrl(url, '');
  if (clean) {
    img.src = clean;
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
  } else {
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
  document.getElementById('book-form').reset();
  document.getElementById('book-id').value = '';
  document.getElementById('book-isbn').value = '';
  document.getElementById('book-progress').value = 50;
  document.getElementById('book-progress-value').textContent = '50%';
  document.getElementById('book-form-heading').textContent = 'Adicionar Livro à Estante';
  document.getElementById('book-form-submit-label').textContent = 'Salvar na Estante';
  document.getElementById('btn-cancel-edit').classList.add('hidden');
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
            onerror="handleBookCoverError(this, '${escapeHtml(book.title)}', '${escapeHtml(book.author)}')"
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
}

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

  const updatedProfile = {
    name,
    username,
    bio: document.getElementById('cfg-bio').value.trim(),
    avatarUrl: document.getElementById('cfg-avatar').value.trim(),
    instagramUrl: document.getElementById('cfg-instagram').value.trim()
  };

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
      password: '123456',
      profile: updatedProfile,
      clubs: [],
      books: customBooks
    };
    appState.accounts.push(newAccount);
    setAuthSession({
      userId: newAccount.userId,
      email: newAccount.email,
      username,
      accessToken: null,
      refreshToken: null,
      mode: 'local'
    });
    loadAccountIntoWorkingState(newAccount);
    saveState();
    updateAuthHeaderUI();
    renderAll();
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
  const payload = JSON.stringify(appState, null, 2);
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
        const accounts = parsed.accounts.map((acc) => ({
          userId: acc.userId || generateId('usr'),
          email: acc.email || '',
          password: acc.password || '',
          profile: sanitizeProfile(acc.profile),
          clubs: Array.isArray(acc.clubs) ? acc.clubs : [],
          books: Array.isArray(acc.books) ? acc.books.map(sanitizeBook) : []
        }));
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
