#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Run this script with sudo.' >&2; exit 1; fi
release_dir="${1:?Usage: install-site.sh /absolute/path/to/release}"
[[ -f "$release_dir/frontend/dist/index.html" ]]
[[ -f "$release_dir/ops/nginx.conf" ]]
release_name="$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 755 /var/www/onehack/releases /etc/nginx/snippets
cp -a "$release_dir/frontend/dist" "/var/www/onehack/releases/$release_name"
chown -R root:root "/var/www/onehack/releases/$release_name"
chmod -R a+rX "/var/www/onehack/releases/$release_name"
ln -sfn "/var/www/onehack/releases/$release_name" /var/www/onehack/current.next
mv -Tf /var/www/onehack/current.next /var/www/onehack/current
# Keep Certbot-managed TLS configuration on subsequent deployments.
if [[ ! -e /etc/nginx/sites-available/onehack.shivang.me ]]; then
  install -m 644 "$release_dir/ops/nginx.conf" /etc/nginx/sites-available/onehack.shivang.me
  ln -s /etc/nginx/sites-available/onehack.shivang.me /etc/nginx/sites-enabled/onehack.shivang.me
fi
nginx -t
systemctl reload nginx
if [[ ! -f /etc/letsencrypt/live/onehack.shivang.me/fullchain.pem ]]; then
  certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d onehack.shivang.me
fi
nginx -t
systemctl reload nginx
curl --fail --silent --show-error https://onehack.shivang.me/healthz
