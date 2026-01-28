package database

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var DB *mongo.Database

func Connect() {
	// 1. Load .env file
	// We don't panic here if the file is missing, because in production 
	// (e.g., Docker/Cloud), env vars might be injected directly by the OS.
	if err := godotenv.Load(); err != nil {
		log.Println("Note: No .env file found, relying on System Environment Variables")
	}

	// 2. Get URI from Environment Variable
	uri := os.Getenv("MONGO_URI")
	if uri == "" {
		log.Fatal("Error: MONGO_URI is not set in .env file or environment variables")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 3. Connect
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatal("MongoDB Connection Error: ", err)
	}

	// 4. Verify Connection (Ping)
	if err := client.Ping(ctx, nil); err != nil {
		log.Fatal("MongoDB Ping Failed: ", err)
	}

	DB = client.Database("zerok_vault")
	log.Println("Connected to MongoDB successfully")
}
