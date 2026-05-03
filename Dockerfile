# ----------------------------
# Stage 1: Build the Go Binary
# ----------------------------
FROM golang:1.25.4-alpine AS builder

# Install git required for fetching Go dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy dependency files first (better caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the application source
COPY . .

# Build the binary
# CGO_ENABLED=0 creates a statically linked binary (no external dependencies)
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/server

# ----------------------------
# Stage 2: Runtime with MongoDB
# ----------------------------
FROM mongo:7.0

WORKDIR /root/

# Add a tiny wait utility for the startup script.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		netcat-openbsd \
	&& rm -rf /var/lib/apt/lists/*

# Copy the binary from the builder stage
COPY --from=builder /app/main /usr/local/bin/zerok-vault

# Copy the frontend files (Fiber serves these statically)
COPY --from=builder /app/public ./public

# Copy the container entrypoint that starts MongoDB first
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
	&& mkdir -p /data/db /var/log/mongodb \
	&& chown -R mongodb:mongodb /data/db /var/log/mongodb

# The entrypoint chooses the Mongo URI based on whether auth is enabled.
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Start MongoDB locally and then launch the app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
