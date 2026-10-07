package collector

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type DiskInfo struct {
	MountPoint string  `json:"mount_point"`
	TotalGB    float64 `json:"total_gb"`
	UsedGB     float64 `json:"used_gb"`
}

type DiskSummary struct {
	TotalGB float64    `json:"total_gb"`
	UsedGB  float64    `json:"used_gb"`
	Paths   []DiskInfo `json:"paths"`
}

func bytesToGB(b int64) float64 {
	gb := float64(b) / 1024 / 1024 / 1024
	return float64(int(gb*10+0.5)) / 10
}

func GetDiskInfo() (DiskSummary, error) {
	// -T thêm cột Type (filesystem type) để lọc đúng ổ đĩa thật
	// -B1 lấy đơn vị byte thô, tự convert GB sau cho chính xác
	out, err := exec.Command("df", "-T", "-B1").Output()
	if err != nil {
		return DiskSummary{}, fmt.Errorf("lỗi khi chạy df: %w", err)
	}

	// Whitelist: chỉ nhận filesystem thật, loại bỏ tmpfs, overlay, 9p, proc...
	realFSTypes := map[string]bool{
		"ext4":  true,
		"ext3":  true,
		"xfs":   true,
		"btrfs": true,
		"ntfs":  true,
	}

	var disks []DiskInfo
	var totalBytesSum, usedBytesSum int64

	lines := strings.Split(string(out), "\n")
	for i, line := range lines {
		if i == 0 || strings.TrimSpace(line) == "" {
			continue // bỏ dòng header và dòng trống
		}
		fields := strings.Fields(line)
		if len(fields) < 7 {
			continue // dòng không đủ field
		}

		fsType := fields[1]
		if !realFSTypes[fsType] {
			continue // bỏ qua filesystem ảo
		}

		totalBytes, err := strconv.ParseInt(fields[2], 10, 64)
		if err != nil {
			continue
		}
		usedBytes, err := strconv.ParseInt(fields[3], 10, 64)
		if err != nil {
			continue
		}
		mountPoint := fields[6]

		disks = append(disks, DiskInfo{
			MountPoint: mountPoint,
			TotalGB:    bytesToGB(totalBytes),
			UsedGB:     bytesToGB(usedBytes),
		})

		// cộng dồn bằng byte thô, convert GB sau cùng để tránh sai số làm tròn tích luỹ
		totalBytesSum += totalBytes
		usedBytesSum += usedBytes
	}

	return DiskSummary{
		TotalGB: bytesToGB(totalBytesSum),
		UsedGB:  bytesToGB(usedBytesSum),
		Paths:   disks,
	}, nil
}