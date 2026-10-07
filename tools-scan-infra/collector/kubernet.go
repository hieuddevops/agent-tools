package collector

import (
	"fmt"
	"os/exec"
	"strings"
)

type PodInfo struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
}

type KubernetesInfo struct {
	IsK8sNode  bool      `json:"is_k8s_node"`  // node này có phải thành viên của 1 cluster K8s không
	KubeletVer string    `json:"kubelet_version,omitempty"`
	Pods       []PodInfo `json:"pods,omitempty"` // chỉ có nếu kubectl truy vấn được
}

func GetKubernetesInfo() (KubernetesInfo, error) {
	info := KubernetesInfo{IsK8sNode: false}

	// Bước 1: kiểm tra kubelet có tồn tại và đang chạy không
	// -> đây là dấu hiệu chắc chắn nhất cho biết node này thuộc về 1 K8s cluster
	if _, err := exec.LookPath("kubelet"); err == nil {
		info.IsK8sNode = true
		out, err := exec.Command("kubelet", "--version").Output()
		if err == nil {
			info.KubeletVer = strings.TrimSpace(string(out))
		}
	}

	// Bước 2: nếu có kubectl VÀ config hợp lệ, thử lấy danh sách pods
	// Không coi lỗi ở bước này là lỗi nghiêm trọng - node worker thường không có quyền này
	if _, err := exec.LookPath("kubectl"); err == nil {
		pods, err := getPods()
		if err == nil {
			info.Pods = pods
			info.IsK8sNode = true // có kubectl truy vấn được nghĩa là chắc chắn có cluster
		}
	}

	return info, nil
}

func getPods() ([]PodInfo, error) {
	// --all-namespaces: lấy pod ở mọi namespace, không chỉ default
	out, err := exec.Command("kubectl", "get", "pods", "--all-namespaces",
		"--no-headers", "-o", "custom-columns=NAME:.metadata.name,NS:.metadata.namespace,STATUS:.status.phase").Output()
	if err != nil {
		return nil, fmt.Errorf("lỗi khi chạy kubectl: %w", err)
	}

	var pods []PodInfo
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		pods = append(pods, PodInfo{
			Name:      fields[0],
			Namespace: fields[1],
			Status:    fields[2],
		})
	}
	return pods, nil
}