# 🛡️ ZeroK Vault

![Go](https://img.shields.io/badge/Backend-Go%20%2F%20Fiber-00ADD8?style=for-the-badge&logo=go)
![MongoDB](https://img.shields.io/badge/Database-MongoDB-47A248?style=for-the-badge&logo=mongodb)
![JS](https://img.shields.io/badge/Frontend-Vanilla%20JS-F7DF1E?style=for-the-badge&logo=javascript)
![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge)

**ZeroK Vault** is a self-hostable, zero-knowledge password manager built for privacy enthusiasts. It ensures that **only you** hold the keys to your data. The server acts as a blind storage container and never sees your master password or your unencrypted secrets.

> **"We can't read your passwords, even if we wanted to."**

---

## ✨ Features

* **🚫 Zero-Knowledge Architecture:** All encryption/decryption happens in the browser.
* **🔒 AES-256-GCM Encryption:** Military-grade authenticated encryption.
* **📱 Mobile-First Design:** Responsive UI with a native app feel (Sticky nav, FAB).
* **🎨 Modern UI:** Glassmorphism aesthetics with persistent **Dark Mode**.
* **❤️ Favorites & Trash:** Organize your most used credentials and recover deleted ones.
* **🔍 Encrypted Search:** Filter through your vault instantly (client-side).
* **⚡ High Performance:** Built on Golang (Fiber) for blazing fast API responses.

---

## 🛠️ Tech Stack

### Backend
* **Language:** Golang (1.21+)
* **Framework:** [Gofiber](https://gofiber.io/) (Fastest Go Web Framework)
* **Database:** MongoDB (Atlas or Local)
* **Auth:** JWT (JSON Web Tokens) with Argon2id hashing.

### Frontend
* **Core:** HTML5, CSS3, Vanilla JavaScript (ES6+).
* **Crypto:** Native Browser [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).
* **Icons:** [Phosphor Icons](https://phosphoricons.com/).
* **Font:** Plus Jakarta Sans.

---

## 🔐 Encryption & Security Model

ZeroK Vault uses a **Two-Key Architecture** to ensure security:

1.  **Key Derivation (PBKDF2):**
    When you enter your Master Password, we derive 64 bytes of key material using `PBKDF2` with a unique, per-user salt and 100,000 iterations.
    * **Bytes 0-32 (Auth Key):** Sent to the server to log in. The server hashes this *again* using Argon2id before storing it.
    * **Bytes 32-64 (Wrapper Key):** Never leaves your device. Used to wrap/unwrap your Vault Key.

2.  **Vault Key (AES-256):**
    A random 32-byte key generated upon registration. This key encrypts your actual data. It is stored in the database encrypted by your Wrapper Key.

3.  **Item Encryption (AES-GCM):**
    Every password entry is encrypted individually using `AES-256-GCM` with a unique 96-bit IV (Initialization Vector). This provides both confidentiality and integrity checks.

---

## 🚀 Roadmap

We are actively working on the following features:

- [ ] **PWA Support:** Install as a native app on iOS/Android.
- [ ] **Identity Storage:** Form filling profiles (Name, Address, Phone).
- [ ] **Credit Cards:** Secure storage for payment methods.
- [ ] **Secure Notes:** Encrypted text blobs for non-password data.
- [ ] **SSH Keys:** Storage for developer keys.
- [ ] **Website Launching:** Click-to-open URLs from vault items.
- [ ] **Category Management:** Folders and tagging system.
- [ ] **WASM Optimization:** Porting Argon2 to WebAssembly for faster client-side hashing.
- [ ] **Duress Mode:** "Panic" password that wipes data or opens a fake vault.
- [ ] **Browser Extensions:** Auto-fill for Chrome & Firefox.
- [ ] **Breach Monitoring:** k-anonymity check against HavelBeenPwned.
- [ ] **TOTP Authenticator:** Built-in 2FA code generator.
---

## 📋 Prerequisites

* **Go:** v1.21 or higher.
* **MongoDB:** A running instance (Local or Atlas).
* **Docker:** (Optional, for containerized deployment).

---

## ⚡ Installation

### Option A: 🐳 Docker (Recommended)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/codedbysoumyajit/zerok-vault.git
    cd zerok-vault
    ```

2.  **Build the Image:**
    ```bash
    docker build -t zerok-vault .
    ```

3.  **Run the Container:**
    Replace the Mongo URI with your own credentials.
    ```bash
    docker run -p 3000:3000 \
      -e MONGO_URI="mongodb+srv://user:pass@cluster.mongodb.net/?appName=Cluster0" \
      zerok-vault
    ```

4.  **Access:** Open `http://localhost:3000` in your browser.

---

### Option B: 🛠️ Manual Setup

1.  **Configure Environment:**
    Create a `.env` file in the root directory:
    ```env
    MONGO_URI=mongodb://localhost:27017
    ```

2.  **Install Dependencies:**
    ```bash
    go mod download
    ```

3.  **Run the Server:**
    ```bash
    go run ./cmd/server/main.go
    ```

---

## 📂 Project Structure

```text
zerok-vault/
├── cmd/server/       # Application entry point
├── internal/
│   ├── database/     # MongoDB connection logic
│   ├── handlers/     # HTTP Controllers (Auth, Vault CRUD)
│   ├── models/       # Struct definitions
│   └── middleware/   # JWT Authentication
├── public/           # Static Frontend (HTML/CSS/JS)
├── Dockerfile        # Container definition
└── go.mod            # Dependencies
```
---

## 📄 License

Distributed under the **GPL-3.0 license**. See `LICENSE` for more information.

---

Made with ❤️ by Soumyajit

