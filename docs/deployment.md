# Deployment Notes (Ubuntu + Node.js)

## Option A: Docker (recommended for portability)

On any machine with Docker Engine and Compose:

```bash
docker compose up -d --build
```

Use `.env.docker.example` as a template (rename/copy to `.env` next to `docker-compose.yml`) and set at least `SESSION_SECRET` and production `NEXT_PUBLIC_APP_URL` before going live.

Moving to Ubuntu later:

1. Copy the project directory (or build/push the image to a private registry).
2. On the server, install Docker Engine + Compose plugin.
3. Copy `.env` with production secrets.
4. Run `docker compose up -d --build`.

You can also save/load an image without a registry: `docker save` / `docker load`.

---

## Option B: Bare metal Node.js on Ubuntu

## 1) System prerequisites

- Ubuntu 22.04+ server
- Node.js 22 LTS
- PostgreSQL 15+ (local or remote)
- Nginx

## 2) App setup

```bash
sudo mkdir -p /opt/timeboard
sudo chown -R $USER:$USER /opt/timeboard
cd /opt/timeboard
git clone <your-repo-url> .
npm install
npm run build
```

Create `/opt/timeboard/.env.local`:

```bash
DATABASE_URL=postgres://timeboard:***@127.0.0.1:5432/timeboard
SESSION_SECRET=<long-random-secret>
NEXT_PUBLIC_APP_URL=https://timeboard.yourcompany.local

EMAIL_PROVIDER=smtp
EMAIL_FROM=TimeBoard <timeboard@yourcompany.local>
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=timeboard@yourcompany.local
SMTP_PASSWORD=<smtp-password>
```

## 3) Database migrations

Run migrations in order:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_internal_auth_and_settings.sql`
3. `supabase/migrations/0003_bootstrap_seed.sql`

After first login, immediately change the seeded admin password.

## 4) systemd service

Create `/etc/systemd/system/timeboard.service`:

```ini
[Unit]
Description=TimeBoard Next.js server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/timeboard
Environment=NODE_ENV=production
EnvironmentFile=/opt/timeboard/.env.local
ExecStart=/usr/bin/npm run start -- -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable timeboard
sudo systemctl start timeboard
sudo systemctl status timeboard
```

## 5) Nginx reverse proxy

Create `/etc/nginx/sites-available/timeboard`:

```nginx
server {
    listen 80;
    server_name timeboard.yourcompany.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/timeboard /etc/nginx/sites-enabled/timeboard
sudo nginx -t
sudo systemctl reload nginx
```

## 6) TLS (internal CA or Let's Encrypt)

- Install certs for `timeboard.yourcompany.local`.
- Redirect HTTP to HTTPS once certs are available.
- Ensure `NEXT_PUBLIC_APP_URL` uses `https://`.


---

## Scheduled tasks (required)

**Without these, two features are silently dead.** They were dead in production
until 2026-08-06: there was no cron and no systemd timer on the host, so
out-of-office entries were never reconciled (a user clearing their Outlook
auto-reply stayed "out" until an admin clicked Sync by hand) and reminders —
clock-in/out nudges, escalations, understaffing alerts — never sent at all. The
code was correct the whole time; nothing invoked it.

Both endpoints authenticate with `CRON_SECRET` from `.env.local`, using
different conventions:

| Endpoint | Auth header | Frequency |
|---|---|---|
| `/api/reminders/send` | `Authorization: Bearer $CRON_SECRET` | every 5 min |
| `/api/admin/oof-sync` | `x-cron-secret: $CRON_SECRET` | hourly |

Install on a fresh host:

```bash
install -m 755 scripts/scheduled-tasks.sh /opt/teampulse/scripts/scheduled-tasks.sh
cp deploy/systemd/teampulse-*.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now teampulse-reminders.timer teampulse-oof.timer
```

Verify — a passing timer list is not proof the unit works, so run one directly:

```bash
systemctl list-timers 'teampulse-*'
systemctl start teampulse-oof.service && journalctl -u teampulse-oof.service -n 5 --no-pager
```

`Persistent=true` means a run missed while the host was down fires on boot.
