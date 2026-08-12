package collector

type SystemInfo struct {
	CPUCores   int         `json:"cpu_cores"`
	RAMTotalGB float64     `json:"ram_total_gb"`
	Disk       DiskSummary `json:"disk"`
	OS         OSInfo      `json:"os"`
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

	return SystemInfo{
		CPUCores:   cores,
		RAMTotalGB: totalGB,
		Disk:       disk,
		OS:         osInfo,
	}, nil
}