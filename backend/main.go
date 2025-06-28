package main

import (
	"log"

	"backend/socket"

	"github.com/gin-gonic/gin"
)

func main() {
	wsManager := socket.NewWebSocketManager()
	go wsManager.Run()

	router := gin.Default()

	router.Static("/static", "./static")

	router.GET("/ws", func(c *gin.Context) {
		wsManager.HandleWebSocketConnections(c.Writer, c.Request)
	})

	log.Println("Server starting on :8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatal("Server error:", err)
	}
}
