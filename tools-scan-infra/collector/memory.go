package collector

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

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