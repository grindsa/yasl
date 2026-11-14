# YASL

Yet Another Shopping List — shared shopping lists per group, token unlock, YAML storage, no database.

## Stack

- **Next.js** (App Router) + TypeScript + Tailwind
- **Docker Compose** on your own webserver (build on the server, no registry)
- Reverse proxy: **Caddy** (see `docs/Caddyfile.ekz.mewes-im-netz.de`)
- Auth: group tokens in `config/groups.yml` → signed HttpOnly session cookie
- Data: YAML under `/srv/data/yasl` (mounted into the container)

## Local development

```bash
cp .env.example .env
# set AUTH_SECRET (openssl rand -hex 32)

cp config/groups.example.yml config/groups.yml
# set real tokens (≥ 24 characters)

npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Production (manual)

**Step-by-step:** [docs/DEPLOY-manual.md](docs/DEPLOY-manual.md)

| | |
|--|--|
| Stack | `/srv/stacks/yasl` |
| Data | `/srv/data/yasl` |
| URL | `https://ekz.mewes-im-netz.de` |

Kurzfassung:

```bash
git clone <repo> /srv/stacks/yasl
cd /srv/stacks/yasl
cp .env.example .env && $EDITOR .env
cp config/groups.example.yml config/groups.yml && $EDITOR config/groups.yml
mkdir -p /srv/data/yasl
# Caddy-Block aus docs/Caddyfile.ekz.mewes-im-netz.de einbinden + DNS
./deploy.sh
```

### CI deploy secrets (optional, später)

| Secret | Purpose |
|--------|---------|
| `DEPLOY_HOST` | Webserver hostname or IP |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_SSH_KEY` | Private key |
| `DEPLOY_HOST_FINGERPRINT` | Host key fingerprint (required) |
| `DEPLOY_PORT` | Optional SSH port (default `22`) |

## Environment

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Signs the session cookie |
| `SESSION_EPOCH` | Optional; change to log out every device |
| `DATA_DIR` | Inside container: `/app/data` (host: `/srv/data/yasl`) |
| `GROUPS_CONFIG_FILE` | Path to groups YAML (default `config/groups.yml`) |

Group tokens live only in `config/groups.yml` (gitignored).

## Usage

1. Unlock with the group token.
2. Create shopping lists for the group.
3. Type to search the shared article archive and add items.
4. Tap an item on the list to remove it.
5. Top 5 most-added archive items appear under the list.

Phase 2 (not implemented): barcode scan into the archive.
