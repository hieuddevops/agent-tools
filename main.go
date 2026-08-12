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

	printPretty(info)
}

// printPretty in kết quả dạng dễ đọc cho người dùng xem trực tiếp trên terminal
func printPretty(info collector.SystemInfo) {
	fmt.Println("=== System Scan Result ===")
	fmt.Printf("OS        : %s %s (%s)\n", info.OS.Name, info.OS.Version, info.OS.Arch)
	fmt.Printf("CPU cores : %d\n", info.CPUCores)
	fmt.Printf("RAM total : %.1f GB\n", info.RAMTotalGB)
	fmt.Println()
	fmt.Printf("Disk total: %.1f GB\n", info.Disk.TotalGB)
	fmt.Printf("Disk used : %.1f GB\n", info.Disk.UsedGB)
	fmt.Println("Disk paths:")
	for _, d := range info.Disk.Paths {
		fmt.Printf("  - %-20s %6.1f GB total, %6.1f GB used\n", d.MountPoint, d.TotalGB, d.UsedGB)
	}
	fmt.Println()
	fmt.Printf("Running services (%d):\n", len(info.Services))
	for _, s := range info.Services {
		fmt.Printf("  - %s\n", s.Name)
	}
	fmt.Println()
	fmt.Printf("Docker containers (%d):\n", len(info.Containers))
	for _, c := range info.Containers {
		fmt.Printf("  - %-20s %-30s %-10s %s\n", c.Name, c.Image, c.State, c.Ports)
	}
	fmt.Println()
	fmt.Printf("Kubernetes node : %v\n", info.Kubernetes.IsK8sNode)
	if info.Kubernetes.KubeletVer != "" {
		fmt.Printf("Kubelet version : %s\n", info.Kubernetes.KubeletVer)
	}
	if len(info.Kubernetes.Pods) > 0 {
		fmt.Printf("Pods (%d):\n", len(info.Kubernetes.Pods))
		for _, p := range info.Kubernetes.Pods {
			fmt.Printf("  - %-15s %-30s %s\n", p.Namespace, p.Name, p.Status)
		}
	}
}

// printJSON giữ lại để dùng sau khi cần gửi data lên backend (dạng máy đọc)
func printJSON(info collector.SystemInfo) {
	jsonData, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		fmt.Println("Lỗi khi encode JSON:", err)
		os.Exit(1)
	}
	fmt.Println(string(jsonData))
}