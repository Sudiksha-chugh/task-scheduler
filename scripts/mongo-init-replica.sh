#!/usr/bin/env bash
set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongo:27017}"

echo "Waiting for MongoDB at ${MONGO_HOST}..."
until mongosh --host "${MONGO_HOST}" --quiet --eval "db.adminCommand('ping').ok" &>/dev/null; do
  sleep 1
done

echo "Initializing replica set rs0 (idempotent)..."
mongosh --host "${MONGO_HOST}" --quiet --eval "
  try {
    const status = rs.status();
    if (status.ok === 1) {
      print('Replica set already initialized.');
    }
  } catch (err) {
    rs.initiate({
      _id: 'rs0',
      members: [{ _id: 0, host: '${MONGO_HOST}' }],
    });
    print('Replica set rs0 initiated.');
  }
"

echo "Replica set init complete."
