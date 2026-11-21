#!/bin/bash
# Runs the real local Aqua server (website, API and device endpoint in one) from local/farm.env.
#   ./run-farm.sh          listens on this laptop only (127.0.0.1), safe on any Wi-Fi
#   ./run-farm.sh --lan    listens on the whole network so boards on the farm Wi-Fi can reach it
# The website is at http://127.0.0.1:8800 (or http://<laptop address>:8800 from the farm network).
set -eu
cd "$(dirname "$0")/backend"
HOST=127.0.0.1
if [ "${1:-}" = "--lan" ]; then
  HOST=0.0.0.0
  echo "LAN mode: anyone on the current Wi-Fi can reach this server. Use it on the farm network only." >&2
fi
# the database lives on the VPS: open the SSH tunnel to it if it is not open yet
if grep -q "@127.0.0.1:5434/" ../local/farm.env && ! ss -ltn | grep -q "127.0.0.1:5434 "; then
  ssh -f -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \
      -L 127.0.0.1:5434:127.0.0.1:5434 uwuser@s.mavubo.com || { echo "could not open the tunnel to the VPS database" >&2; exit 1; }
fi
[ -d ../web/dist ] || { echo "web/dist is missing: run 'npm run build' in web/ first" >&2; exit 1; }
exec .venv/bin/uvicorn app.main:app --env-file ../local/farm.env --host "$HOST" --port "${PORT:-8800}"
