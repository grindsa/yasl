# YASL — manueller Erst-Deploy

Ziel:

| Was | Wo |
|-----|-----|
| Stack (Compose, Code, `.env`, `config/`) | `/srv/stacks/yasl` |
| Laufzeitdaten (Listen, Archiv) | `/srv/data/yasl` |
| URL | `https://ekz.mewes-im-netz.de` |
| Upstream | `yasl:3000` im Docker-Netz `proxy` |

Voraussetzungen: Docker + Compose auf dem Server, externes Netz `proxy`, Caddy (oder nginx) im selben Netz, DNS A/AAAA für `ekz.mewes-im-netz.de`.

---

## 1. Repo klonen

```bash
sudo mkdir -p /srv/stacks /srv/data/yasl
sudo chown "$USER":"$USER" /srv/stacks /srv/data/yasl

git clone git@github.com:DEIN_USER/yasl.git /srv/stacks/yasl
cd /srv/stacks/yasl
```

(URL an dein GitHub-Repo anpassen.)

---

## 2. Environment

```bash
cp .env.example .env
openssl rand -hex 32   # Ausgabe als AUTH_SECRET in .env eintragen
$EDITOR .env
```

Mindestens:

```bash
AUTH_SECRET=<32+ hex aus openssl>
```

---

## 3. Gruppen + Tokens

```bash
cp config/groups.example.yml config/groups.yml
$EDITOR config/groups.yml
```

Beispiel:

```yaml
groups:
  - id: home
    name: Familie
    token: "<mindestens-24-zeichen>"
```

Tokens mit z. B. `openssl rand -hex 16` erzeugen. `config/groups.yml` nicht committen.

---

## 4. Datenverzeichnis

```bash
mkdir -p /srv/data/yasl
# Container läuft als uid 1000 (node) — Schreibrecht sicherstellen:
sudo chown -R "$(id -u)":1000 /srv/data/yasl
sudo chmod 775 /srv/data/yasl
```

Compose mountet `/srv/data/yasl` → `/app/data`.

---

## 5. Caddy

Inhalt von [`Caddyfile.ekz.mewes-im-netz.de`](Caddyfile.ekz.mewes-im-netz.de) in die Caddyfile deines Proxy-Stacks übernehmen (derselbe Stack, der im Netz `proxy` hängt).

Kurz:

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

Caddy neu laden (je nach Setup), z. B.:

```bash
cd /srv/stacks/DEIN-PROXY
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
# oder: docker compose up -d
```

---

## 6. DNS

A/AAAA-Record `ekz.mewes-im-netz.de` → Server-IP. Caddy holt das Zertifikat automatisch (Let’s Encrypt), sobald der Block aktiv und Port 80/443 erreichbar sind.

---

## 7. Container bauen und starten

```bash
cd /srv/stacks/yasl
./deploy.sh
```

Erwartetes Ende der Ausgabe: `YASL_DEPLOY_OK`.

Kontrolle:

```bash
docker compose ps
curl -sI https://ekz.mewes-im-netz.de | head
```

Browser: `https://ekz.mewes-im-netz.de` → Zugangscode aus `groups.yml`.

---

## Spätere Updates (manuell)

```bash
cd /srv/stacks/yasl
./deploy.sh
```

`.env`, `config/groups.yml` und `/srv/data/yasl` bleiben erhalten (nicht im Git).
