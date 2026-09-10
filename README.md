# K-AECS — AI Citizen Engagement & Complaint Management System

K-AECS (Kebangsaan/State — "Sistem Aduan Warganegara") adalah sistem pengurusan
aduan dan penglibatan warganegara yang didorong AI untuk pendidikan di Negeri
Sabah, di bawah Kementerian Pendidikan, Sains dan Inovasi Negeri Sabah (KPSTI).

- **Warganegara** melapor & bertanya melalui **Telegram**
  (`apps/telegram-bot`).
- **Pegawai KPSTI** mengurus aduan melalui **panel pentadbir web**
  (`apps/web`).
- **API Fastify** (`apps/api`) menyediakan logik perniagaan berpusat.
- **Harness AI** dibina di atas **Pi** (`@earendil-works/pi-agent-core`) dengan
  alat carian web (`web_search`, `fetch_url`) yang dilaksanakan sendiri dalam
  `packages/tools`.
- **Worker** (BullMQ + Redis) menjalankan permintaan AI secara tak segerak dan
  menghantar pemberitahuan Telegram.

## Monorepo

```
apps/
  api/            Fastify API (auth, aduan, harness, analytics, telegram webhook)
  telegram-bot/   Bot pengguna Telegram (grammY) - persetujuan, wizard aduan, Q&A
  worker/         BullMQ workers - harness.run + telegram.deliver
  web/            Panel pentadbir (Next.js 15, React 19) - carta, aduan, AI, pengguna
packages/
  ai/             Pembungkusan model AI (provider OpenAI-compatible)
  auth/           JWT + RBAC pihak pelayan
  config/         Skema env (zod) diagregat ke satu kontrak
  database/       Skema Drizzle + migrasi + seed (PostgreSQL + pgvector)
  harness/        Pembungkus Pi AgentHarness (model, sesi, emit/audit)
  shared/         Jenis domain, pemalar, RBAC (ROLES/PERMISSIONS), rujukan aduan
  tools/          Registry alat pi + web_search + fetch_url
  validation/     Skema zod untuk API dan bot
```

## Prasyarat

- Node >= 22, pnpm 9.15.9 (`corepack enable`)
- PostgreSQL + pgvector, Redis, dan gerbang model OpenAI-compatible.
  Jalankan `docker-compose up -d` untuk Postgres + Redis + MinIO (jika ada
  Docker). Tanpa Docker, sediakan perkhidmatan setara dan kemas kini `.env`.

## Struktur

```bash
cp .env.example .env      # isi AUTH_SECRET, DATABASE_URL, REDIS_URL, AI_*, TELEGRAM_BOT_TOKEN
pnpm install
pnpm build                # bina semua paket + app (16 pkg + 4 app)
pnpm db:generate          # hasilkan migrasi SQL (dijalankan melalui tsx)
pnpm db:migrate           # guna migrasi pada PostgreSQL yang berjalan
pnpm db:seed              # data rujukan: daerah, kategori, institusi, pengguna demo
```

> Nota: `db:generate`/`db:migrate` mesti berjalan melalui tsx kerana
> `drizzle-kit` tidak dapat memuatkan specifier `.js` gaya NodeNext skema:
> skrip dalam `packages/database/package.json` sudah membalut tsx.

## Pengurusan pembangunan

```bash
pnpm dev                 # semua app bersama (api 3001, bot, worker, web 3000)
pnpm dev:api             # API sahaja
pnpm dev:bot             # bot Telegram (polling)
pnpm dev:worker          # worker BullMQ
pnpm dev:web             # panel web
pnpm typecheck           # semakan jenis 19 tugasan
pnpm test                # ujian unit (vitest, packages/tools) + no-op lain
```

## Aliran utama

1. **Warganegara → Telegram**: `/start` → persetujuan (v1) → `/menu`.
   - *Aduan*: wizard kategori → tajuk → huraian → lokasi → sahkan; rujukan
     `KPSTI-YYYY-NNNNNN`.
   - *Semak status*: masukkan no. rujukan; disahkan terhadap `telegram_user_id`
     (kepunyaan disahkan, bukan nombor semata-mata).
   - *Tanya*: soalan dibawa ke harness Pi.
2. **API**: `POST /api/v1/harness/run` (laluan segerak warganegara) atau
   worker (asynchronous). Sesi disimpan dalam DB
   (`InMemorySessionStorage`, id = conversationId); token/model/eksit ditulis
   ke `ai_runs`, alatan ke `ai_tool_calls`, bibliografi ke `citations`.
3. **Pegawai**: log masuk web → carta ringkasan, senarai aduan (tapis status),
   butiran aduan + nota + sejarah status, penggunaan AI & run, pengurusan
   pengguna (peranan dari `@k-aecs/shared` ROLES/PERMISSIONS).

## RBAC & Keselamatan

- Peranan: `kpsti_officer`, `supervisor`, `political_secretary`, `system_admin`.
- Kebenaran: `complaint:view/note/update_status/close/create`,
  `citizen:view`, `knowledge:manage`, `analytics:view`,
  `intelligence:research`, `users:manage`, `system:settings`, `audit:view`.
- Web mewajibkan `session.permissions` untuk halaman (`users:manage` pada
  `/users`); API semak hak melalui JWT.
- Jangan sekali-kali komit `.env` (sekarang di dalam `.gitignore`).
- Bot/API mencari warganegara dengan `createdBy = 'tg:' + telegramUserId`;
  worker memakai konvensyen sama untuk menghantar ke Telegram.

## Alat carian Web (Pi)

`packages/tools` melaksanakan:

- `web_search`: DuckDuckGo HTML (bukan API, tiada kunci) dengan Wikipedia
  sebagai sandaran; had lalai 8 hasil.
- `fetch_url`: pengambilan HTTPS + pengebilan teks (HTML distrip); had
  `DEFAULT_MAX_CHARS=12000`, `MAX_BODY_BYTES=5MB`, tamat masa 20s.

Didaftarkan dalam harness dengan `noTools: "builtin"` supaya hanya alatan
sendiri digunakan; harness **tidak** mengambil sandbox bash.

## Env penting

| Ralat | Default | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://kaecs:kaecs_secret@localhost:5432/kaecs` | PostgreSQL + pgvector |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ |
| `PUBLIC_API_URL` | `http://localhost:3001` | Pangkalan API (untuk bot) |
| `AUTH_SECRET` | — | Sesi JWT >= 16 aksara |
| `TELEGRAM_BOT_TOKEN` | — | Token bot Telegram |
| `AI_CHAT_BASE_URL` | `http://localhost:4000` | Gerbang OpenAI-compatible |
| `AI_CHAT_MODEL` | `qwen3.8-27b` | Model sembang lalai |
| `WEB_SEARCH_PROVIDER` | `duckduckgo` | Cari web (Tavily/Exa opsional) |
| `HARNESS_MAX_TURNS` | `12` | Had giliran Pi |

Senarai penuh dalam `.env.example`.

## Keadaan semasa / nota

- Semua package + app disemak jenis (19 typecheck) dan dibina (12 build).
- Migrasi untuk 20 jadual dihasilkan (`packages/database/src/migrations`).
- Tanpa Docker/DB/Redis setempat, langkah `migrate`/`seed`/run langsung tidak
  dapat diuji di mesin ini; worker keluar dengan kod 1 jika Redis tiada.
- Bot Telegram dikonfigurasi untuk **polling**; endpoint `/api/v1/webhooks/telegram`
  hanya mengakui update (untuk persediaan webhook masa hadapan).
