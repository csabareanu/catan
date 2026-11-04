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
API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:${APP_PORT}}"
API_BASE_URL="${API_BASE_URL%/}"
WEB_BASE_URL="${COMPOSE_WEB_BASE_URL:-http://web:5173}"
COMPOSE_FILE_SPEC="$(dotenv_value COMPOSE_FILE compose.yaml)"
token=""
game_id=""

if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif docker-compose version >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    printf 'COMPOSE OBSERVER SMOKE FAILED: Docker Compose is not available.\n' >&2
    exit 1
fi

COMPOSE+=(--project-directory "$ROOT_DIR")
IFS=: read -r -a compose_files <<< "$COMPOSE_FILE_SPEC"
for compose_file in "${compose_files[@]}"; do
    if [[ -z "$compose_file" ]]; then
        printf 'COMPOSE OBSERVER SMOKE FAILED: COMPOSE_FILE contains an empty path.\n' >&2
        exit 1
    fi

    if [[ "$compose_file" = /* ]]; then
        compose_path="$compose_file"
    else
        compose_path="$ROOT_DIR/$compose_file"
    fi

    if [[ ! -f "$compose_path" ]]; then
        printf 'COMPOSE OBSERVER SMOKE FAILED: Compose file not found: %s\n' "$compose_path" >&2
        exit 1
    fi

    COMPOSE+=(-f "$compose_path")
done
COMPOSE+=(--profile test)

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

for required_command in curl docker; do
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
"${COMPOSE[@]}" run --build --rm \
    --env "COMPOSE_OBSERVER_TOKEN=$token" \
    --env "COMPOSE_OBSERVER_GAME_ID=$game_id" \
    --env "COMPOSE_WEB_BASE_URL=$WEB_BASE_URL" \
    web-e2e npm run test:e2e:compose

if ! [[ "$game_id" =~ ^[0-9]+$ ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: expected a numeric game id, got %s.\n' "$game_id" >&2
    exit 1
fi

setup_sql="
SELECT
    game.lifecycle_status,
    game.current_state ->> 'phase',
    game.state_schema_version,
    game.last_command_sequence,
    game.last_event_sequence,
    (SELECT count(*) FROM game_commands WHERE game_id = ${game_id} AND command_type = 'bootstrap.v1'),
    (SELECT count(*) FROM game_commands WHERE game_id = ${game_id} AND command_type = 'begin_initial_placement.v1'),
    (SELECT count(*) FROM game_commands WHERE game_id = ${game_id}),
    (SELECT count(*) FROM game_commands WHERE game_id = ${game_id} AND command_type = 'place_initial_settlement_and_road.v1'),
    (SELECT count(*)
       FROM game_commands AS command
       JOIN game_seats AS seat
         ON seat.game_id = command.game_id
        AND seat.seat_number = command.acting_seat_number
      WHERE command.game_id = ${game_id}
        AND command.command_type = 'place_initial_settlement_and_road.v1'
        AND seat.controller_type = 'human'
        AND command.decision_metadata IS NULL
        AND command.payload::jsonb ? 'settlement_vertex_id'
        AND command.payload::jsonb ? 'road_edge_id'),
    (SELECT count(*)
       FROM game_commands AS command
       JOIN game_seats AS seat
         ON seat.game_id = command.game_id
        AND seat.seat_number = command.acting_seat_number
      WHERE command.game_id = ${game_id}
        AND command.command_type = 'place_initial_settlement_and_road.v1'
        AND seat.controller_type = 'ai'
        AND command.decision_metadata ->> 'policy_version' = 'random_placement.v1'
        AND command.decision_metadata ->> 'option_id' IS NOT NULL
        AND command.payload::jsonb ? 'settlement_vertex_id'
        AND command.payload::jsonb ? 'road_edge_id'),
    (SELECT coalesce(min(sequence), 0) FROM game_commands WHERE game_id = ${game_id}),
    (SELECT coalesce(max(sequence), 0) FROM game_commands WHERE game_id = ${game_id}),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id}),
    (SELECT coalesce(min(sequence), 0) FROM game_events WHERE game_id = ${game_id}),
    (SELECT coalesce(max(sequence), 0) FROM game_events WHERE game_id = ${game_id}),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND command_id IS NOT NULL),
    (SELECT count(*) FROM game_snapshots WHERE game_id = ${game_id}),
    (SELECT count(*) FROM game_snapshots WHERE game_id = ${game_id} AND command_sequence = 1 AND state_schema_version = 'state-v1'),
    (SELECT count(*) FROM game_snapshots WHERE game_id = ${game_id} AND command_sequence > 1 AND state_schema_version = 'state-v2'),
    (SELECT command_sequence FROM game_snapshots WHERE game_id = ${game_id} ORDER BY command_sequence DESC LIMIT 1),
    (SELECT event_sequence FROM game_snapshots WHERE game_id = ${game_id} ORDER BY command_sequence DESC LIMIT 1),
    (SELECT state_schema_version FROM game_snapshots WHERE game_id = ${game_id} ORDER BY command_sequence DESC LIMIT 1),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'game_initialized.v1'),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'initial_placement_started.v1'),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'initial_settlement_placed.v1'),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'initial_road_placed.v1'),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'initial_resources_granted.v1'),
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'initial_placement_completed.v1')
FROM games AS game
WHERE game.id = ${game_id};
"
db_counts="$("${COMPOSE[@]}" exec -T postgres sh -c 'psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F "|" -c "$1"' sh "$setup_sql")" || {
    printf 'COMPOSE OBSERVER SMOKE FAILED: could not inspect completed PostgreSQL setup history.\n' >&2
    exit 1
}

IFS='|' read -r lifecycle_status state_phase state_schema_version last_command_sequence last_event_sequence \
    bootstrap_count setup_start_count command_count placement_count human_placement_count ai_placement_count \
    first_command_sequence final_command_sequence event_count first_event_sequence final_event_sequence linked_event_count \
    snapshot_count initial_snapshot_count setup_snapshot_count final_snapshot_command_sequence final_snapshot_event_sequence \
    final_snapshot_schema initialized_event_count setup_started_event_count settlement_event_count road_event_count \
    resource_event_count completed_event_count <<< "$db_counts"

if [[ "$lifecycle_status" != running || "$state_phase" != turn_ready || "$state_schema_version" != state-v2 || \
    "$last_command_sequence" != 8 || "$last_event_sequence" != 18 || "$bootstrap_count" != 1 || \
    "$setup_start_count" != 1 || "$command_count" != 8 || "$placement_count" != 6 || \
    "$human_placement_count" != 2 || "$ai_placement_count" != 4 || "$first_command_sequence" != 1 || \
    "$final_command_sequence" != 8 || "$event_count" != 18 || "$first_event_sequence" != 1 || \
    "$final_event_sequence" != 18 || "$linked_event_count" != 18 || "$snapshot_count" != 8 || \
    "$initial_snapshot_count" != 1 || "$setup_snapshot_count" != 7 || \
    "$final_snapshot_command_sequence" != 8 || "$final_snapshot_event_sequence" != 18 || \
    "$final_snapshot_schema" != state-v2 || "$initialized_event_count" != 1 || \
    "$setup_started_event_count" != 1 || "$settlement_event_count" != 6 || "$road_event_count" != 6 || \
    "$resource_event_count" != 3 || "$completed_event_count" != 1 ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: unexpected completed setup history for game %s.\n' "$game_id" >&2
    printf '  lifecycle=%s phase=%s state=%s commands=%s placements=%s human=%s ai=%s events=%s snapshots=%s\n' \
        "$lifecycle_status" "$state_phase" "$state_schema_version" "$command_count" "$placement_count" \
        "$human_placement_count" "$ai_placement_count" "$event_count" "$snapshot_count" >&2
    printf '  command cursor=%s event cursor=%s event range=%s-%s final snapshot=%s/%s (%s)\n' \
        "$last_command_sequence" "$last_event_sequence" "$first_event_sequence" "$final_event_sequence" \
        "$final_snapshot_command_sequence" "$final_snapshot_event_sequence" "$final_snapshot_schema" >&2
    exit 1
fi

printf 'PostgreSQL setup history: 2 human placements, 4 AI placements, 18 ordered events, and 8 snapshots; phase is turn_ready.\n'
printf 'Compose observer smoke passed: React playback, Laravel persistence, and Go continuation agree for game %s.\n' "$game_id"
