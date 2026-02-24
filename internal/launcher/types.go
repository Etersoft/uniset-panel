package launcher

// Process описывает состояние одного процесса в Launcher
type Process struct {
	Name         string `json:"name"`
	State        string `json:"state"`
	PID          int    `json:"pid,omitempty"`
	Uptime       int64  `json:"uptime,omitempty"`
	RestartCount int    `json:"restartCount,omitempty"`
	LastError    string `json:"lastError,omitempty"`
	Group        string `json:"group,omitempty"`
	Critical     bool   `json:"critical,omitempty"`
	Manual       bool   `json:"manual,omitempty"`
	Oneshot      bool   `json:"oneshot,omitempty"`
	Skip         bool   `json:"skip,omitempty"`
}

// ProcessGroup описывает группу процессов
type ProcessGroup struct {
	Name      string   `json:"name"`
	Order     int      `json:"order,omitempty"`
	DependsOn []string `json:"dependsOn,omitempty"`
	Processes []string `json:"processes,omitempty"`
}

// LauncherStatus описывает полный статус Launcher'а
type LauncherStatus struct {
	Node              string         `json:"node,omitempty"`
	Processes         []Process      `json:"processes"`
	Groups            []ProcessGroup `json:"groups,omitempty"`
	AllRunning        bool           `json:"allRunning"`
	AnyCriticalFailed bool           `json:"anyCriticalFailed"`
}

// HealthStatus описывает результат health check
type HealthStatus struct {
	Status            string `json:"status"` // healthy/unhealthy
	AllRunning        bool   `json:"allRunning"`
	AnyCriticalFailed bool   `json:"anyCriticalFailed"`
}
