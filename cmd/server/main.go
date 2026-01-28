package main

import (
	"zerok-vault/internal/database"
	"zerok-vault/internal/handlers"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	jwtware "github.com/gofiber/jwt/v3"
)

func main() {
	// 1. Connect to DB
	database.Connect()

	// 2. Setup Fiber
	app := fiber.New()
	app.Use(cors.New())

	// 3. Serve Frontend Files
	app.Static("/", "./public")

	// 4. API Routes
	api := app.Group("/api/v1")

	// Public
	api.Post("/register", handlers.Register)
	api.Post("/login", handlers.Login)
	api.Post("/get-salt", handlers.GetSalt)

	// Protected (JWT Required)
	// We create a new group for vault operations and apply JWT middleware to it
	vaultAPI := api.Group("/vault")
	
	vaultAPI.Use(jwtware.New(jwtware.Config{
		SigningKey: []byte("my-local-secret-key"),
	}))

	vaultAPI.Get("/", handlers.GetVault)
	vaultAPI.Post("/", handlers.AddItem)
	vaultAPI.Put("/:id", handlers.UpdateItem)
	vaultAPI.Delete("/:id", handlers.DeleteItem)

	// 5. Start Server
	app.Listen(":3000")
}
