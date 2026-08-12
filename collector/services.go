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
	// systemctl list-units: liệt kê các service đang chạy (running)
	// --type=service: chỉ lấy service, bỏ qua target/socket/timer...
	// --state=running: chỉ lấy cái đang chạy, bỏ qua inactive/failed
	// --no-legend: bỏ dòng header/footer, chỉ lấy data
	// --plain: output dạng đơn giản, dễ parse
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
		// cột đầu tiên là tên service, ví dụ: nginx.service
		serviceName := fields[0]
		services = append(services, ServiceInfo{Name: serviceName})
	}

	return services, nil
}