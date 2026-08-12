package collector

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

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