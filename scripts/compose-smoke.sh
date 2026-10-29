#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"
POLL_TIMEOUT="${POLL_TIMEOUT:-60}"

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

if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
elif docker-compose version >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
else
    printf 'SMOKE FAILED: Docker Compose is not available.\n' >&2
    exit 1
fi

COMPOSE_FILE_SPEC="$(dotenv_value COMPOSE_FILE compose.yaml)"
IFS=: read -r -a compose_files <<< "$COMPOSE_FILE_SPEC"
COMPOSE=(env -u COMPOSE_FILE "${COMPOSE[@]}" --project-directory "$ROOT_DIR")
for compose_file in "${compose_files[@]}"; do
    if [[ -z "$compose_file" ]]; then
        printf 'SMOKE FAILED: COMPOSE_FILE contains an empty Compose file path.\n' >&2
        exit 1
    fi

    if [[ "$compose_file" = /* ]]; then
        compose_path="$compose_file"
    else
        compose_path="$ROOT_DIR/$compose_file"
    fi

    if [[ ! -f "$compose_path" ]]; then
        printf 'SMOKE FAILED: Compose file not found: %s\n' "$compose_path" >&2
        exit 1
    fi

    COMPOSE+=(-f "$compose_path")
done

if [[ ! -f "$ROOT_DIR/.env" ]]; then
    COMPOSE+=(--env-file "$ROOT_DIR/compose.env.example")
fi

for required_command in curl docker awk; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        printf 'SMOKE FAILED: required command not found: %s\n' "$required_command" >&2
        exit 1
    fi
done

fail() {
    printf 'SMOKE FAILED: %s\n' "$*" >&2
    exit 1
}

show_diagnostics() {
    printf '\nCompose service status:\n' >&2
    "${COMPOSE[@]}" ps >&2 || true
    printf '\nRecent service logs:\n' >&2
    "${COMPOSE[@]}" logs --no-color --tail=80 api worker engine postgres redis web >&2 || true
}

fail_with_diagnostics() {
    printf 'SMOKE FAILED: %s\n' "$*" >&2
    show_diagnostics
    exit 1
}

wait_for_healthy_services() {
    local services=(postgres redis engine api worker web)
    local deadline=$((SECONDS + HEALTH_TIMEOUT))
    local all_healthy
    local service
    local container_id
    local health

    printf 'Waiting for Compose health checks'
    while (( SECONDS < deadline )); do
        all_healthy=1

        for service in "${services[@]}"; do
            container_id="$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)"
            if [[ -z "$container_id" ]]; then
                all_healthy=0
                continue
            fi

            health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
            if [[ "$health" != "healthy" ]]; then
                all_healthy=0
            fi
        done

        if (( all_healthy )); then
            printf ' ready.\n'
            for service in "${services[@]}"; do
                printf '  %s: healthy\n' "$service"
            done
            return
        fi

        printf '.'
        sleep 2
    done

    printf '\n'
    fail_with_diagnostics "Compose services did not become healthy within ${HEALTH_TIMEOUT}s."
}

json_value() {
    local json_file="$1"
    local path="$2"

    "${COMPOSE[@]}" exec -T api php -r '
        $data = json_decode(file_get_contents("php://stdin"), true, 512, JSON_THROW_ON_ERROR);
        $value = $data;
        $path = $argv[1] ?? "";

        foreach (explode(".", $path) as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                fwrite(STDERR, "Missing JSON path: {$path}\n");
                exit(1);
            }

            $value = $value[$segment];
        }

        if (is_bool($value)) {
            echo $value ? "true" : "false";
        } elseif (is_scalar($value) || $value === null) {
            echo (string) $value;
        } else {
            echo json_encode($value, JSON_THROW_ON_ERROR);
        }
    ' "$path" < "$json_file"
}

write_state_file() {
    if [[ -z "${SMOKE_STATE_FILE:-}" || -z "${token:-}" || -z "${game_id:-}" ]]; then
        return
    fi

    umask 077
    {
        printf 'COMPOSE_OBSERVER_TOKEN=%q\n' "$token"
        printf 'COMPOSE_OBSERVER_GAME_ID=%q\n' "$game_id"
    } > "$SMOKE_STATE_FILE"
}

request_json() {
    local method="$1"
    local url="$2"
    local output_file="$3"
    local payload="${4:-}"
    local token="${5:-}"
    local -a curl_arguments=(
        --silent
        --show-error
        --output "$output_file"
        --write-out '%{http_code}'
        --header 'Accept: application/json'
        --request "$method"
    )

    if [[ "$method" == "POST" ]]; then
        curl_arguments+=(
            --header 'Content-Type: application/json'
            --data "$payload"
        )
    fi

    if [[ -n "$token" ]]; then
        curl_arguments+=(--header "Authorization: Bearer $token")
    fi

    curl "${curl_arguments[@]}" "$url"
}

assert_status() {
    local label="$1"
    local actual="$2"
    local expected="$3"
    local response_file="$4"

    if [[ "$actual" == "$expected" ]]; then
        printf '%s: HTTP %s\n' "$label" "$actual"
        return
    fi

    printf '%s returned HTTP %s, expected HTTP %s. Response:\n' "$label" "$actual" "$expected" >&2
    sed -n '1,160p' "$response_file" >&2
    fail "$label did not return the expected status."
}

assert_json_value() {
    local label="$1"
    local response_file="$2"
    local path="$3"
    local expected="$4"
    local actual

    if ! actual="$(json_value "$response_file" "$path")"; then
        fail "$label response did not contain JSON path $path."
    fi

    if [[ "$actual" != "$expected" ]]; then
        printf '%s JSON path %s was %s, expected %s. Response:\n' "$label" "$path" "$actual" "$expected" >&2
        sed -n '1,160p' "$response_file" >&2
        fail "$label returned an unexpected JSON value."
    fi
}

wait_for_healthy_services

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/catan-compose-smoke.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

EMAIL="catan-smoke-$(date +%s)-${RANDOM}@example.test"
SEED="$(date +%s)"
REGISTER_PAYLOAD="$(printf '{"name":"Compose Smoke","email":"%s","password":"password123","password_confirmation":"password123","token_name":"compose-smoke"}' "$EMAIL")"
GAME_PAYLOAD="$(printf '{"seed":"%s","ruleset_key":"base","map_key":"standard","ai_count":2}' "$SEED")"

if ! register_status="$(request_json POST "$API_BASE_URL/api/v1/auth/register" "$TEMP_DIR/register.json" "$REGISTER_PAYLOAD")"; then
    fail_with_diagnostics "registration request could not reach the API."
fi
assert_status "Register disposable user" "$register_status" 201 "$TEMP_DIR/register.json"
if ! token="$(json_value "$TEMP_DIR/register.json" data.token)" || [[ -z "$token" ]]; then
    fail "registration did not return a bearer token."
fi
printf '  disposable identity: %s\n' "$EMAIL"

if ! create_status="$(request_json POST "$API_BASE_URL/api/v1/games" "$TEMP_DIR/create.json" "$GAME_PAYLOAD" "$token")"; then
    fail_with_diagnostics "game creation request could not reach the API."
fi
assert_status "Create three-seat game" "$create_status" 201 "$TEMP_DIR/create.json"
assert_json_value "Create three-seat game" "$TEMP_DIR/create.json" data.lifecycle_status created

if ! game_id="$(json_value "$TEMP_DIR/create.json" data.id)" || ! [[ "$game_id" =~ ^[0-9]+$ ]]; then
    fail "game creation did not return a numeric game id."
fi
write_state_file
printf '  created game: %s (seed %s)\n' "$game_id" "$SEED"

if ! start_status="$(request_json POST "$API_BASE_URL/api/v1/games/$game_id/run" "$TEMP_DIR/start.json" '' "$token")"; then
    fail_with_diagnostics "game start request could not reach the API."
fi
assert_status "Queue game bootstrap" "$start_status" 202 "$TEMP_DIR/start.json"
assert_json_value "Queue game bootstrap" "$TEMP_DIR/start.json" data.lifecycle_status queued

if ! repeat_status="$(request_json POST "$API_BASE_URL/api/v1/games/$game_id/run" "$TEMP_DIR/repeat-start.json" '' "$token")"; then
    fail_with_diagnostics "repeated game start request could not reach the API."
fi
assert_status "Repeat game start" "$repeat_status" 202 "$TEMP_DIR/repeat-start.json"
repeat_lifecycle="$(json_value "$TEMP_DIR/repeat-start.json" data.lifecycle_status)"
if [[ "$repeat_lifecycle" != "queued" && "$repeat_lifecycle" != "running" ]]; then
    printf 'Repeated start returned unexpected lifecycle status: %s. Response:\n' "$repeat_lifecycle" >&2
    sed -n '1,160p' "$TEMP_DIR/repeat-start.json" >&2
    fail "repeated game start was not an in-progress response."
fi
printf '  repeated start: no new active bootstrap requested (status %s)\n' "$repeat_lifecycle"

printf 'Waiting for game %s to reach awaiting human input' "$game_id"
poll_deadline=$((SECONDS + POLL_TIMEOUT))
game_lifecycle=""
while (( SECONDS < poll_deadline )); do
    if ! show_status="$(request_json GET "$API_BASE_URL/api/v1/games/$game_id" "$TEMP_DIR/show.json" '' "$token")"; then
        fail_with_diagnostics "game status request could not reach the API."
    fi
    if [[ "$show_status" != 200 ]]; then
        printf '\n'
        sed -n '1,160p' "$TEMP_DIR/show.json" >&2
        fail_with_diagnostics "game status request returned HTTP $show_status."
    fi

    game_lifecycle="$(json_value "$TEMP_DIR/show.json" data.lifecycle_status)"
    if [[ "$game_lifecycle" == "awaiting human input" ]]; then
        printf ' done.\n'
        break
    fi
    if [[ "$game_lifecycle" == "failed" ]]; then
        printf '\n'
        sed -n '1,160p' "$TEMP_DIR/show.json" >&2
        fail_with_diagnostics "game bootstrap failed."
    fi

    printf '.'
    sleep 1
done

if [[ "$game_lifecycle" != "awaiting human input" ]]; then
    printf '\n'
    fail_with_diagnostics "game did not reach awaiting human input within ${POLL_TIMEOUT}s."
fi

db_counts="$("${COMPOSE[@]}" exec -T postgres sh -c 'psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -F "|" -c "$1"' sh "
    SELECT
        (SELECT count(*)
           FROM game_commands
          WHERE game_id = ${game_id}
            AND command_type = 'bootstrap.v1'),
        (SELECT count(*)
           FROM game_commands
          WHERE game_id = ${game_id}
            AND command_type = 'begin_initial_placement.v1'),
        (SELECT count(*)
           FROM game_commands
          WHERE game_id = ${game_id}
            AND command_type = 'place_initial_settlement_and_road.v1'),
        (SELECT count(*)
           FROM game_commands
          WHERE game_id = ${game_id}),
        (SELECT count(*)
           FROM game_events AS event
           JOIN game_commands AS command ON command.id = event.command_id
          WHERE event.game_id = ${game_id}
            AND command.game_id = ${game_id}),
        (SELECT coalesce(min(event.sequence), 0)
           FROM game_events AS event
          WHERE event.game_id = ${game_id}),
        (SELECT coalesce(max(event.sequence), 0)
           FROM game_events AS event
          WHERE event.game_id = ${game_id}),
        (SELECT count(*)
           FROM game_events
          WHERE game_id = ${game_id}
            AND command_id IS NOT NULL),
        (SELECT count(*)
           FROM game_snapshots
          WHERE game_id = ${game_id}),
        (SELECT count(*)
           FROM game_snapshots
          WHERE game_id = ${game_id}
            AND command_sequence = 1
            AND state_schema_version = 'state-v1'),
        (SELECT count(*)
           FROM game_snapshots
          WHERE game_id = ${game_id}
            AND command_sequence > 1
            AND state_schema_version = 'state-v2'),
        (SELECT count(*)
           FROM game_commands
          WHERE game_id = ${game_id}
            AND command_type = 'place_initial_settlement_and_road.v1'
            AND decision_metadata ->> 'policy_version' = 'random_placement.v1'
            AND decision_metadata ->> 'option_id' IS NOT NULL
            AND payload::jsonb ? 'settlement_vertex_id'
            AND payload::jsonb ? 'road_edge_id'),
        (SELECT count(*)
           FROM games AS game
           JOIN game_seats AS seat ON seat.game_id = game.id
          WHERE game.id = ${game_id}
            AND game.lifecycle_status = 'awaiting human input'
            AND game.current_state ->> 'phase' = 'initial_placement'
            AND game.current_state ->> 'active_seat_number' = seat.seat_number::text
            AND seat.controller_type = 'human'),
        (SELECT count(*)
           FROM games
          WHERE id = ${game_id}
            AND last_command_sequence = (SELECT count(*) FROM game_commands WHERE game_id = ${game_id})
            AND last_event_sequence = (SELECT count(*) FROM game_events WHERE game_id = ${game_id}));
" )" || fail_with_diagnostics "could not inspect PostgreSQL bootstrap history."

IFS='|' read -r bootstrap_count setup_start_count placement_count command_count event_count first_event_sequence last_event_sequence linked_event_count snapshot_count initial_snapshot_count setup_snapshot_count decision_count human_pause_count cursor_count <<< "$db_counts"
if ! [[ "$bootstrap_count" =~ ^[0-9]+$ && "$setup_start_count" =~ ^[0-9]+$ && "$placement_count" =~ ^[0-9]+$ && "$command_count" =~ ^[0-9]+$ && "$event_count" =~ ^[0-9]+$ && "$first_event_sequence" =~ ^[0-9]+$ && "$last_event_sequence" =~ ^[0-9]+$ && "$linked_event_count" =~ ^[0-9]+$ && "$snapshot_count" =~ ^[0-9]+$ && "$initial_snapshot_count" =~ ^[0-9]+$ && "$setup_snapshot_count" =~ ^[0-9]+$ && "$decision_count" =~ ^[0-9]+$ && "$human_pause_count" =~ ^[0-9]+$ && "$cursor_count" =~ ^[0-9]+$ ]]; then
    fail_with_diagnostics "PostgreSQL returned unreadable setup history counts: $db_counts"
fi
if (( bootstrap_count != 1 || setup_start_count != 1 || placement_count > 2 || command_count != 2 + placement_count || event_count != 2 + 2 * placement_count || first_event_sequence != 1 || last_event_sequence != event_count || linked_event_count != event_count || snapshot_count != command_count || initial_snapshot_count != 1 || setup_snapshot_count != command_count - 1 || decision_count != placement_count || human_pause_count != 1 || cursor_count != 1 )); then
    fail_with_diagnostics "unexpected setup history for game $game_id: bootstrap=$bootstrap_count setup_start=$setup_start_count placements=$placement_count commands=$command_count events=$event_count event_range=$first_event_sequence-$last_event_sequence linked_events=$linked_event_count snapshots=$snapshot_count initial_snapshots=$initial_snapshot_count setup_snapshots=$setup_snapshot_count decisions=$decision_count human_pause=$human_pause_count cursors=$cursor_count"
fi

write_state_file
printf 'PostgreSQL history: bootstrap + setup-start + %s AI placement command(s), %s linked ordered event(s), %s snapshots.\n' "$placement_count" "$event_count" "$snapshot_count"
printf 'Compose smoke test passed: game %s is awaiting human input.\n' "$game_id"
