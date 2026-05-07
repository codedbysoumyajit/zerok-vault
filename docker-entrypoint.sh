#!/bin/sh
set -eu

DB_NAME="${MONGO_DB_NAME:-zerok_vault}"
APP_USER="${MONGO_APP_USERNAME:-}"
APP_PASS="${MONGO_APP_PASSWORD:-}"
REQUIRE_AUTH="${MONGO_REQUIRE_AUTH:-false}"
AUTH_ENABLED="false"
AUTH_BOOTSTRAP_MARKER="/data/db/.mongo-auth-ready"

mkdir -p /data/db /var/log/mongodb
chown -R mongodb:mongodb /data/db /var/log/mongodb

if [ -n "$APP_USER" ] || [ -n "$APP_PASS" ] || [ "$REQUIRE_AUTH" = "true" ]; then
    if [ -z "$APP_USER" ] || [ -z "$APP_PASS" ]; then
        echo "MONGO_APP_USERNAME and MONGO_APP_PASSWORD are required when MongoDB auth is enabled" >&2
        exit 1
    fi

    AUTH_ENABLED="true"
fi

start_mongod() {
    if [ "$1" = "true" ]; then
        su -s /bin/sh mongodb -c "mongod --bind_ip 127.0.0.1 \
            --dbpath /data/db \
            --logpath /var/log/mongodb/mongod.log \
            --logappend \
            --fork \
            --auth"
    else
        su -s /bin/sh mongodb -c "mongod --bind_ip 127.0.0.1 \
            --dbpath /data/db \
            --logpath /var/log/mongodb/mongod.log \
            --logappend \
            --fork"
    fi
}

wait_for_mongo() {
    for attempt in $(seq 1 30); do
        if nc -z 127.0.0.1 27017; then
            return 0
        fi

        sleep 1
    done

    echo "MongoDB did not become ready in time" >&2
    exit 1
}

bootstrap_auth_user() {
    cat > /tmp/bootstrap-mongo-user.js <<'EOF'
const dbName = process.env.MONGO_DB_NAME || "zerok_vault";
const user = process.env.MONGO_APP_USERNAME;
const password = process.env.MONGO_APP_PASSWORD;
const database = db.getSiblingDB(dbName);

if (!database.getUser(user)) {
  database.createUser({
    user,
    pwd: password,
    roles: [{ role: "readWrite", db: dbName }],
  });
}
EOF

    su -p -s /bin/sh mongodb -c 'mongosh --quiet /tmp/bootstrap-mongo-user.js'
}

if [ "$AUTH_ENABLED" = "true" ] && [ ! -f "$AUTH_BOOTSTRAP_MARKER" ]; then
    start_mongod false
    wait_for_mongo
    bootstrap_auth_user

    if [ -f "$AUTH_BOOTSTRAP_MARKER" ]; then
        rm -f "$AUTH_BOOTSTRAP_MARKER"
    fi

    su -s /bin/sh mongodb -c 'mongosh --quiet --eval "db.getSiblingDB(\"admin\").shutdownServer({ force: true })"' || true

    start_mongod true
    wait_for_mongo
    touch "$AUTH_BOOTSTRAP_MARKER"
else
    start_mongod "$AUTH_ENABLED"
    wait_for_mongo
fi

if [ -z "${MONGO_URI:-}" ]; then
    if [ "$AUTH_ENABLED" = "true" ]; then
        export MONGO_URI="mongodb://${APP_USER}:${APP_PASS}@127.0.0.1:27017/${DB_NAME}?authSource=${DB_NAME}"
    else
        export MONGO_URI="mongodb://127.0.0.1:27017/${DB_NAME}"
    fi
fi

# If DEV=true, run live-reload using air (requires source to be mounted or copied into /app)
if [ "${DEV:-false}" = "true" ]; then
    echo "Starting in DEV mode (air live-reload)"
    cd /app || true
    # prefer air from /go/bin then /usr/local/bin
    if command -v air >/dev/null 2>&1; then
        exec air -c .air.toml
    elif [ -x "/go/bin/air" ]; then
        exec /go/bin/air -c .air.toml
    else
        echo "air not found in image; falling back to running the built binary"
        exec /usr/local/bin/zerok-vault
    fi
else
    exec /usr/local/bin/zerok-vault
fi
