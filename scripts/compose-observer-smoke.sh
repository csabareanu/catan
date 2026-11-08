#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_FILE="$(mktemp "${TMPDIR:-/tmp}/catan-compose-observer.XXXXXX")"
REPLAY_FILE="${STATE_FILE}.replay.json"
TURN_SMOKE_SEED=7
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

    rm -f "$STATE_FILE" "$REPLAY_FILE"
    exit "$status"
}

trap cleanup EXIT

for required_command in curl docker; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
        printf 'COMPOSE OBSERVER SMOKE FAILED: required command not found: %s\n' "$required_command" >&2
        exit 1
    fi
done

COMPOSE_SMOKE_SEED="$TURN_SMOKE_SEED" \
    SMOKE_STATE_FILE="$STATE_FILE" "$ROOT_DIR/scripts/compose-smoke.sh"

# shellcheck disable=SC1090
source "$STATE_FILE"
token="${COMPOSE_OBSERVER_TOKEN:?Compose smoke did not provide a bearer token.}"
game_id="${COMPOSE_OBSERVER_GAME_ID:?Compose smoke did not provide a game id.}"

printf 'Opening the real Compose observer for game %s at %s\n' "$game_id" "$WEB_BASE_URL"
"${COMPOSE[@]}" run --build --rm \
    --env "COMPOSE_OBSERVER_TOKEN=$token" \
    --env "COMPOSE_OBSERVER_GAME_ID=$game_id" \
    --env "COMPOSE_OBSERVER_EXPECTED_SEED=$TURN_SMOKE_SEED" \
    --env "COMPOSE_WEB_BASE_URL=$WEB_BASE_URL" \
    web-e2e npm run test:e2e:compose

if ! [[ "$game_id" =~ ^[0-9]+$ ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: expected a numeric game id, got %s.\n' "$game_id" >&2
    exit 1
fi

replay_http_status="$(curl --silent --show-error --output "$REPLAY_FILE" --write-out '%{http_code}' \
    --header 'Accept: application/json' \
    --header "Authorization: Bearer $token" \
    "$API_BASE_URL/api/v1/games/$game_id/replay")" || {
    printf 'COMPOSE OBSERVER SMOKE FAILED: could not fetch the persisted turn replay.\n' >&2
    exit 1
}
if [[ "$replay_http_status" != 200 ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: latest replay returned HTTP %s.\n' "$replay_http_status" >&2
    sed -n '1,160p' "$REPLAY_FILE" >&2
    exit 1
fi

json_value() {
    local json_file="$1"
    local path="$2"

    "${COMPOSE[@]}" exec -T api php -r '
        $data = json_decode(file_get_contents("php://stdin"), true, 512, JSON_THROW_ON_ERROR);
        $value = $data;
        $path = $argv[1] ?? "";

        foreach (explode(".", $path) as $segment) {
            if (! is_array($value) || ! array_key_exists($segment, $value)) {
                fwrite(STDERR, "Missing JSON path: {$path}\\n");
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

replay_schema_version="$(json_value "$REPLAY_FILE" schema_version)"
replay_command_sequence="$(json_value "$REPLAY_FILE" frame.command_sequence)"
replay_event_sequence="$(json_value "$REPLAY_FILE" frame.event_sequence)"
replay_state_schema="$(json_value "$REPLAY_FILE" frame.state_schema_version)"
replay_public_schema="$(json_value "$REPLAY_FILE" frame.public_projection_schema_version)"
replay_roll_die_one="$(json_value "$REPLAY_FILE" frame.public_state.last_roll.die_one)"
replay_roll_die_two="$(json_value "$REPLAY_FILE" frame.public_state.last_roll.die_two)"
replay_roll_total="$(json_value "$REPLAY_FILE" frame.public_state.last_roll.total)"
replay_viewer_schema="$(json_value "$REPLAY_FILE" frame.viewer_projection_schema_version)"
replay_viewer_seat="$(json_value "$REPLAY_FILE" frame.viewer_state.seat_number)"
replay_resource_counts="$("${COMPOSE[@]}" exec -T api php -r '
    $data = json_decode(file_get_contents("php://stdin"), true, 512, JSON_THROW_ON_ERROR);
    $resources = $data["frame"]["viewer_state"]["resources"] ?? null;
    $fields = ["lumber", "wool", "grain", "brick", "ore"];

    if (! is_array($resources)) {
        fwrite(STDERR, "Replay does not contain viewer resources.\\n");
        exit(1);
    }

    foreach ($fields as $index => $field) {
        if (! is_int($resources[$field] ?? null) || $resources[$field] < 0) {
            fwrite(STDERR, "Replay viewer resource is missing or invalid: {$field}\\n");
            exit(1);
        }

        echo ($index === 0 ? "" : "|").$resources[$field];
    }
' < "$REPLAY_FILE")" || {
    printf 'COMPOSE OBSERVER SMOKE FAILED: could not parse the owner resource projection.\n' >&2
    exit 1
}

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
    (SELECT count(*) FROM game_events WHERE game_id = ${game_id} AND event_type = 'initial_placement_completed.v1'),
    game.seed,
    game.current_state ->> 'turn_phase',
    game.current_state ->> 'round',
    game.current_state ->> 'turn_number',
    game.current_state ->> 'active_seat_number',
    game.human_seat_number,
    game.current_state -> 'seat_order' ->> 0,
    game.current_state -> 'last_roll' ->> 'die_one',
    game.current_state -> 'last_roll' ->> 'die_two',
    game.current_state -> 'last_roll' ->> 'total',
    (SELECT count(*) FROM game_snapshots WHERE game_id = ${game_id} AND state_schema_version = 'state-v3'),
    (SELECT count(*)
       FROM game_snapshots AS snapshot
      WHERE snapshot.game_id = ${game_id}
        AND snapshot.command_sequence = game.last_command_sequence
        AND snapshot.event_sequence = game.last_event_sequence
        AND snapshot.state_schema_version = 'state-v3'
        AND snapshot.state::jsonb = game.current_state::jsonb),
    (SELECT count(*) FROM game_commands WHERE game_id = ${game_id} AND command_type = 'roll_dice.v1'),
    (SELECT sequence FROM game_commands WHERE game_id = ${game_id} AND command_type = 'roll_dice.v1' LIMIT 1),
    (SELECT acting_seat_number FROM game_commands WHERE game_id = ${game_id} AND command_type = 'roll_dice.v1' LIMIT 1),
    (SELECT count(*)
       FROM game_commands
      WHERE game_id = ${game_id}
        AND command_type = 'roll_dice.v1'
        AND payload::jsonb IN ('{}'::jsonb, '[]'::jsonb)),
    (SELECT coalesce(string_agg(event.event_type, ',' ORDER BY event.sequence), '')
       FROM game_events AS event
       JOIN game_commands AS command ON command.id = event.command_id
      WHERE command.game_id = game.id
        AND command.command_type = 'roll_dice.v1'),
    (SELECT count(*)
       FROM game_events AS event
       JOIN game_commands AS command ON command.id = event.command_id
      WHERE command.game_id = game.id
        AND command.command_type = 'roll_dice.v1'),
    (SELECT count(*)
       FROM game_events AS event
       JOIN game_commands AS command ON command.id = event.command_id
      WHERE command.game_id = game.id
        AND command.command_type = 'roll_dice.v1'
        AND event.event_type = 'resources_produced.v1'
        AND event.visibility = 'seat_private'
        AND event.visible_to_seat_number = game.human_seat_number),
    (SELECT coalesce(player.value -> 'resources' ->> 'lumber', '')
       FROM jsonb_array_elements(game.current_state::jsonb -> 'players') AS player(value)
      WHERE player.value ->> 'seat_number' = game.human_seat_number::text),
    (SELECT coalesce(player.value -> 'resources' ->> 'wool', '')
       FROM jsonb_array_elements(game.current_state::jsonb -> 'players') AS player(value)
      WHERE player.value ->> 'seat_number' = game.human_seat_number::text),
    (SELECT coalesce(player.value -> 'resources' ->> 'grain', '')
       FROM jsonb_array_elements(game.current_state::jsonb -> 'players') AS player(value)
      WHERE player.value ->> 'seat_number' = game.human_seat_number::text),
    (SELECT coalesce(player.value -> 'resources' ->> 'brick', '')
       FROM jsonb_array_elements(game.current_state::jsonb -> 'players') AS player(value)
      WHERE player.value ->> 'seat_number' = game.human_seat_number::text),
    (SELECT coalesce(player.value -> 'resources' ->> 'ore', '')
       FROM jsonb_array_elements(game.current_state::jsonb -> 'players') AS player(value)
      WHERE player.value ->> 'seat_number' = game.human_seat_number::text)
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
    resource_event_count completed_event_count game_seed turn_phase round turn_number active_seat_number \
    human_seat_number first_turn_seat die_one die_two roll_total turn_snapshot_count matching_latest_snapshot_count \
    roll_command_count roll_command_sequence roll_command_actor empty_roll_payload_count roll_event_types \
    roll_event_count human_production_event_count database_lumber database_wool database_grain database_brick \
    database_ore <<< "$db_counts"

if [[ "$lifecycle_status" != 'awaiting human input' || "$state_phase" != normal_turn || \
    "$state_schema_version" != state-v3 || "$turn_phase" != action || "$round" != 1 || \
    "$turn_number" != 1 || "$active_seat_number" != "$human_seat_number" || \
    "$first_turn_seat" != "$human_seat_number" || "$game_seed" != "$TURN_SMOKE_SEED" || \
    "$die_one" != 5 || "$die_two" != 5 || "$roll_total" != 10 || \
    "$last_command_sequence" != 9 || "$command_count" != 9 || "$bootstrap_count" != 1 || \
    "$setup_start_count" != 1 || "$placement_count" != 6 || \
    "$human_placement_count" != 2 || "$ai_placement_count" != 4 || "$first_command_sequence" != 1 || \
    "$final_command_sequence" != 9 || "$first_event_sequence" != 1 || \
    "$final_event_sequence" != "$event_count" || "$last_event_sequence" != "$event_count" || \
    "$linked_event_count" != "$event_count" || "$snapshot_count" != 9 || \
    "$initial_snapshot_count" != 1 || "$setup_snapshot_count" != 7 || \
    "$turn_snapshot_count" != 1 || "$final_snapshot_command_sequence" != 9 || \
    "$final_snapshot_event_sequence" != "$last_event_sequence" || "$final_snapshot_schema" != state-v3 || \
    "$matching_latest_snapshot_count" != 1 || "$roll_command_count" != 1 || \
    "$roll_command_sequence" != 9 || "$roll_command_actor" != "$human_seat_number" || \
    "$empty_roll_payload_count" != 1 || "$initialized_event_count" != 1 || \
    "$setup_started_event_count" != 1 || "$settlement_event_count" != 6 || "$road_event_count" != 6 || \
    "$resource_event_count" != 3 || "$completed_event_count" != 1 || \
    "$replay_schema_version" != replay-v1 || "$replay_command_sequence" != 9 || \
    "$replay_event_sequence" != "$last_event_sequence" || "$replay_state_schema" != state-v3 || \
    "$replay_public_schema" != replay-public-v3 || "$replay_roll_die_one" != 5 || \
    "$replay_roll_die_two" != 5 || "$replay_roll_total" != 10 || \
    "$replay_viewer_schema" != replay-viewer-v1 || "$replay_viewer_seat" != "$human_seat_number" ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: persisted state did not match the fixed human-first roll.\n' >&2
    printf '  seed=%s lifecycle=%s phase=%s state=%s turn=%s/%s round=%s active=%s human=%s order_first=%s roll=%s+%s=%s\n' \
        "$game_seed" "$lifecycle_status" "$state_phase" "$state_schema_version" "$turn_number" \
        "$turn_phase" "$round" "$active_seat_number" "$human_seat_number" "$first_turn_seat" \
        "$die_one" "$die_two" "$roll_total" >&2
    printf '  commands=%s (roll=%s by %s) events=%s/%s-%s snapshots=%s latest=%s/%s (%s) current-match=%s\n' \
        "$command_count" "$roll_command_count" "$roll_command_actor" "$event_count" "$first_event_sequence" \
        "$final_event_sequence" "$snapshot_count" "$final_snapshot_command_sequence" \
        "$final_snapshot_event_sequence" "$final_snapshot_schema" "$matching_latest_snapshot_count" >&2
    printf '  cursors command=%s event=%s; command range=%s-%s linked events=%s; snapshots initial=%s setup-v2=%s turn-v3=%s\n' \
        "$last_command_sequence" "$last_event_sequence" "$first_command_sequence" "$final_command_sequence" \
        "$linked_event_count" "$initial_snapshot_count" "$setup_snapshot_count" "$turn_snapshot_count" >&2
    printf '  setup counts bootstrap=%s start=%s placements=%s human=%s ai=%s resources=%s completed=%s\n' \
        "$bootstrap_count" "$setup_start_count" "$placement_count" "$human_placement_count" \
        "$ai_placement_count" "$resource_event_count" "$completed_event_count" >&2
    printf '  roll command sequence=%s empty-payload=%s; roll events=%s types=%s owner-private-production=%s\n' \
        "$roll_command_sequence" "$empty_roll_payload_count" "$roll_event_count" \
        "$roll_event_types" "$human_production_event_count" >&2
    printf '  replay=%s/%s/%s command=%s event=%s roll=%s+%s=%s viewer=%s seat=%s\n' \
        "$replay_schema_version" "$replay_state_schema" "$replay_public_schema" "$replay_command_sequence" \
        "$replay_event_sequence" "$replay_roll_die_one" "$replay_roll_die_two" "$replay_roll_total" \
        "$replay_viewer_schema" "$replay_viewer_seat" >&2
    exit 1
fi

if (( roll_event_count < 3 || human_production_event_count < 1 || event_count < 21 )); then
    printf 'COMPOSE OBSERVER SMOKE FAILED: expected an owner-private production event after the fixed non-seven roll.\n' >&2
    printf '  roll events=%s types=%s owner-private production=%s total events=%s\n' \
        "$roll_event_count" "$roll_event_types" "$human_production_event_count" "$event_count" >&2
    exit 1
fi

if [[ ! "$roll_event_types" =~ ^turn_started\.v1,dice_rolled\.v1(,resources_produced\.v1)+$ ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: normal turn events were not ordered as start, roll, and production.\n' >&2
    printf '  roll event types: %s\n' "$roll_event_types" >&2
    exit 1
fi

database_resource_counts="$database_lumber|$database_wool|$database_grain|$database_brick|$database_ore"
if [[ "$database_resource_counts" != "$replay_resource_counts" ]]; then
    printf 'COMPOSE OBSERVER SMOKE FAILED: PostgreSQL and replay owner resources differ.\n' >&2
    printf '  PostgreSQL: %s\n  Replay:     %s\n' "$database_resource_counts" "$replay_resource_counts" >&2
    exit 1
fi

printf 'PostgreSQL turn history: seed %s gave human seat %s first turn and dice %s+%s; command, ordered events, and state-v3 snapshot agree.\n' \
    "$game_seed" "$human_seat_number" "$die_one" "$die_two"
printf 'Compose observer smoke passed: React, Laravel, Go, and PostgreSQL agree for game %s.\n' "$game_id"
