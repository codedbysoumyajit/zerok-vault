# ----------------------------
# Stage 1: Build the Go Binary
# ----------------------------
FROM golang:1.21-alpine AS builder

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
# Stage 2: Create the Final Image
# ----------------------------
FROM alpine:latest

WORKDIR /root/

# Install ca-certificates (required to connect to HTTPS MongoDB Atlas)
RUN apk --no-cache add ca-certificates

# Copy the binary from the builder stage
COPY --from=builder /app/main .

# Copy the frontend files (Fiber serves these statically)
COPY --from=builder /app/public ./public

# Copy the .env file (Optional: In production, pass these as ENV vars)
# COPY .env . 

# Expose the application port
EXPOSE 3000

# Command to run the executable
CMD ["./main"]
