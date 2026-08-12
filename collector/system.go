package collector

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type SystemInfo struct {
	CPUCores   int     `json:"cpu_cores"`
	RAMTotalGB float64 `json:"ram_total_gb"`
}

func GetCPUCores() (int, error) {
	out, err := exec.Command("nproc").Output()
	if err != nil {
		return 0, fmt.Errorf("lỗi khi chạy nproc: %w", err)
	}
	cores, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil {
		return 0, fmt.Errorf("lỗi parse kết quả nproc: %w", err)
	}
	return cores, nil
}

// mbToGB convert MB sang GB, làm tròn 1 chữ số thập phân (khớp free -h)
func mbToGB(mb int) float64 {
	gb := float64(mb) / 1024
	return float64(int(gb*10+0.5)) / 10
}

func GetRAMInfo() (totalGB float64, usedGB float64, err error) {
	out, err := exec.Command("free", "-m").Output()
	if err != nil {
		return 0, 0, fmt.Errorf("lỗi khi chạy free: %w", err)
	}
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "Mem:") {
			fields := strings.Fields(line)
			totalMB, err := strconv.Atoi(fields[1])
			if err != nil {
				return 0, 0, fmt.Errorf("lỗi parse total RAM: %w", err)
			}
			usedMB, err := strconv.Atoi(fields[2])
			if err != nil {
				return 0, 0, fmt.Errorf("lỗi parse used RAM: %w", err)
			}
			return mbToGB(totalMB), mbToGB(usedMB), nil
		}
	}
	return 0, 0, fmt.Errorf("không tìm thấy dòng Mem: trong output free")
}

func Collect() (SystemInfo, error) {
	cores, err := GetCPUCores()
	if err != nil {
		return SystemInfo{}, err
	}

	totalGB, _, err := GetRAMInfo() // dùng _ để bỏ qua usedGB, không cần biến này nữa
	if err != nil {
		return SystemInfo{}, err
	}

	return SystemInfo{
		CPUCores:   cores,
		RAMTotalGB: totalGB,
	}, nil
}