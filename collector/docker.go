package collector

import (
	"fmt"
	"os/exec"
	"strings"
)

type ContainerInfo struct {
	Name  string `json:"name"`
	Image string `json:"image"`
	State string `json:"state"`
	Ports string `json:"ports"`
}

func GetDockerContainers() ([]ContainerInfo, error) {
	// Kiểm tra docker có tồn tại không trước, tránh lỗi khó hiểu nếu server không có Docker
	if _, err := exec.LookPath("docker"); err != nil {
		return []ContainerInfo{}, nil // không có docker -> trả về list rỗng, không phải lỗi
	}

	// -a: lấy cả container đã dừng, không chỉ đang chạy
	// --format: tự định dạng output bằng ký tự phân cách riêng, dễ parse hơn cột mặc định
	out, err := exec.Command("docker", "ps", "-a",
		"--format", "{{.Names}}|{{.Image}}|{{.State}}|{{.Ports}}").Output()
	if err != nil {
		return nil, fmt.Errorf("lỗi khi chạy docker ps: %w", err)
	}

	var containers []ContainerInfo
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Split(line, "|")
		if len(fields) < 4 {
			continue
		}
		containers = append(containers, ContainerInfo{
			Name:  fields[0],
			Image: fields[1],
			State: fields[2],
			Ports: fields[3],
		})
	}

	return containers, nil
}