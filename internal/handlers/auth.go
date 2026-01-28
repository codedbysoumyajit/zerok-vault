package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"

	"zerok-vault/internal/database"
	"zerok-vault/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"go.mongodb.org/mongo-driver/bson"
	"golang.org/x/crypto/argon2"
)

var jwtSecret = []byte("my-local-secret-key")

// Server-side Argon2 params (hashing the AuthKey one last time)
const (
	timeCost   = 1
	memory     = 64 * 1024
	threads    = 4
	keyLen     = 32
	saltLen    = 16
)

func Register(c *fiber.Ctx) error {
	var req struct {
		Email             string `json:"email"`
		AuthKey           string `json:"auth_key"`
		KdfSalt           string `json:"kdf_salt"`
		EncryptedVaultKey string `json:"encrypted_vault_key"`
		VaultKeyIV        string `json:"vault_key_iv"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
	}

	// 1. Generate server-side salt
	salt := make([]byte, saltLen)
	rand.Read(salt)
	
	// 2. Hash the Client's AuthKey so we don't store it raw
	authKeyBytes, _ := hex.DecodeString(req.AuthKey)
	hash := argon2.IDKey(authKeyBytes, salt, timeCost, memory, threads, keyLen)
	fullHash := hex.EncodeToString(salt) + "$" + hex.EncodeToString(hash)

	user := models.User{
		Email:             req.Email,
		AuthKeyHash:       fullHash,
		KdfSalt:           req.KdfSalt,
		EncryptedVaultKey: req.EncryptedVaultKey,
		VaultKeyIV:        req.VaultKeyIV,
		CreatedAt:         time.Now(),
	}

	_, err := database.DB.Collection("users").InsertOne(context.Background(), user)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "User creation failed (Email exists?)"})
	}

	return c.JSON(fiber.Map{"message": "User registered"})
}

func GetSalt(c *fiber.Ctx) error {
	var req struct{ Email string `json:"email"` }
	if err := c.BodyParser(&req); err != nil { return c.SendStatus(400) }

	var user models.User
	err := database.DB.Collection("users").FindOne(context.Background(), bson.M{"email": req.Email}).Decode(&user)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "User not found"})
	}
	return c.JSON(fiber.Map{"kdf_salt": user.KdfSalt})
}

func Login(c *fiber.Ctx) error {
	var req struct {
		Email   string `json:"email"`
		AuthKey string `json:"auth_key"`
	}
	if err := c.BodyParser(&req); err != nil { return c.SendStatus(400) }

	var user models.User
	if err := database.DB.Collection("users").FindOne(context.Background(), bson.M{"email": req.Email}).Decode(&user); err != nil {
		return c.Status(401).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	// Verify Hash
	parts := strings.Split(user.AuthKeyHash, "$")
	salt, _ := hex.DecodeString(parts[0])
	storedHash, _ := hex.DecodeString(parts[1])
	
	inputKeyBytes, _ := hex.DecodeString(req.AuthKey)
	newHash := argon2.IDKey(inputKeyBytes, salt, timeCost, memory, threads, keyLen)

	if hex.EncodeToString(newHash) != hex.EncodeToString(storedHash) {
		return c.Status(401).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	// Generate JWT
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID.Hex(),
		"exp":     time.Now().Add(time.Hour * 24).Unix(),
	})
	t, _ := token.SignedString(jwtSecret)

	return c.JSON(fiber.Map{
		"token":               t,
		"encrypted_vault_key": user.EncryptedVaultKey,
		"vault_key_iv":        user.VaultKeyIV,
	})
}
