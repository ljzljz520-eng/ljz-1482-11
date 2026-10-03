#!/bin/sh
set -eu

echo "[entrypoint] role=${ROLE:-api} waiting for database..."
n=0
until node -e "
const net = require('net');
const u = new URL(process.env.DATABASE_URL);
const s = net.connect(Number(u.port || 5432), u.hostname, () => { s.end(); process.exit(0); });
s.on('error', () => process.exit(1));
" 2>/dev/null; do
  n=$((n+1))
  if [ "$n" -ge 60 ]; then
    echo "[entrypoint] database not reachable after 60 attempts"; exit 1;
  fi
  sleep 1
done
echo "[entrypoint] database is reachable"

if [ "${ROLE:-api}" = "api" ]; then
  echo "[entrypoint] synchronizing schema (prisma db push)..."
  npx prisma db push --skip-generate
  echo "[entrypoint] seeding..."
  npx tsx prisma/seed.ts || echo "[entrypoint] seed skipped/failed (continuing)"
  echo "[entrypoint] starting API"
  exec node dist/index.js
else
  echo "[entrypoint] starting reference parse worker"
  exec node dist/worker.js
fi
