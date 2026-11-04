#!/usr/bin/env bash
# Deploy mutable-os at mutable.phext.io with the nginx already on this host.
# Idempotent: run it again to rebuild the branch, restart mutable-os, and
# reconcile the nginx site. Latches and the managed-file marker are
# documented in deploy/deploy.md.
#
#   bash deploy/deploy.sh [--check] [--no-tls] [--force-nginx]
#                         [--domain mutable.phext.io] [--port 3003]
#                         [--branch emise/phext-support]
#
# Run as a sudo-capable account (ubuntu), except --check / --dry-run, which
# do not touch the host. The checkout, build, and service belong to
# SERVICE_USER (wbic16).
#
# What it touches:
#   /etc/systemd/system/mutable-os.service   (backed up when it changes)
#   /etc/nginx/sites-{available,enabled}/DOMAIN
#       (deploy/nginx-mutable.phext.io.conf once TLS exists; an HTTP
#        bootstrap before that. A hand-edited file is left in place unless
#        MUTABLE_NGINX_FORCE=1 or --force-nginx.)
set -euo pipefail

BRANCH="${BRANCH:-emise/phext-support}"
PORT="${PORT:-3003}"
DOMAIN="${DOMAIN:-mutable.phext.io}"
EXPECTED_A="${EXPECTED_A:-44.248.235.76}"
APP_DIR="${APP_DIR:-/source/mutable-os}"
SERVICE_USER="${SERVICE_USER:-wbic16}"
NO_TLS="${NO_TLS:-0}"
# The build box has ~3.8 GiB RAM; the Vite client build OOMs at Node's
# default heap there, so cap the build's old-space explicitly.
BUILD_NODE_OPTIONS="${BUILD_NODE_OPTIONS:---max-old-space-size=2048}"
# 1 replaces a site file this script does not own. Anything else does not.
NGINX_FORCE=0
if [[ "${MUTABLE_NGINX_FORCE:-0}" == "1" ]]; then
  NGINX_FORCE=1
fi
CHECK=0
# First line of site files written by older revisions of this script.
LEGACY_MARK='# Managed by mutable-os deploy/deploy.sh.'
MANAGED_MARK='# mutable-os-managed:'

SERVICE="mutable-os.service"
UNIT_PATH="/etc/systemd/system/${SERVICE}"

die() {
  printf 'deploy.sh: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Deploy mutable-os at mutable.phext.io with the nginx already on this host.
Idempotent: run it again to rebuild the branch, restart mutable-os, and
reconcile the nginx site. Latches and the managed-file marker are
documented in deploy/deploy.md.

  bash deploy/deploy.sh [--check] [--no-tls] [--force-nginx]
                        [--domain NAME] [--port N] [--branch NAME]

--check, --dry-run   Render the nginx site and self-test the file latch.
                     Does not build, restart, or write outside a temp dir.
--force-nginx        Replace a hand-edited nginx site (same as
                     MUTABLE_NGINX_FORCE=1). The previous file is kept
                     beside it as a .bak-* copy.
--no-tls             Do not run certbot.

Run as a sudo-capable account, not root. --check does not need sudo.
EOF
}

as_owner() {
  sudo -u "$SERVICE_USER" -H env PATH="/usr/local/bin:/usr/bin:/bin:${PATH}" "$@"
}

dns_points_here() {
  getent ahosts "$DOMAIN" 2>/dev/null | awk '$1 !~ /:/ { print $1 }' | grep -qx "$EXPECTED_A"
}

file_sha256() {
  sha256sum "$1" | awk '{print $1}'
}

# sudo cannot change the shell redirect, so read as root and write the temp
# file as the user running this script.
read_root_file() {
  local src=$1 dest=$2
  sudo cat -- "$src" | tee "$dest" >/dev/null
}

nginx_template() {
  local candidate="${APP_DIR}/deploy/nginx-mutable.phext.io.conf"
  if [[ -f "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  local beside
  beside="$(cd "$(dirname "$0")" && pwd)/nginx-mutable.phext.io.conf"
  if [[ -f "$beside" ]]; then
    printf '%s\n' "$beside"
    return 0
  fi
  die "cannot find deploy/nginx-mutable.phext.io.conf"
}

unit_template() {
  local candidate="${APP_DIR}/deploy/mutable-os.service"
  if [[ -f "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi
  local beside
  beside="$(cd "$(dirname "$0")" && pwd)/mutable-os.service"
  if [[ -f "$beside" ]]; then
    printf '%s\n' "$beside"
    return 0
  fi
  die "cannot find deploy/mutable-os.service"
}

# Copy the template, fill DOMAIN and PORT, keep live certificate paths, and
# drop ssl_dhparam when its file is not on this machine.
render_site_body() {
  local template=$1 current=$2 dest=$3
  sed \
    -e "s/mutable\\.phext\\.io/${DOMAIN}/g" \
    -e "s/127\\.0\\.0\\.1:3003/127.0.0.1:${PORT}/g" \
    "$template" >"$dest"
  if [[ -n "$current" && -f "$current" ]]; then
    adopt_live_ssl "$current" "$dest"
  fi
  drop_missing_dhparam "$dest"
}

adopt_live_ssl() {
  local current=$1 dest=$2 cert="" key=""
  cert=$(awk '
    /^[[:space:]]*ssl_certificate_key[[:space:]]/ { next }
    /^[[:space:]]*ssl_certificate[[:space:]]/ {
      sub(/^[[:space:]]*ssl_certificate[[:space:]]+/, "")
      sub(/[[:space:]]*;[[:space:]]*$/, "")
      print
      exit
    }
  ' "$current")
  key=$(awk '
    /^[[:space:]]*ssl_certificate_key[[:space:]]/ {
      sub(/^[[:space:]]*ssl_certificate_key[[:space:]]+/, "")
      sub(/[[:space:]]*;[[:space:]]*$/, "")
      print
      exit
    }
  ' "$current")
  [[ -n "$cert" && -n "$key" ]] || return 0
  local tmp
  tmp=$(mktemp)
  awk -v cert="$cert" -v key="$key" '
    /^[[:space:]]*ssl_certificate_key[[:space:]]/ {
      print "    ssl_certificate_key " key ";"
      next
    }
    /^[[:space:]]*ssl_certificate[[:space:]]/ {
      print "    ssl_certificate     " cert ";"
      next
    }
    { print }
  ' "$dest" >"$tmp"
  mv "$tmp" "$dest"
}

path_exists() {
  if [[ "$CHECK" == "1" ]]; then
    [[ -f "$1" ]]
  else
    sudo test -f "$1"
  fi
}

drop_missing_dhparam() {
  local dest=$1 line path tmp
  line=$(sed -n 's/^[[:space:]]*ssl_dhparam[[:space:]]\+\([^;]*\);/\1/p' "$dest" | head -n 1 || true)
  [[ -n "$line" ]] || return 0
  path=$line
  if path_exists "$path"; then
    return 0
  fi
  tmp=$(mktemp)
  grep -v '^[[:space:]]*ssl_dhparam[[:space:]]' "$dest" >"$tmp" || true
  mv "$tmp" "$dest"
}

stamp_managed() {
  local body=$1 dest=$2 extra=$3 sum
  sum=$(file_sha256 "$body")
  {
    printf '%s %s body=%s\n' "$MANAGED_MARK" "$extra" "$sum"
    cat "$body"
  } >"$dest"
}

write_bootstrap_body() {
  local dest=$1
  cat >"$dest" <<EOF
# HTTP bootstrap so certbot has a server block. deploy.sh replaces this
# with deploy/nginx-mutable.phext.io.conf once /etc/letsencrypt/live/${DOMAIN}
# exists. That file is what redirects port 80 and sets HSTS.
limit_req_zone \$binary_remote_addr zone=mutable_req:10m rate=20r/s;

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    server_tokens off;
    client_max_body_size 16M;

    location / {
        limit_req zone=mutable_req burst=60 nodelay;
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
}

# install, update, keep, or refuse. A file this script wrote (marker hash
# still matches the bytes under it, or the legacy first line) may be replaced.
# Anything else is refuse, including a managed file whose body was edited.
nginx_disposition() {
  local current=$1 rendered=$2 first="" recorded="" body_copy="" body_hash=""
  if [[ ! -f "$current" ]]; then
    printf 'install\n'
    return 0
  fi
  if cmp -s "$current" "$rendered"; then
    printf 'keep\n'
    return 0
  fi
  IFS= read -r first <"$current" || true
  if [[ "$first" == "$LEGACY_MARK" ]]; then
    printf 'update\n'
    return 0
  fi
  case "$first" in
    "${MANAGED_MARK}"*) ;;
    *)
      printf 'refuse\n'
      return 0
      ;;
  esac
  recorded=$(printf '%s\n' "$first" | sed -n 's/.* body=\([0-9a-f]\{64\}\).*/\1/p')
  body_copy=$(mktemp)
  tail -n +2 "$current" >"$body_copy"
  body_hash=$(file_sha256 "$body_copy")
  rm -f "$body_copy"
  if [[ -n "$recorded" && "$recorded" == "$body_hash" ]]; then
    printf 'update\n'
  else
    printf 'refuse\n'
  fi
}

with_force() {
  local action=$1
  if [[ "$action" == "refuse" && "$NGINX_FORCE" == "1" ]]; then
    printf 'update\n'
  else
    printf '%s\n' "$action"
  fi
}

require_hardened_body() {
  local file=$1
  grep -qF 'server_tokens off;' "$file" || die "rendered nginx site is missing server_tokens off"
  grep -qF "return 301 https://${DOMAIN}\$request_uri;" "$file" \
    || die "rendered nginx site is missing the port-80 redirect"
  grep -qF 'Strict-Transport-Security' "$file" || die "rendered nginx site is missing HSTS"
  grep -qF 'limit_req zone=mutable_req' "$file" || die "rendered nginx site is missing the site limit_req"
  grep -qF "proxy_pass http://127.0.0.1:${PORT};" "$file" || die "rendered nginx site is missing proxy_pass"
  awk '
    /listen 80;/ { in80 = 1 }
    in80 && /proxy_pass/ { bad = 1 }
    in80 && /^}/ { in80 = 0 }
    END { exit bad ? 1 : 0 }
  ' "$file" || die "rendered port-80 server proxies instead of redirecting"
}

install_rendered_site() {
  local rendered=$1 label=$2
  local backup="" created=0
  if sudo test -f "$available"; then
    backup="${available}.bak-${stamp}"
    sudo cp -a "$available" "$backup"
    printf 'backed up nginx site to %s\n' "$backup"
  else
    created=1
  fi
  sudo install -m 644 "$rendered" "$available"
  sudo ln -sfn "$available" "$enabled"
  if ! sudo nginx -t; then
    printf 'nginx -t failed; restoring %s\n' "$available" >&2
    if [[ "$created" == "1" ]]; then
      sudo rm -f "$available" "$enabled"
    else
      sudo cp -a "$backup" "$available"
    fi
    die "nginx rejected ${label}; previous site file restored and not reloaded"
  fi
  if ! sudo systemctl reload nginx; then
    printf 'nginx reload failed; restoring %s\n' "$available" >&2
    if [[ "$created" == "1" ]]; then
      sudo rm -f "$available" "$enabled"
    else
      sudo cp -a "$backup" "$available"
    fi
    sudo systemctl reload nginx || true
    die "nginx reload failed for ${label}; previous site file restored"
  fi
  printf 'nginx reloaded (%s)\n' "$label"
}

apply_rendered_site() {
  local rendered=$1 label=$2 owned=$3
  local current action raw
  current=$(mktemp)
  if sudo test -f "$available"; then
    read_root_file "$available" "$current"
  else
    rm -f "$current"
  fi
  if [[ "$owned" == "1" ]]; then
    if [[ -f "$current" ]] && cmp -s "$current" "$rendered"; then
      action=keep
    else
      action=update
    fi
    raw=$action
  elif [[ -f "$current" ]]; then
    action=$(nginx_disposition "$current" "$rendered")
    raw=$action
    action=$(with_force "$action")
  else
    action=install
    raw=$action
  fi
  case "$action" in
    keep)
      sudo ln -sfn "$available" "$enabled"
      printf 'nginx site already current (%s)\n' "$label"
      nginx_result="current ${label}"
      ;;
    install | update)
      if [[ "$raw" == "refuse" ]]; then
        printf 'MUTABLE_NGINX_FORCE: replacing %s\n' "$available"
      fi
      install_rendered_site "$rendered" "$label"
      nginx_result="reloaded ${label}"
      ;;
    refuse)
      rm -f "$current"
      die "refusing to overwrite ${available}: it has no deploy.sh marker, or the marker hash does not match the file (it was edited). Set MUTABLE_NGINX_FORCE=1 or pass --force-nginx to replace it. A .bak copy is kept when that latch is set."
      ;;
    *)
      rm -f "$current"
      die "internal: bad nginx action ${action}"
      ;;
  esac
  rm -f "$current"
}

run_check() {
  local template body rendered current work
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required"
  template=$(nginx_template)
  work=$(mktemp -d)
  body="${work}/body"
  rendered="${work}/rendered"
  current="${work}/current"
  render_site_body "$template" "" "$body"
  require_hardened_body "$body"
  local template_sum
  template_sum=$(file_sha256 "$template")
  stamp_managed "$body" "$rendered" "kind=site file=deploy/nginx-mutable.phext.io.conf template=${template_sum}"
  local marked_hash body_hash
  marked_hash=$(sed -n '1s/.* body=\([0-9a-f]\{64\}\).*/\1/p' "$rendered")
  tail -n +2 "$rendered" >"${work}/tailed"
  body_hash=$(file_sha256 "${work}/tailed")
  [[ "$marked_hash" == "$body_hash" ]] || die "managed marker hash does not match the rendered body"
  [[ "$(nginx_disposition "$rendered" "$rendered")" == "keep" ]] || die "identical managed file was not kept"

  printf 'changed-body\n' >>"$body"
  stamp_managed "$body" "$current" "kind=site file=deploy/nginx-mutable.phext.io.conf template=old"
  [[ "$(nginx_disposition "$current" "$rendered")" == "update" ]] || die "intact managed file was not updated"

  printf 'hand edit\n' >>"$current"
  [[ "$(nginx_disposition "$current" "$rendered")" == "refuse" ]] || die "tampered managed file was not refused"
  [[ "$(with_force "$(nginx_disposition "$current" "$rendered")")" == "refuse" ]] || die "tampered file ignored the latch default"
  NGINX_FORCE=1
  [[ "$(with_force "$(nginx_disposition "$current" "$rendered")")" == "update" ]] || die "MUTABLE_NGINX_FORCE did not allow replacement"
  NGINX_FORCE=0
  if [[ "${MUTABLE_NGINX_FORCE:-0}" == "1" ]]; then
    NGINX_FORCE=1
  fi

  printf 'not ours\n' >"$current"
  [[ "$(nginx_disposition "$current" "$rendered")" == "refuse" ]] || die "unmarked file was not refused"

  printf '%s\nrest of the old bootstrap\n' "$LEGACY_MARK" >"$current"
  [[ "$(nginx_disposition "$current" "$rendered")" == "update" ]] || die "legacy managed file was not updated"

  local custom="${work}/custom"
  cat >"$custom" <<EOF
    ssl_certificate     /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/custom/privkey.pem;
EOF
  render_site_body "$template" "$custom" "$body"
  grep -qF '/etc/custom/privkey.pem' "$body" || die "live ssl_certificate_key was not kept"
  grep -qF "live/${DOMAIN}/fullchain.pem" "$body" || die "live ssl_certificate was not kept"

  local dh="${work}/no-dh"
  printf 'ssl_dhparam %s/missing.pem;\nserver_tokens off;\n' "$work" >"$dh"
  drop_missing_dhparam "$dh"
  grep -q ssl_dhparam "$dh" && die "missing ssl_dhparam file was kept"
  printf 'ssl_dhparam %s/present.pem;\n' "$work" >"$dh"
  : >"${work}/present.pem"
  drop_missing_dhparam "$dh"
  grep -q ssl_dhparam "$dh" || die "present ssl_dhparam file was dropped"

  # The systemd unit template must carry the service contract.
  local unit
  unit=$(unit_template)
  grep -qF "User=${SERVICE_USER}" "$unit" || die "unit template is missing User=${SERVICE_USER}"
  grep -qF "WorkingDirectory=${APP_DIR}" "$unit" || die "unit template is missing WorkingDirectory=${APP_DIR}"
  grep -qF "Environment=PORT=${PORT}" "$unit" || die "unit template is missing Environment=PORT=${PORT}"
  grep -qF "ExecStart=/usr/bin/node ${APP_DIR}/dist/server/index.js" "$unit" \
    || die "unit template is missing the expected ExecStart"
  grep -qF 'NoNewPrivileges=true' "$unit" || die "unit template is missing NoNewPrivileges=true"

  rm -rf "$work"
  printf 'deploy.sh --check: nginx render, marker hash, latch, and unit ok\n'
  printf '  template:  %s\n' "$template"
  printf '  domain:    %s\n' "$DOMAIN"
  printf '  port:      %s\n' "$PORT"
  printf '  would write %s with the managed marker after a real run\n' "/etc/nginx/sites-available/${DOMAIN}"
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain) DOMAIN=${2:?--domain needs a value}; shift 2 ;;
      --port) PORT=${2:?--port needs a value}; shift 2 ;;
      --branch) BRANCH=${2:?--branch needs a value}; shift 2 ;;
      --no-tls) NO_TLS=1; shift ;;
      --force-nginx) NGINX_FORCE=1; shift ;;
      --check | --dry-run) CHECK=1; shift ;;
      -h | --help) usage; exit 0 ;;
      *) die "unknown argument: $1 (try --help)" ;;
    esac
  done

  [[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "DOMAIN must be a hostname (got ${DOMAIN})."
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "PORT must be a number (got ${PORT})."
  if [[ "$CHECK" == "1" ]]; then
    run_check
    return 0
  fi

  [[ "${EUID}" -ne 0 ]] || die "do not run as root; run as a sudo-capable user."
  id "$SERVICE_USER" >/dev/null 2>&1 || die "service user ${SERVICE_USER} does not exist."
  [[ -d "$APP_DIR/.git" ]] || die "${APP_DIR} is not a git checkout."

  # sudo -v asks for a password whenever any sudoers rule needs one, even
  # with NOPASSWD: ALL alongside it, so try a no-op first.
  sudo -n true 2>/dev/null || sudo -v
  command -v nginx >/dev/null 2>&1 || [[ -x /usr/sbin/nginx ]] || die "nginx is not installed."
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required"
  command -v node >/dev/null 2>&1 || die "node is not installed."
  sudo nginx -t || die "nginx -t fails on the existing config. Nothing was changed."

  # ── Build ──
  # A dirty checkout is a stop, not something to reset away: the reset below
  # would destroy uncommitted work on the box.
  if [[ -n "$(as_owner git -C "$APP_DIR" status --porcelain)" ]]; then
    die "${APP_DIR} has uncommitted changes; refusing to reset it. Commit, stash, or clean it first."
  fi
  as_owner git -C "$APP_DIR" fetch origin "$BRANCH"
  as_owner git -C "$APP_DIR" checkout -B "$BRANCH" "origin/${BRANCH}"
  as_owner git -C "$APP_DIR" reset --hard "origin/${BRANCH}"
  local commit
  commit=$(as_owner git -C "$APP_DIR" rev-parse --short HEAD)
  printf 'Building %s\n' "$commit"
  as_owner env --chdir="$APP_DIR" npm ci
  as_owner env --chdir="$APP_DIR" NODE_OPTIONS="$BUILD_NODE_OPTIONS" npm run build
  [[ -f "${APP_DIR}/dist/server/index.js" ]] || die "server build was not produced (dist/server/index.js missing)."
  [[ -f "${APP_DIR}/dist/index.html" ]] || die "client build was not produced (dist/index.html missing)."

  # ── systemd ──
  local unit_tmp unit_src
  unit_src=$(unit_template)
  unit_tmp=$(mktemp)
  sed \
    -e "s|/source/mutable-os|${APP_DIR}|g" \
    -e "s|Environment=PORT=3003|Environment=PORT=${PORT}|" \
    -e "s|^User=wbic16|User=${SERVICE_USER}|" \
    "$unit_src" >"$unit_tmp"
  if sudo test -f "$UNIT_PATH" && ! sudo cmp -s "$unit_tmp" "$UNIT_PATH"; then
    sudo cp -a "$UNIT_PATH" "${UNIT_PATH}.bak-$(date +%Y%m%d%H%M%S)"
  fi
  sudo install -m 644 "$unit_tmp" "$UNIT_PATH"
  rm -f "$unit_tmp"
  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE" >/dev/null
  sudo systemctl restart "$SERVICE"

  local ok=0 attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 2 -o /dev/null "http://127.0.0.1:${PORT}/"; then ok=1; break; fi
    printf 'waiting for mutable-os (%s/30)\n' "$attempt"
    sleep 1
  done
  if [[ "$ok" != "1" ]]; then
    sudo journalctl -u "$SERVICE" -n 30 --no-pager || true
    die "mutable-os did not answer on 127.0.0.1:${PORT}"
  fi

  # ── nginx site ──
  # mutable-os was restarted above, so the process behind the proxy is the
  # build this run just produced. nginx is reloaded only after `nginx -t`.
  local available="/etc/nginx/sites-available/${DOMAIN}"
  local enabled="/etc/nginx/sites-enabled/${DOMAIN}"
  local stamp nginx_result="unchanged" tls="no" owned=0 skip_certbot=0
  local template body rendered current_copy first_line
  stamp=$(date +%Y%m%d%H%M%S)
  template=$(nginx_template)
  body=$(mktemp)
  rendered=$(mktemp)
  current_copy=$(mktemp)
  if sudo test -f "$available"; then
    read_root_file "$available" "$current_copy"
  else
    rm -f "$current_copy"
  fi

  if sudo test -d "/etc/letsencrypt/live/${DOMAIN}"; then
    tls="yes"
  fi

  # Certbot's nginx plugin needs a server block. Write the HTTP bootstrap
  # only when this script already owns the file (or there is no file yet).
  # A hand-edited site is not replaced here.
  if [[ "$tls" != "yes" ]]; then
    local bootstrap
    bootstrap=$(mktemp)
    write_bootstrap_body "$body"
    stamp_managed "$body" "$bootstrap" "kind=http-bootstrap"
    if [[ -f "$current_copy" ]]; then
      first_line=""
      IFS= read -r first_line <"$current_copy" || true
    else
      first_line=""
    fi
    if [[ "$first_line" == *"kind=site"* && "$first_line" == *"file=deploy/nginx-mutable.phext.io.conf"* ]]; then
      printf 'TLS directory for %s is missing; leaving the hardened nginx site in place.\n' "$DOMAIN"
      nginx_result="left hardened site (no TLS directory)"
      skip_certbot=1
    elif [[ "$first_line" == "$LEGACY_MARK" ]]; then
      owned=1
      printf 'existing nginx site is the previous deploy.sh bootstrap; certbot may edit it\n'
    else
      apply_rendered_site "$bootstrap" "http bootstrap" 0
      owned=1
    fi
    rm -f "$bootstrap"
  fi

  if [[ "$skip_certbot" == "1" ]]; then
    printf 'Skipping certbot; the hardened site file is already installed.\n'
  elif [[ "$tls" != "yes" && "$NO_TLS" == "1" ]]; then
    printf 'Skipping certbot (--no-tls).\n'
  elif [[ "$tls" != "yes" ]] && ! dns_points_here; then
    # DNS not ready is a clean stopping point, not a failure: the HTTP
    # bootstrap is installed, the service is up, and a rerun after the A
    # record lands will finish the TLS half.
    printf '%s does not resolve to %s yet. Add the A record, then rerun this script.\n' "$DOMAIN" "$EXPECTED_A" >&2
  elif [[ "$tls" != "yes" ]]; then
    if sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --register-unsafely-without-email; then
      tls="yes"
    else
      printf 'certbot failed; the HTTP site is still in place.\n' >&2
    fi
  fi

  if sudo test -d "/etc/letsencrypt/live/${DOMAIN}"; then
    tls="yes"
  fi

  if [[ "$tls" == "yes" ]]; then
    if sudo test -f "$available"; then
      read_root_file "$available" "$current_copy"
    else
      rm -f "$current_copy"
    fi
    render_site_body "$template" "$current_copy" "$body"
    require_hardened_body "$body"
    local template_sum
    template_sum=$(file_sha256 "$template")
    stamp_managed "$body" "$rendered" "kind=site file=deploy/nginx-mutable.phext.io.conf template=${template_sum}"
    # `owned` means the bytes on disk started this run as our bootstrap (or
    # we just wrote them). certbot may have edited them; still replace with
    # the hardened site. A file we did not own goes through the latch.
    apply_rendered_site "$rendered" "deploy/nginx-mutable.phext.io.conf" "$owned"
  fi
  rm -f "$body" "$rendered" "$current_copy"

  printf '\nmutable-os deploy\n'
  printf '  commit:    %s\n' "$commit"
  printf '  service:   %s (%s)\n' "$SERVICE" "$(systemctl is-active "$SERVICE")"
  printf '  listen:    127.0.0.1:%s\n' "$PORT"
  printf '  nginx:     %s (%s)\n' "$available" "$nginx_result"
  printf '  tls:       %s\n' "$tls"
  if [[ "$tls" != "yes" ]]; then
    printf '  next:      point %s at %s, then rerun this script for TLS\n' "$DOMAIN" "$EXPECTED_A"
  fi
}

main "$@"
