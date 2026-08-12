package collector

import (
	"fmt"
	"os/exec"
	"strings"
)

type ServiceInfo struct {
	Name string `json:"name"`
}

func GetServices() ([]ServiceInfo, error) {
	out, err := exec.Command("systemctl", "list-units",
		"--type=service", "--state=running", "--no-legend", "--plain").Output()
	if err != nil {
		return nil, fmt.Errorf("lỗi khi chạy systemctl: %w", err)
	}

	var services []ServiceInfo
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		serviceName := fields[0]
		services = append(services, ServiceInfo{Name: serviceName})
	}

	return services, nil
}