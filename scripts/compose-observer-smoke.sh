#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$(mktemp "${TMPDIR:-/tmp}/catan-compose-observer.XXXXXX")"
dotenv_value() {
    local key="$1"
    local default="$2"
    local value=""

    if [[ -n "${!key:-}" ]]; then
        printf '%s' "${!key}"
        return
    fi

    if [[ -f "$ROOT_DIR/.env" ]]; then
        value="$(awk -F= -v key="$key" '
            $0 !~ /^[[:space:]]*#/ && $1 == key {
                sub(/^[^=]*=/, "")
                sub(/\r$/, "")
                print
                exit
            }
        ' "$ROOT_DIR/.env")"
    fi

    printf '%s' "${value:-$default}"
}

APP_PORT="$(dotenv_value APP_PORT 8000)"
WEB_PORT="$(dotenv_value WEB_PORT 5173)"
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${APP_PORT}}"
API_BASE_URL="${API_BASE_URL%/}"
WEB_BASE_URL="${COMPOSE_WEB_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
token=""
game_id=""

cleanup() {
    local status=$?

    if [[ -z "$token" && -f "$STATE_FILE" ]]; then
        # shellcheck disable=SC1090
        source "$STATE_FILE" || true
        token="${COMPOSE_OBSERVER_TOKEN:-}"
        game_id="${COMPOSE_OBSERVER_GAME_ID:-}"
    fi

    if [[ -n "$token" && -n "$game_id" ]]; then
        curl --silent --show-error --output /dev/null \
            --request DELETE \
            --header 'Accept: application/json' \
            --header "Authorization: Bearer $token" \
            "$API_BASE_URL/api/v1/games/$game_id" || true
        curl --silent --show-error --output /dev/null \
            --request POST \
            --header 'Accept: application/json' \
            --header "Authorization: Bearer $token" \
            "$API_BASE_URL/api/v1/auth/logout" || true
    fi

    rm -f "$STATE_FILE"
    exit "$status"
}

trap cleanup EXIT

for required_command in curl npm; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        printf 'COMPOSE OBSERVER SMOKE FAILED: required command not found: %s\n' "$required_command" >&2
        exit 1
    fi
done

SMOKE_STATE_FILE="$STATE_FILE" "$ROOT_DIR/scripts/compose-smoke.sh"

# shellcheck disable=SC1090
source "$STATE_FILE"
token="${COMPOSE_OBSERVER_TOKEN:?Compose smoke did not provide a bearer token.}"
game_id="${COMPOSE_OBSERVER_GAME_ID:?Compose smoke did not provide a game id.}"

printf 'Opening the real Compose observer for game %s at %s\n' "$game_id" "$WEB_BASE_URL"
(
    cd "$ROOT_DIR/apps/web"
    COMPOSE_OBSERVER_TOKEN="$token" \
        COMPOSE_OBSERVER_GAME_ID="$game_id" \
        COMPOSE_WEB_BASE_URL="$WEB_BASE_URL" \
        npm run test:e2e:compose
)

printf 'Compose observer smoke test passed: real API, worker, and browser observer verified.\n'
