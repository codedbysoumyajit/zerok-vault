package models

import (
	"go.mongodb.org/mongo-driver/bson/primitive"
	"time"
)

type User struct {
	ID                primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Email             string             `bson:"email" json:"email"`
	AuthKeyHash       string             `bson:"auth_key_hash" json:"-"`
	KdfSalt           string             `bson:"kdf_salt" json:"kdf_salt"`
	EncryptedVaultKey string             `bson:"encrypted_vault_key" json:"encrypted_vault_key"`
	VaultKeyIV        string             `bson:"vault_key_iv" json:"vault_key_iv"`
	CreatedAt         time.Time          `bson:"created_at" json:"created_at"`
}

type VaultItem struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID        primitive.ObjectID `bson:"user_id" json:"user_id"`
	EncryptedData string             `bson:"encrypted_data" json:"encrypted_data"`
	IV            string             `bson:"iv" json:"iv"`
	UpdatedAt     time.Time          `bson:"updated_at" json:"updated_at"`
}
