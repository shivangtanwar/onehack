# Hosting the testnet application

Live site: https://onehack.shivang.me. Ethereum Sepolia (11155111) and Base Sepolia (84532) only. Hosting is hardened for a public demo; the contracts remain an unaudited hackathon prototype.

## Build and install

Use Node 22, `npm ci`, `npm --prefix frontend ci`, and `npm run frontend:build`. The public build uses the checked-in Sepolia configuration; do not copy the local development `.env.example` into a public build.

Copy `frontend/dist/` and `ops/` to a release directory on the host, then run `sudo bash ops/install-site.sh /absolute/path/to/release`. The installer uses a dedicated Nginx virtual host, retains versioned assets under `/var/www/onehack/releases`, switches the `current` symlink, validates Nginx before reload, and obtains HTTPS with Certbot. Existing unrelated virtual hosts are untouched. Certbot's system timer renews certificates.

On subsequent releases, the existing Certbot-managed virtual host is preserved. If security headers or RPC allowlists change, review and apply those changes to the virtual host explicitly. Roll back by pointing `/var/www/onehack/current` at a prior release and reloading Nginx after `nginx -t`.

## Background relay

The worker watches only the two applications in `deployments/sepolia.json` and `deployments/baseSepolia.json`. It checks RPC chain IDs, messenger signer and domain, source receipt/block hash, destination, expiry, and exact ordered nonces. It waits for at least 12 source confirmations before signing and relaying. These are confirmation-based finality assumptions, not a consensus light client.

Provision only the disposable testnet attestor key in `runtime/attestor` (mode 600). Keep the deployer key off the server. Create `runtime/state` owned by the service user, then:

```bash
RELAYER_UID=$(id -u) RELAYER_GID=$(id -g) docker compose -p onehack -f ops/compose.yml up -d --build
docker logs --tail 30 onehack-relayer
docker inspect --format '{{.State.Health.Status}}' onehack-relayer
cat runtime/state/health.json
```

The service has no published ports, runs as a non-root UID with a read-only filesystem, drops capabilities, mounts the key read-only, limits CPU/memory, rotates logs, and restarts after process/host failure. Its runtime uses a separate lockfile containing only ethers, dotenv and tsx. Keep exactly one worker per deployment. State is recovered using persistent block cursors and on-chain nonces.

If Docker reports unhealthy, inspect `health.json` and logs. Unhealthy status is an operator signal; Docker does not automatically restart a running unhealthy container. Check RPC availability, signer gas on both networks, and pending transaction receipts. An expired or invalid next message is deliberately not skipped: this contract version has no cancellation or nonce-repair protocol, so a blocked ordered route requires operator investigation and potentially a new testnet deployment. Never fabricate an attestation to move its nonce.

The 180-second loan term is deliberate for the demo. Loan creation normally takes several minutes because Sepolia needs 12 source confirmations. Repayment also requires the return message to be relayed before collateral is released. No real-value assets are supported.

## Verification

Check HTTP redirects to HTTPS, `/healthz` returns 200, `/` and `/#borrow` load, hashed assets are cached, and browser network reads succeed. `/healthz` covers web serving only; Docker health covers the relay. Never put signing keys into `VITE_*` variables or frontend/public.
