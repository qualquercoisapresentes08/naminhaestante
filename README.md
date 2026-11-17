# 📚 Na Minha Estante — Plataforma Multi-Usuário

Web app leve, rápido e responsivo (mobile-first) para criadores de conteúdo literário e leitores criarem suas próprias estantes públicas com indicações de livros, leituras atuais, clubes de leitura e links de compra na Amazon — ideal para colocar na bio do Instagram ou divulgar via QR Code.

---

## ✨ Funcionalidades Principais

- **Contas Multi-Usuário (`?u=seunome`):** Qualquer visitante pode criar uma conta, escolher seu `@username` único e gerenciar sua própria estante isolada (tanto em Modo Local no navegador quanto em nuvem via **Supabase Auth + RLS**).
- **Monetização Global da Plataforma:** Todos os botões *"Comprar na Amazon"* em todas as estantes utilizam automaticamente a Tag de Associado Amazon global configurada em `PLATFORM_AMAZON_TAG` (`qualquercoi05-20`) no [app.js](app.js).
- **Busca Inteligente (Google Books + Open Library):** Ao buscar um livro por título, autor ou ISBN, o app consulta a **API do Google Books** e aciona automaticamente a **Open Library** como plano B quando a obra não é encontrada ou vem sem capa.
- **Comentários com Login Ultrarrápido:** Visitantes comentam nos livros informando apenas Nome e `@instagram`.
- **QR Code da Estante:** Gera link personalizado (`?u=seunome`) e QR Code com download em SVG.

---

## 📁 Arquivos do Projeto

- `index.html` — Estrutura visual responsiva (HTML5 + Tailwind CSS + Lucide Icons + QR Code) com **Vitrine Pública**, **Modal de Login/Cadastro** e **Painel Administrativo**.
- `app.js` — Lógica multi-usuário, busca no Google Books + Open Library fallback, gerador global de links Amazon (`qualquercoi05-20`), sistema de comentários, persistência em `localStorage` e integração com **Supabase Auth + REST**.
- `supabase_schema.sql` — Script SQL pronto para criar as tabelas (`profile_settings`, `books`, `comments`) e políticas RLS multi-usuário vinculadas ao `auth.uid()`.
- `README.md` — Este guia de uso local, configuração do Supabase e publicação.

---

## 🚀 Como Rodar Localmente

O projeto não precisa de `npm install`, build ou servidor complexo:

1. Abra o arquivo `index.html` diretamente no navegador **ou** sirva a pasta localmente com qualquer servidor estático (por exemplo, `npx serve .` ou `python -m http.server 8080`).
2. Clique em **"👤 Entrar / Criar Conta"** no topo (ou em **⚙️ Painel Admin**):
   - Use **"✨ Entrar com Conta Demo (@leitoracriativa)"** para testar imediatamente, **ou**
   - Clique na aba **"Criar Minha Estante"** para cadastrar um novo usuário e testar estantes separadas (`?u=novousuario`).
3. No **Painel Admin**:
   - **Buscar Livros & Adicionar:** Busque qualquer livro no Google Books / Open Library e preencha o formulário em 1 clique (ou cadastre manualmente).
   - **Gerenciar Acervo:** Mova livros entre *Lendo Agora*, *Já Lidos & Recomendados* e *Quero Ler*, edite ou exclua obras da sua conta.
   - **Perfil & Clubes:** Personalize nome, `@username`, bio, Instagram e os **Clubes que Participo**.
   - **Supabase & Backup:** Exporte/importe backups em JSON ou conecte o seu projeto do Supabase.

---

## 🗄️ Como Conectar ao Supabase (Multi-Usuário na Nuvem)

1. Crie uma conta gratuita em [supabase.com](https://supabase.com) e crie um novo projeto.
2. No menu lateral do Supabase, abra **SQL Editor** → **New query**.
3. Copie todo o conteúdo de `supabase_schema.sql` (ou clique em **"Copiar SQL das Tabelas"** dentro do Painel Admin) e clique em **Run**.
4. Em **Authentication → Providers → Email** no Supabase:
   - Para cadastros instantâneos sem confirmação de e-mail em testes, desative opcionalmente **Confirm email** (em produção, você pode mantê-lo ativado).
5. Vá em **Project Settings** → **API** e copie:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key**
6. No **Painel Admin → Supabase & Backup**, cole esses dois valores e clique em **"Salvar & Testar Conexão"**. Depois disso, novos cadastros e logins usarão o **Supabase Auth** automaticamente, garantindo pelas políticas **RLS** que cada usuário edite apenas o próprio perfil (`auth.uid() = id`) e os próprios livros (`auth.uid() = user_id`).

---

## 🌐 Como Publicar Grátis (Vercel ou Cloudflare Pages)

Como o projeto é 100% estático (`index.html` + `app.js`):

### Opção A — Vercel
1. Acesse [vercel.com](https://vercel.com) e crie uma conta gratuita.
2. Envie esta pasta para um repositório no GitHub (ou use `npx vercel` na pasta do projeto).
3. Sem comando de build necessário (Framework Preset: **Other** / Root Directory: `./`).

### Opção B — Cloudflare Pages
1. Acesse o painel do [Cloudflare Pages](https://pages.cloudflare.com/).
2. Conecte seu repositório ou faça **Direct Upload** desta pasta (`na-minha-estante`).
3. Deixe o comando de build vazio e o diretório de saída como `/`.
