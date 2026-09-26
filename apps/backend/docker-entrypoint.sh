#!/bin/sh
set -e

# Uncomment to run DB migrations before start (idempotent):
# yarn workspace @monorepo/backend run db:migrate

exec "$@"

