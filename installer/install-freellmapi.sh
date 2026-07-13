#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE="${FREELLMAPI_IMAGE:-ghcr.io/nexovarian-alt/freellmapi-enhanced-cn:v1.0.0}"
PORT="${FREELLMAPI_PORT:-3104}"
INSTALL_DIR="${FREELLMAPI_INSTALL_DIR:-$HOME/.freellmapi-enhanced-cn}"
CONTAINER="freellmapi-enhanced-cn"
DATA_DIR="$INSTALL_DIR/data"
ENV_FILE="$INSTALL_DIR/.env"
LOG_DIR="$INSTALL_DIR/logs"
LOG_FILE="$LOG_DIR/install-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR" "$DATA_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1
fail(){ echo "[ERROR] $*" >&2; exit 1; }
trap 'echo "[ERROR] Installation failed. Log: $LOG_FILE" >&2' ERR

[[ "$(uname -s)" == "Linux" ]] || fail "This installer supports Linux/NAS Docker. Windows and macOS users can use Docker Desktop with the documented docker run command."
command -v docker >/dev/null || fail "Docker is required. Install Docker, then run this command again."
docker info >/dev/null 2>&1 || fail "Docker daemon is not running."
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT >= 1024 && PORT <= 65535)) || fail "FREELLMAPI_PORT must be between 1024 and 65535."
if docker ps --format '{{.Names}} {{.Ports}}' | grep -E "(^| )${PORT}->|:${PORT}->" >/dev/null; then
  fail "Port ${PORT} is already in use. Set FREELLMAPI_PORT to another port and retry."
fi

umask 077
if [[ -f "$ENV_FILE" ]]; then
  ENCRYPTION_KEY="$(sed -n 's/^ENCRYPTION_KEY=//p' "$ENV_FILE" | head -n1)"
else
  command -v openssl >/dev/null || fail "openssl is required to generate the encryption key."
  ENCRYPTION_KEY="$(openssl rand -hex 32)"
fi
[[ "$ENCRYPTION_KEY" =~ ^[0-9a-fA-F]{64}$ ]] || fail "Existing ENCRYPTION_KEY is invalid; refusing to risk unreadable API keys."
{
  printf 'ENCRYPTION_KEY=%s\n' "$ENCRYPTION_KEY"
  [[ -n "${PROXY_URL:-}" ]] && printf 'PROXY_URL=%s\n' "$PROXY_URL"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Pulling $IMAGE"
docker pull "$IMAGE"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --restart unless-stopped \
  --env-file "$ENV_FILE" -e NODE_ENV=production \
  -e FREEAPI_DB_PATH=/app/server/data/freeapi.db \
  -p "${PORT}:3001" -v "$DATA_DIR:/app/server/data" "$IMAGE" >/dev/null

for _ in $(seq 1 45); do
  if curl --fail --silent "http://127.0.0.1:${PORT}/api/ping" >/dev/null 2>&1; then
    SETUP_CODE="$(docker logs "$CONTAINER" 2>&1 | sed -n 's/.*\(setup code\|Setup Code\)[: ]*//p' | head -n1 || true)"
    LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    printf '\n================================\nFreeLLMAPI Enhanced CN v1.0.0 installation complete\n================================\n\n'
    echo 'Install status: Success'
    echo "Container: $CONTAINER"
    echo "Docker status: $(docker inspect -f '{{.State.Status}}' "$CONTAINER")"
    echo "Port mapping: ${PORT}:3001"
    echo "Local URL: http://127.0.0.1:${PORT}"
    [[ -n "$LAN_IP" ]] && echo "LAN URL: http://${LAN_IP}:${PORT}"
    if [[ -n "$SETUP_CODE" ]]; then
      echo "Setup Code: $SETUP_CODE"
    else
      echo "Setup Code: run docker logs $CONTAINER 2>&1 | grep -i 'setup code'"
    fi
    echo 'Next: open the URL, enter Setup Code, create the admin account, then add provider API keys.'
    echo "Data directory: $DATA_DIR"
    echo "Log: $LOG_FILE"
    exit 0
  fi
  sleep 2
done
docker logs "$CONTAINER" --tail 80 || true
fail "Service did not become ready."
