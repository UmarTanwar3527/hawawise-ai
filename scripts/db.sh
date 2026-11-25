#!/usr/bin/env bash
# Hawa AI database tasks against the Supabase project in SUPABASE_DB_URL.
#
#   scripts/db.sh rehearse   Apply all migrations + seed + tests in ONE transaction, then roll back
#   scripts/db.sh push       Apply pending migrations and the seed (recorded in migration history)
#   scripts/db.sh test       Run pgTAP security tests (transactional, leaves no data)
#   scripts/db.sh types      Regenerate src/lib/supabase/database.types.ts
#   scripts/db.sh schedule <https://app-origin>
#                            Store the hourly-job URL and CRON_SECRET (from .env.local) in Supabase Vault
#   scripts/db.sh schedule-status
#                            Show the scheduled jobs, recent runs and HTTP results
#   scripts/db.sh schedule-run ingest|brief
#                            Trigger one job now (e.g. to refresh data before a demo)
#
# The connection string is read from .env.local and is never printed.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${SUPABASE_DB_URL:-}" && -f .env.local ]]; then
  # Read only this one variable; do not source the whole file.
  SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' .env.local | head -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is not set. Add it to .env.local (Supabase → Connect → Session pooler)." >&2
  exit 1
fi

# psql reads the connection from PG* environment variables so the password
# never appears in process arguments. (The Supabase CLI only accepts the URL
# as an argument; run it on a machine you do not share.)
eval "$(HAWA_DB_URL="$SUPABASE_DB_URL" python3 - <<'PY'
import os, shlex, urllib.parse
u = urllib.parse.urlsplit(os.environ["HAWA_DB_URL"])
values = {
    "PGHOST": u.hostname or "",
    "PGPORT": str(u.port or 5432),
    "PGUSER": urllib.parse.unquote(u.username or ""),
    "PGPASSWORD": urllib.parse.unquote(u.password or ""),
    "PGDATABASE": (u.path or "/postgres").lstrip("/") or "postgres",
    "PGSSLMODE": "require",
}
print("\n".join(f"export {k}={shlex.quote(v)}" for k, v in values.items()))
PY
)"

PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

# pgTAP prints "not ok" for failures; finish() reports a plan/failure summary.
run_tap() {
  local output
  output="$("${PSQL[@]}" -At "$@" 2>&1)" || { echo "$output" >&2; return 1; }
  echo "$output" | grep -E '^(ok|not ok|#)' || true
  if echo "$output" | grep -qE '^not ok|Looks like you failed'; then
    echo "FAILED" >&2
    return 1
  fi
  echo "PASSED ($(echo "$output" | grep -cE '^ok') checks)"
}

case "${1:-}" in
  rehearse)
    # The test file opens its own transaction and ends with ROLLBACK, which also
    # rolls back the migrations and seed applied before it. On any error psql
    # exits and the open transaction is discarded.
    # Only migrations not yet recorded in Supabase's migration history.
    applied="$("${PSQL[@]}" -At -c "select coalesce(string_agg(version, ' '), '') from supabase_migrations.schema_migrations" 2>/dev/null || true)"
    script="$(mktemp)"
    trap 'rm -f "$script"' EXIT
    {
      echo "begin;"
      for f in supabase/migrations/*.sql; do
        version="$(basename "$f" | cut -d_ -f1)"
        if [[ " $applied " == *" $version "* ]]; then continue; fi
        echo "\\echo '# rehearsing $(basename "$f")'"
        echo "\\i $f"
      done
      echo "\\i supabase/seed.sql"
      echo "\\i supabase/tests/database/rls.test.sql"
    } > "$script"
    run_tap -f "$script"
    ;;
  push)
    SUPABASE_YES=1 npx supabase db push --remote="$SUPABASE_DB_URL" --include-seed --yes
    ;;
  test)
    run_tap -f supabase/tests/database/rls.test.sql
    ;;
  types)
    npx supabase gen types --lang typescript --schema public --remote="$SUPABASE_DB_URL" \
      > src/lib/supabase/database.types.ts
    echo "Wrote src/lib/supabase/database.types.ts"
    ;;
  schedule)
    base_url="${2:-}"
    if [[ ! "$base_url" =~ ^https://[a-z0-9.-]+$ ]]; then
      echo "Usage: scripts/db.sh schedule https://your-app.vercel.app   (https origin, no trailing slash)" >&2
      exit 1
    fi
    if ! grep -qE '^CRON_SECRET=.+' .env.local; then
      echo "CRON_SECRET is not set in .env.local." >&2
      exit 1
    fi
    # The SQL (with the secret) goes to psql on stdin, never in process arguments or output.
    HAWA_BASE_URL="$base_url" python3 - <<'PY' | "${PSQL[@]}" -f - >/dev/null
import os, re, secrets
env = {}
for line in open(".env.local", encoding="utf-8"):
    m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\n"))
    if m:
        env[m.group(1)] = m.group(2).strip().strip('"')
def q(value):
    tag = "s" + secrets.token_hex(8)
    return f"${tag}${value}${tag}$"
pairs = [("hawa_base_url", os.environ["HAWA_BASE_URL"], "Origin of the deployed Hawa AI app"),
         ("hawa_cron_secret", env["CRON_SECRET"], "Bearer token for the Hawa AI cron endpoints")]
print("do $do$ declare existing uuid; begin")
for name, value, description in pairs:
    print(f"select id into existing from vault.secrets where name = '{name}';")
    print(f"if existing is null then perform vault.create_secret({q(value)}, '{name}', '{description}');")
    print(f"else perform vault.update_secret(existing, {q(value)}); end if;")
print("end $do$;")
PY
    echo "Stored hawa_base_url ($base_url) and hawa_cron_secret in Supabase Vault."
    ;;
  schedule-run)
    case "${2:-}" in
      ingest|brief) "${PSQL[@]}" -At -c "select 'request ' || private.trigger_hawa_job('/api/cron/${2}')" ;;
      *) echo "Usage: scripts/db.sh schedule-run ingest|brief" >&2; exit 1 ;;
    esac
    ;;
  schedule-status)
    "${PSQL[@]}" -c "select jobname, schedule, active from cron.job where jobname like 'hawa-%' order by jobname"
    "${PSQL[@]}" -c "select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'hawa-%' order by d.start_time desc limit 6"
    "${PSQL[@]}" -c "select id, status_code, timed_out, error_msg, created from net._http_response order by created desc limit 6"
    ;;
  *)
    sed -n '2,14p' "$0"
    exit 1
    ;;
esac
