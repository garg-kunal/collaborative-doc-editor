package socket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Client struct {
	Conn *websocket.Conn
	Send chan []byte
	ID   string
	Data map[string]map[string]string
}

type Message struct {
	Type string                       `json:"type"`
	Data map[string]map[string]string `json:"data"`
}

type WebSocketManager struct {
	Clients    map[*Client]bool
	Broadcast  chan []byte
	Register   chan *Client
	Unregister chan *Client
	Mutex      sync.RWMutex
}

func NewWebSocketManager() *WebSocketManager {
	return &WebSocketManager{
		Clients:    make(map[*Client]bool),
		Broadcast:  make(chan []byte),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
	}
}

func (manager *WebSocketManager) Run() {
	for {
		select {
		case client := <-manager.Register:
			manager.Mutex.Lock()
			manager.Clients[client] = true
			manager.Mutex.Unlock()
			log.Printf("Client connected: %s", client.ID)

		case client := <-manager.Unregister:
			manager.Mutex.Lock()
			if _, ok := manager.Clients[client]; ok {
				delete(manager.Clients, client)
				close(client.Send)

				// Notify others about user disconnection
				go manager.HandleDeleteUser(client)
			}
			manager.Mutex.Unlock()
			log.Printf("Client disconnected: %s", client.ID)

		case message := <-manager.Broadcast:
			manager.BroadcastToAllClients(message)
		}
	}
}

// New method to safely broadcast messages to all clients
func (manager *WebSocketManager) BroadcastToAllClients(message []byte) {
	manager.Mutex.RLock()
	defer manager.Mutex.RUnlock()

	for client := range manager.Clients {
		select {
		case client.Send <- message:
			// Message sent successfully
		default:
			// Client's send buffer is full, remove the client
			close(client.Send)
			manager.Mutex.RUnlock()
			manager.Mutex.Lock()
			delete(manager.Clients, client)
			manager.Mutex.Unlock()
			manager.Mutex.RLock()
		}
	}
}

func (manager *WebSocketManager) HandleWebSocketConnections(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			// Allow all connections (modify for production)
			return true
		},
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	data := map[string]map[string]string{
		"userData": {
			"userId":    r.RemoteAddr,
			"userName":  GetRandomName(),
			"userColor": GetRandomColor(),
		},
	}

	client := &Client{
		Conn: conn,
		Send: make(chan []byte, 256),
		ID:   r.RemoteAddr,
		Data: data,
	}

	// Register the client first
	manager.Register <- client

	// Then start the handlers
	go manager.HandleClientRead(client)
	go manager.HandleClientWrite(client)

	// Handle user data after adding client to the map
	go manager.HandleUserData(client)
}

func (manager *WebSocketManager) HandleDeleteUser(client *Client) {
	message := Message{
		Type: "user-removed",
		Data: client.Data,
	}
	jsonData, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshalling user-removed message: %v", err)
		return
	}
	manager.Broadcast <- jsonData
}

func (manager *WebSocketManager) HandleUserData(client *Client) {
	// 1. Send user data to itself first
	selfMessage := Message{
		Type: "user-data",
		Data: client.Data,
	}
	jsonData, err := json.Marshal(selfMessage)
	if err != nil {
		log.Printf("Error marshalling user-data message: %v", err)
		return
	}

	// Send directly to the client, not through broadcast
	client.Send <- jsonData
	log.Printf("Sent user data to client: %s", client.ID)

	// 2. Send existing users to the new client
	manager.Mutex.RLock()
	for existingClient := range manager.Clients {
		// Don't send client's own data back to itself
		if existingClient.ID == client.ID {
			continue
		}

		existingUserMsg := Message{
			Type: "user-added",
			Data: existingClient.Data,
		}

		existingUserData, err := json.Marshal(existingUserMsg)
		if err != nil {
			log.Printf("Error marshalling existing user data: %v", err)
			continue
		}

		// Send directly to the client
		client.Send <- existingUserData
		log.Printf("Sent existing user %s data to new client %s", existingClient.ID, client.ID)
	}
	manager.Mutex.RUnlock()

	// 3. Announce new client to all other clients
	newUserMsg := Message{
		Type: "user-added",
		Data: client.Data,
	}
	newUserData, err := json.Marshal(newUserMsg)
	if err != nil {
		log.Printf("Error marshalling new user announcement: %v", err)
		return
	}

	// Broadcast to all clients except the new one
	manager.Broadcast <- newUserData
	log.Printf("Announced new client %s to all other clients", client.ID)
}

func (manager *WebSocketManager) HandleClientRead(client *Client) {
	defer func() {
		manager.Unregister <- client
		client.Conn.Close()
	}()

	for {
		_, message, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}

		log.Printf("Received message from %s: %s", client.ID, string(message))
		manager.Broadcast <- message
	}
}

func (manager *WebSocketManager) HandleClientWrite(client *Client) {
	defer func() {
		client.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			if !ok {
				// Channel was closed, terminate the connection
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				log.Printf("Client %s send channel closed", client.ID)
				return
			}

			// Send each message individually
			err := client.Conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("Error sending message to client %s: %v", client.ID, err)
				return
			}

			// Small delay to prevent overwhelming the client
			time.Sleep(time.Millisecond * 5)
		}
	}
}
