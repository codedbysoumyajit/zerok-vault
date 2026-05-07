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

WORKDIR /app

# Install small utilities and git (needed for `go install` in-dev)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		ca-certificates \
		netcat-openbsd \
		curl \
		git \
	&& rm -rf /var/lib/apt/lists/*

# Install Go runtime/toolchain (needed for DEV mode's live-reload)
ENV GOLANG_VERSION=1.25.4
RUN curl -fsSL https://go.dev/dl/go${GOLANG_VERSION}.linux-amd64.tar.gz -o /tmp/go.tar.gz \
	&& tar -C /usr/local -xzf /tmp/go.tar.gz \
	&& rm /tmp/go.tar.gz
ENV PATH=/usr/local/go/bin:/go/bin:$PATH

# Install air (live-reload) into /go/bin
RUN /usr/local/go/bin/go install github.com/cosmtrek/air@v1.40.10 || true

# Copy the binary from the builder stage (production binary)
COPY --from=builder /app/main /usr/local/bin/zerok-vault

# Copy the source & public files so DEV mode can mount/execute with live reload
# (this increases image size but keeps a single-image workflow)
COPY . /app

# Copy the container entrypoint that starts MongoDB first
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
	&& mkdir -p /data/db /var/log/mongodb \
	&& chown -R mongodb:mongodb /data/db /var/log/mongodb

# The entrypoint chooses the Mongo URI based on whether auth is enabled.
ENV PORT=3000

# Expose the application port
EXPOSE 3000

# Start MongoDB locally and then launch the app or air (if DEV=true)
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
