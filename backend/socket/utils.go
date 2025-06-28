package socket

import (
	"fmt"
	"math/rand"
)

var randomNames = []string{"🦊 Fox", "🐼 Panda", "🐧 Penguin", "🦁 Lion", "🐸 Frog"}

func GetRandomName() string {
	return randomNames[rand.Intn(len(randomNames))]
}

func GetRandomColor() string {
	hue := rand.Intn(360)
	return fmt.Sprintf("hsl(%d, 70%%, 60%%)", hue)
}
