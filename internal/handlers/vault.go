package handlers

import (
	"context"
	"time"
	"zerok-vault/internal/database"
	"zerok-vault/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v4"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func getUserID(c *fiber.Ctx) primitive.ObjectID {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	oid, _ := primitive.ObjectIDFromHex(claims["user_id"].(string))
	return oid
}

func GetVault(c *fiber.Ctx) error {
	userID := getUserID(c)
	cursor, _ := database.DB.Collection("items").Find(context.Background(), bson.M{"user_id": userID})
	var items []models.VaultItem
	if err := cursor.All(context.Background(), &items); err != nil {
		return c.JSON([]interface{}{})
	}
	if items == nil { return c.JSON([]interface{}{}) }
	return c.JSON(items)
}

func AddItem(c *fiber.Ctx) error {
	var req struct {
		EncryptedData string `json:"encrypted_data"`
		IV            string `json:"iv"`
	}
	if err := c.BodyParser(&req); err != nil { return c.SendStatus(400) }

	item := models.VaultItem{
		UserID:        getUserID(c),
		EncryptedData: req.EncryptedData,
		IV:            req.IV,
		UpdatedAt:     time.Now(),
	}

	res, _ := database.DB.Collection("items").InsertOne(context.Background(), item)
	return c.JSON(fiber.Map{"id": res.InsertedID})
}

// NEW: Update an item (used for Favorites / Soft Delete)
func UpdateItem(c *fiber.Ctx) error {
	idParam := c.Params("id")
	itemID, _ := primitive.ObjectIDFromHex(idParam)
	userID := getUserID(c)

	var req struct {
		EncryptedData string `json:"encrypted_data"`
		IV            string `json:"iv"`
	}
	if err := c.BodyParser(&req); err != nil { return c.SendStatus(400) }

	_, err := database.DB.Collection("items").UpdateOne(
		context.Background(),
		bson.M{"_id": itemID, "user_id": userID},
		bson.M{"$set": bson.M{
			"encrypted_data": req.EncryptedData,
			"iv":             req.IV,
			"updated_at":     time.Now(),
		}},
	)
	if err != nil { return c.SendStatus(500) }
	return c.SendStatus(200)
}

// NEW: Permanently Delete
func DeleteItem(c *fiber.Ctx) error {
	idParam := c.Params("id")
	itemID, _ := primitive.ObjectIDFromHex(idParam)
	userID := getUserID(c)

	_, err := database.DB.Collection("items").DeleteOne(
		context.Background(),
		bson.M{"_id": itemID, "user_id": userID},
	)
	if err != nil { return c.SendStatus(500) }
	return c.SendStatus(200)
}
