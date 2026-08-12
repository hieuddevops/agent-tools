package main

import (
	"encoding/json"
	"fmt"
	"os"

	"agent-tools/collector"
)

func main() {
	info, err := collector.Collect()
	if err != nil {
		fmt.Println("Lỗi khi scan:", err)
		os.Exit(1)
	}

	jsonData, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		fmt.Println("Lỗi khi encode JSON:", err)
		os.Exit(1)
	}

	fmt.Println(string(jsonData))
}