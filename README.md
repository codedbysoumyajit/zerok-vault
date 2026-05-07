# 🛡️ ZeroK Vault

![Go](https://img.shields.io/badge/Backend-Go%20%2F%20Fiber-00ADD8?style=for-the-badge&logo=go) ![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb) ![JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript) ![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge)

ZeroK Vault is a self-hostable, zero-knowledge password manager focused on privacy. All encryption/decryption happens in the browser — the server stores only encrypted blobs.

Table of contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Security Model](#security-model)
- [Installation](#installation)
  - [Docker (recommended)](#docker-recommended)
  - [Manual (local dev)](#manual-local-dev)
- [Project Structure](#project-structure)
- [License](#license)

## Features

- Zero-knowledge architecture (client-side crypto)
- AES-256-GCM per-item encryption
- Mobile-first responsive UI
- Favorites, Trash, Encrypted Search
- Fast API with Go + Fiber

## Tech Stack

- Backend: Go (Fiber)
- Database: MongoDB
- Frontend: HTML/CSS/Vanilla JS

## Security Model

ZeroK Vault uses a two-key approach:

- PBKDF2 derives 64 bytes from the master password. Bytes 0–32 are the auth key (sent to the server), bytes 32–64 are the wrapper key (never leaves the client).
- A random 32-byte vault key encrypts stored items; it is wrapped by the wrapper key.
- Each item uses AES-256-GCM with a unique IV.

## Installation

### Docker (recommended)

```bash
git clone https://github.com/codedbysoumyajit/zerok-vault.git
cd zerok-vault
docker build -t zerok-vault .
docker run -d --name zerok-vault -p 3000:3000 -v zerok-vault-data:/data/db zerok-vault
```

To enable Mongo auth on first start (container creates user):

```bash
docker run -d --name zerok-vault \
  -e MONGO_REQUIRE_AUTH=true \
  -e MONGO_APP_USERNAME=zerokvault \
  -e MONGO_APP_PASSWORD='replace-with-a-strong-password' \
  -p 3000:3000 -v zerok-vault-data:/data/db zerok-vault
```

Open http://localhost:3000

### Manual (local dev)

```bash
go mod download
MONGO_URI=mongodb://localhost:27017 go run ./cmd/server/main.go
```

### Run development (mount working tree):

```bash
docker run --rm -it \
  -e DEV=true \
  -p 3000:3000 \
  -v "$PWD":/app:delegated \
  -v zerok-vault-data:/data/db \
  zerok-vault
```


## Project Structure

```
zerok-vault/
├── cmd/server/       # Application entry point
├── internal/         # Database, handlers, models, middleware
├── public/           # Frontend (HTML/CSS/JS)
├── Dockerfile        # Container definition (single-image dev+prod)
└── go.mod
```

## License

Distributed under the GPL-3.0 license. See LICENSE for details.

Made with ❤️ by Soumyajit





