package collector

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type OSInfo struct {
	Name    string `json:"name"`    // ví dụ: "Ubuntu"
	Version string `json:"version"` // ví dụ: "22.04.3 LTS"
	Arch    string `json:"arch"`    // ví dụ: "amd64"
}

func GetOSInfo() (OSInfo, error) {
	file, err := os.Open("/etc/os-release")
	if err != nil {
		return OSInfo{}, fmt.Errorf("lỗi khi đọc /etc/os-release: %w", err)
	}
	defer file.Close() // đảm bảo file luôn được đóng khMi hàm kết thúc, dù có lỗi hay không

	var name, version string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "NAME=") {
			name = extractValue(line)
		}
		if strings.HasPrefix(line, "VERSION=") {
			version = extractValue(line)
		}
	}

	if err := scanner.Err(); err != nil {
		return OSInfo{}, fmt.Errorf("lỗi khi đọc file: %w", err)
	}

	return OSInfo{
		Name:    name,
		Version: version,
		Arch:    getArch(),
	}, nil
}

// extractValue lấy phần giá trị sau dấu = và bỏ dấu ngoặc kép
// ví dụ: NAME="Ubuntu" -> Ubuntu
func extractValue(line string) string {
	parts := strings.SplitN(line, "=", 2)
	if len(parts) < 2 {
		return ""
	}
	return strings.Trim(parts[1], `"`)
}

// getArch lấy kiến trúc CPU bằng lệnh uname -m (x86_64, aarch64...)
func getArch() string {
	out, err := exec.Command("uname", "-m").Output()
	if err != nil {
		return "unknown"
	}
	return strings.TrimSpace(string(out))
}