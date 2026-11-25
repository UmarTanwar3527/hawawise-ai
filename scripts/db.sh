#!/usr/bin/env bash
# Hawa AI database tasks against the Supabase project in SUPABASE_DB_URL.
#
#   scripts/db.sh rehearse   Apply all migrations + seed + tests in ONE transaction, then roll back
#   scripts/db.sh push       Apply pending migrations and the seed (recorded in migration history)
#   scripts/db.sh test       Run pgTAP security tests (transactional, leaves no data)
#   scripts/db.sh types      Regenerate src/lib/supabase/database.types.ts
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
  *)
    sed -n '2,8p' "$0"
    exit 1
    ;;
esac
