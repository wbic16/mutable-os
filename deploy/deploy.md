# Deploying mutable-os

`deploy/deploy.sh` is the only supported way to change how mutable-os is
installed on the mutable.phext.io host (the same host as edit.phext.io and
mc.phext.io). It is safe to rerun. A dry run that does not touch the host:

```bash
bash deploy/deploy.sh --check
```

A real run, from a sudo-capable account (not root):

```bash
ssh ubuntu@mc.phext.io
bash /source/mutable-os/deploy/deploy.sh
```

## Port: why 3003

Upstream's server defaults to port 3002 (`server/index.ts`:
`process.env.PORT || 3002` — the `PORT` environment variable is already
honored; no patch was needed). On this host 3002 is already claimed by
mirrorborn.us's `/api/sq` upstream (`sq_cloud`), so mutable-os binds
**3003** instead: the systemd unit sets `Environment=PORT=3003` and nginx
proxies `mutable.phext.io` to `127.0.0.1:3003`.

## What deploy.sh does

Each run, in order:

1. Refuses to run as root. Checks that `SERVICE_USER` exists, `APP_DIR` is a
   git checkout, nginx is installed, and `sudo nginx -t` already succeeds.
   Nothing is written if that test fails.
2. **Stops if the checkout is dirty.** Uncommitted changes on the box are
   never reset away; commit, stash, or clean them first.
3. Fetches `origin/BRANCH` (default `emise/phext-support`) and hard-resets
   `APP_DIR` to it (a pull-side reset, like the phext-lattice deploy).
4. Runs `npm ci`, then `npm run build` with
   `NODE_OPTIONS=--max-old-space-size=2048`: the box has ~3.8 GiB RAM and
   the Vite client build OOMs at Node's default heap size there. Verifies
   `dist/server/index.js` and `dist/index.html` exist.
5. Writes `/etc/systemd/system/mutable-os.service` from
   `deploy/mutable-os.service` (a timestamped `.bak-*` copy is kept when the
   unit changes), `systemctl daemon-reload`, enables the service, and
   **restarts mutable-os**. It waits until `http://127.0.0.1:3003/`
   answers.
6. Reconciles `/etc/nginx/sites-available/DOMAIN` from
   `deploy/nginx-mutable.phext.io.conf` once
   `/etc/letsencrypt/live/DOMAIN` exists. Before the certificate exists it
   writes a short HTTP bootstrap (also marked as managed) so certbot has a
   server block, runs certbot **only when DNS resolves to `EXPECTED_A`**,
   then installs the hardened file. The hardened file is what sets
   `server_tokens off`, the port-80 `return 301`, and
   `Strict-Transport-Security`. `sudo nginx -t` runs before
   `systemctl reload nginx`; if either fails, the previous site file is
   restored and the script exits non-zero.

**DNS not ready is a clean stop, not a failure.** If `mutable.phext.io`
does not yet resolve to `EXPECTED_A` (44.248.235.76), the run installs the
HTTP bootstrap, skips certbot, prints the "point the A record, then rerun"
status, and exits 0. Rerunning after the A record lands finishes the TLS
half.

## Managed-file marker

The first line of a site file this script writes is:

```text
# mutable-os-managed: kind=site file=deploy/nginx-mutable.phext.io.conf template=<sha256> body=<sha256>
```

`body` is the SHA-256 of every byte after that line. The HTTP bootstrap
uses `kind=http-bootstrap` and the same `body=` hash.

On a later run:

- The same bytes: leave the file, ensure the `sites-enabled` symlink, do
  not reload.
- Marker present and `body` still matches the file, but the rendered
  config differs: this script owns it. Back up to
  `sites-available/DOMAIN.bak-<timestamp>`, install the new file,
  `nginx -t`, reload.
- Marker present but `body` does not match (someone edited the file and
  left the marker): refuse.
- No marker: refuse.
- First line is exactly `# Managed by mutable-os deploy/deploy.sh.` (the
  bootstrap written by older revisions of this script): treat it as owned
  and replace it. Certificate paths in that file are kept.

A refused run exits non-zero after mutable-os has already been restarted.
The live nginx file is not modified.

## Latches and overrides

Environment variables override the defaults. Flags override the same names.

| Latch | Default | Effect |
| --- | --- | --- |
| `BRANCH` / `--branch` | `emise/phext-support` | Git branch that is hard-reset and built |
| `PORT` / `--port` | `3003` | mutable-os listen port and nginx `proxy_pass` |
| `DOMAIN` / `--domain` | `mutable.phext.io` | nginx `server_name`, certificate directory, site file name |
| `APP_DIR` | `/source/mutable-os` | Checkout that is reset and built |
| `SERVICE_USER` | `wbic16` | User that owns the checkout and the service process |
| `EXPECTED_A` | `44.248.235.76` | Address `DOMAIN` must resolve to before certbot |
| `BUILD_NODE_OPTIONS` | `--max-old-space-size=2048` | Heap cap for the on-box build (see step 4) |
| `NO_TLS=1` / `--no-tls` | off | Do not run certbot |
| `MUTABLE_NGINX_FORCE=1` / `--force-nginx` | off | Replace a site file the marker does not own. The previous file is copied to `DOMAIN.bak-<timestamp>` first. Any value other than `1` does not force. |
| `--check`, `--dry-run` | off | Render the nginx site, check the marker hash, exercise the latch against temp files, and validate the systemd unit template. No sudo, no build, no restart, no write under `/etc`. |

`DOMAIN` and `PORT` in the template (`mutable.phext.io`, `127.0.0.1:3003`)
are replaced from the script's domain and port. `ssl_certificate` and
`ssl_certificate_key` already present in the live site file are copied into
the rendered file. An `ssl_dhparam` line is omitted when that file is not
on the host.

## Public vs private instances — read this before exposing the server store

Upstream at the commit this branch is based on has **removed** the old
public-hosted read-only mode: `docs/architecture/PERSISTENCE_AND_HISTORY.md`
records that the obsolete `publicHostedVersion` feature switch and the
`SPEEDY_PUBLIC_HOSTED_VERSION` server override "no longer disable
persistence", and a regression test asserts the flag no longer exists.
Normal Mutable servers are writable, and this application ships **no
authentication**.

Consequences for mutable.phext.io as deployed here:

- Do not set `SPEEDY_PUBLIC_HOSTED_VERSION` expecting an effect — at this
  commit it is a dead variable. `deploy.sh` and the unit deliberately do
  not set it.
- Anyone who can reach the site can use the **Server** file actions
  (Open/Save/Save as… against the server's document root under
  `/source/mutable-os/data`). The Local file actions — including phext
  import/export — only ever touch the visitor's own files.
- Treat the public instance as a shared demo with a public scratch space,
  or keep it behind network controls (firewall / VPN / an authenticating
  reverse proxy) if that is not acceptable.

For a **private instance** (for example on a home/ranch host), the same
warning applies in reverse: the server store is fully writable by anyone
who can reach the port, because there is no auth. Bind it to a trusted
network only. (The document/workspace store routers still accept an
explicit `readOnly` option, but `server/index.ts` does not enable it;
turning the public instance read-only would be a deliberate new patch —
see PATCHES.md — not a configuration latch.)

## After a run

```bash
curl -sI https://mutable.phext.io/ | sed -n '1,20p'
# 200 and strict-transport-security max-age=31536000.

curl -sI http://mutable.phext.io/ | head -n 5
# 301 to https://mutable.phext.io/

curl -sI https://mutable.phext.io/ | grep -i '^server:'
# server: nginx   (no version)

sudo certbot renew --dry-run
```

If `nginx -t` fails because `mutable_req` is already defined in another
file, deploy.sh restores the previous site file and stops. A zone name may
be defined once. The duplicate has to be removed from that other file and
`deploy.sh` rerun; the script will not leave the failed file in place.
