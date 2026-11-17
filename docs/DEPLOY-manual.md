# YASL — manual first deploy

Target layout:

| What | Where |
|------|-------|
| Stack (Compose, code, `.env`, `config/`) | `/srv/stacks/yasl` |
| Runtime data (lists, archive) | `/srv/data/yasl` |
| URL | `https://ekz.mewes-im-netz.de` |
| Upstream | `yasl:3000` on Docker network `proxy` |

Prerequisites: Docker + Compose on the server, external network `proxy`, Caddy (or nginx) on the same network, DNS A/AAAA for `ekz.mewes-im-netz.de`.

---

## 1. Clone the repo

```bash
sudo mkdir -p /srv/stacks /srv/data/yasl
sudo chown "$USER":"$USER" /srv/stacks /srv/data/yasl

git clone git@github.com:YOUR_USER/yasl.git /srv/stacks/yasl
cd /srv/stacks/yasl
```

(Adjust the URL to your GitHub repo.)

---

## 2. Environment

```bash
cp .env.example .env
openssl rand -hex 32   # paste the output as AUTH_SECRET in .env
$EDITOR .env
```

Minimum:

```bash
AUTH_SECRET=<32+ hex from openssl>
```

---

## 3. Groups + tokens

```bash
cp config/groups.example.yml config/groups.yml
$EDITOR config/groups.yml
```

Example:

```yaml
groups:
  - id: home
    name: Familie
    token: "<at-least-24-characters>"
    notifications:
      enabled: true
      debounceSeconds: 120
```

Generate tokens with e.g. `openssl rand -hex 16`. Do not commit `config/groups.yml`.

For push: run `npx web-push generate-vapid-keys` once and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (plus optional `VAPID_SUBJECT`) in `.env`.

---

## 4. Data directory

```bash
mkdir -p /srv/data/yasl
# Container runs as uid 1000 (node) — ensure write access:
sudo chown -R "$(id -u)":1000 /srv/data/yasl
sudo chmod 775 /srv/data/yasl
```

Compose mounts `/srv/data/yasl` → `/app/data`.

---

## 5. Caddy

Copy the contents of [`Caddyfile.ekz.mewes-im-netz.de`](Caddyfile.ekz.mewes-im-netz.de) into the Caddyfile of your proxy stack (the same stack attached to the `proxy` network).

Short version:

```caddy
ekz.mewes-im-netz.de {
	encode zstd gzip
	handle {
		reverse_proxy yasl:3000 {
			flush_interval -1
		}
	}
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}
}
```

Reload Caddy (depending on your setup), e.g.:

```bash
cd /srv/stacks/YOUR-PROXY
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
# or: docker compose up -d
```

---

## 6. DNS

A/AAAA record `ekz.mewes-im-netz.de` → server IP. Caddy obtains the certificate automatically (Let’s Encrypt) once the block is active and ports 80/443 are reachable.

---

## 7. Build and start the container

```bash
cd /srv/stacks/yasl
./deploy.sh
```

Expected end of output: `YASL_DEPLOY_OK`.

Verify:

```bash
docker compose ps
curl -sI https://ekz.mewes-im-netz.de | head
```

Browser: `https://ekz.mewes-im-netz.de` → access token from `groups.yml`.

---

## Later updates (manual)

```bash
cd /srv/stacks/yasl
./deploy.sh
```

`.env`, `config/groups.yml`, and `/srv/data/yasl` are preserved (not in Git).
