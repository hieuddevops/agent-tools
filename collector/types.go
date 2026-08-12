package collector

type SystemInfo struct {
	CPUCores   int             `json:"cpu_cores"`
	RAMTotalGB float64         `json:"ram_total_gb"`
	Disk       DiskSummary     `json:"disk"`
	OS         OSInfo          `json:"os"`
	Services   []ServiceInfo   `json:"services"`
	Containers []ContainerInfo `json:"containers"`
	Kubernetes KubernetesInfo  `json:"kubernetes"`
}

func Collect() (SystemInfo, error) {
	cores, err := GetCPUCores()
	if err != nil {
		return SystemInfo{}, err
	}
	totalGB, _, err := GetRAMInfo()
	if err != nil {
		return SystemInfo{}, err
	}
	disk, err := GetDiskInfo()
	if err != nil {
		return SystemInfo{}, err
	}
	osInfo, err := GetOSInfo()
	if err != nil {
		return SystemInfo{}, err
	}
	services, err := GetServices()
	if err != nil {
		return SystemInfo{}, err
	}
	containers, err := GetDockerContainers()
	if err != nil {
		return SystemInfo{}, err
	}
	k8s, err := GetKubernetesInfo()
	if err != nil {
		return SystemInfo{}, err
	}

	return SystemInfo{
		CPUCores:   cores,
		RAMTotalGB: totalGB,
		Disk:       disk,
		OS:         osInfo,
		Services:   services,
		Containers: containers,
		Kubernetes: k8s,
	}, nil
}