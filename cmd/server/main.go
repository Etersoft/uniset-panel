package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"log/slog"

	"github.com/pv/uniset-panel/internal/api"
	"github.com/pv/uniset-panel/internal/config"
	"github.com/pv/uniset-panel/internal/dashboard"
	"github.com/pv/uniset-panel/internal/ionc"
	"github.com/pv/uniset-panel/internal/journal"
	"github.com/pv/uniset-panel/internal/launcher"
	"github.com/pv/uniset-panel/internal/logger"
	"github.com/pv/uniset-panel/internal/logserver"
	"github.com/pv/uniset-panel/internal/modbus"
	"github.com/pv/uniset-panel/internal/opcua"
	"github.com/pv/uniset-panel/internal/recording"
	"github.com/pv/uniset-panel/internal/sensorconfig"
	"github.com/pv/uniset-panel/internal/server"
	"github.com/pv/uniset-panel/internal/sm"
	"github.com/pv/uniset-panel/internal/storage"
	"github.com/pv/uniset-panel/internal/uwsgate"
	"github.com/pv/uniset-panel/ui"
)

// Version is set at build time via ldflags
var Version = "0.4.0"

func main() {
	cfg := config.Parse()
	logger.Init(cfg.LogFormat, config.ParseLogLevel(cfg.LogLevel))

	store := setupStorage(cfg)
	defer store.Close()

	perServerConfigs := loadSensorConfigs(cfg)
	controlsEnabled := len(perServerConfigs) > 0

	logServerMgr := logserver.NewManager(slog.Default())
	defer logServerMgr.Close()

	sseHub := api.NewSSEHub()
	serverMgr := server.NewManager(store, cfg.PollInterval, cfg.HistoryTTL, cfg.UnisetSupplier, cfg.GetSensorBatchSize())
	controlMgr := setupControl(cfg, sseHub)
	recordingMgr := setupRecording(cfg)
	setupServerCallbacks(serverMgr, sseHub, recordingMgr)
	launcherMgr := setupLauncher(cfg, sseHub)

	// Add servers from configuration
	for _, srvCfg := range cfg.Servers {
		sc := perServerConfigs[srvCfg.ID]
		if err := serverMgr.AddServerWithSensorConfig(srvCfg, sc); err != nil {
			slog.Error("Failed to add server", "url", srvCfg.URL, "error", err)
		}
	}

	handlers := setupHandlers(cfg, store, serverMgr, sseHub, perServerConfigs,
		controlsEnabled, logServerMgr, controlMgr, recordingMgr, launcherMgr)

	dashboardMgr := setupDashboards(cfg, handlers)
	_ = dashboardMgr
	journalMgr, journalPollers := setupJournals(cfg, handlers, sseHub)

	// Create SM poller if configured
	smPoller := setupSMPoller(cfg, store, sseHub, handlers)

	// Create API server
	var serverOpts []api.ServerOption
	if cfg.JSFile != "" {
		serverOpts = append(serverOpts, api.WithJSFile(cfg.JSFile))
	}
	if cfg.CSSFile != "" {
		serverOpts = append(serverOpts, api.WithCSSFile(cfg.CSSFile))
	}
	apiServer := api.NewServer(handlers, ui.Content, serverOpts...)

	// Start pollers
	if smPoller != nil {
		smPoller.Start()
		defer smPoller.Stop()
	}
	for _, jp := range journalPollers {
		jp.Start()
	}

	// Start HTTP server
	httpServer := &http.Server{
		Addr:    cfg.Addr,
		Handler: apiServer,
	}
	go startHTTPServer(httpServer, cfg)

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	gracefulShutdown(httpServer, sseHub, controlMgr, recordingMgr, journalMgr, journalPollers, launcherMgr, serverMgr)
}

// setupStorage creates and returns the storage backend.
func setupStorage(cfg *config.Config) storage.Storage {
	switch cfg.Storage {
	case config.StorageSQLite:
		store, err := storage.NewSQLiteStorage(cfg.SQLitePath)
		if err != nil {
			slog.Error("Failed to create SQLite storage", "error", err)
			os.Exit(1)
		}
		slog.Info("Using SQLite storage", "path", cfg.SQLitePath)
		return store
	default:
		slog.Info("Using in-memory storage")
		return storage.NewMemoryStorage()
	}
}

// loadSensorConfigs loads per-server sensor configurations. Global cfg.ConFile,
// если задан, применяется как дефолтный sensor-config ко всем серверам,
// у которых не указан собственный UnisetConfig.
func loadSensorConfigs(cfg *config.Config) map[string]*sensorconfig.SensorConfig {
	cache := make(map[string]*sensorconfig.SensorConfig) // file → loaded
	loadOnce := func(file string) (*sensorconfig.SensorConfig, error) {
		if sc, ok := cache[file]; ok {
			return sc, nil
		}
		sc, err := sensorconfig.LoadFromFile(file)
		if err != nil {
			return nil, err
		}
		cache[file] = sc
		return sc, nil
	}

	perServerConfigs := make(map[string]*sensorconfig.SensorConfig)
	for _, srvCfg := range cfg.Servers {
		conFile := srvCfg.UnisetConfig
		if conFile == "" {
			conFile = cfg.ConFile
		}
		if conFile == "" {
			continue
		}

		sc, err := loadOnce(conFile)
		if err != nil {
			slog.Error("Failed to load sensor config",
				"server", srvCfg.ID, "file", conFile, "error", err)
			continue
		}
		slog.Info("Loaded sensor configuration",
			"server", srvCfg.ID, "file", conFile, "sensors", sc.Count(),
			"objects", sc.ObjectCount(), "services", sc.ServiceCount())

		if !sc.HasObjectOrService(cfg.UnisetSupplier) {
			slog.Warn("Supplier not found in sensor configuration",
				"server", srvCfg.ID, "supplier", cfg.UnisetSupplier,
				"hint", "Specify valid supplier with -uniset-supplier=<name>")
		}

		perServerConfigs[srvCfg.ID] = sc
	}

	return perServerConfigs
}

// setupControl creates the control manager if tokens are configured.
func setupControl(cfg *config.Config, sseHub *api.SSEHub) *api.ControlManager {
	if !cfg.IsControlEnabled() {
		return nil
	}
	controlMgr := api.NewControlManager(cfg.ControlTokens, cfg.GetControlTimeout(), sseHub)
	sseHub.SetControlManager(controlMgr)
	slog.Info("Session control enabled",
		"tokens", len(cfg.ControlTokens),
		"timeout", cfg.GetControlTimeout())
	return controlMgr
}

// setupRecording creates the recording manager if path is configured.
func setupRecording(cfg *config.Config) *recording.Manager {
	recordingPath := cfg.GetRecordingPath()
	if recordingPath == "" {
		return nil
	}

	backend := recording.NewSQLiteBackend(recordingPath)
	mgr := recording.NewManager(backend, cfg.GetMaxRecords())
	slog.Info("Recording manager initialized",
		"path", recordingPath,
		"max_records", cfg.GetMaxRecords())

	if cfg.RecordingEnabled {
		if err := mgr.Start(); err != nil {
			slog.Error("Failed to start recording", "error", err)
		} else {
			slog.Info("Recording started (enabled by default)")
		}
	}

	return mgr
}

// setupServerCallbacks wires SSE broadcasting and recording callbacks.
func setupServerCallbacks(serverMgr *server.Manager, sseHub *api.SSEHub, recordingMgr *recording.Manager) {
	serverMgr.SetObjectCallback(sseHub.BroadcastObjectDataWithServer)

	serverMgr.SetIONCCallback(func(serverID, serverName string, updates []ionc.SensorUpdate) {
		sseHub.BroadcastIONCSensorBatchWithServer(serverID, serverName, updates)
		if recordingMgr != nil && recordingMgr.IsRecording() {
			now := time.Now()
			for _, u := range updates {
				recordingMgr.Save(serverID, u.ObjectName, "ionc:"+u.Sensor.Name, u.Sensor.Value, now)
			}
		}
	})

	serverMgr.SetModbusCallback(func(serverID, serverName string, updates []modbus.RegisterUpdate) {
		sseHub.BroadcastModbusRegisterBatchWithServer(serverID, serverName, updates)
		if recordingMgr != nil && recordingMgr.IsRecording() {
			now := time.Now()
			for _, u := range updates {
				recordingMgr.Save(serverID, u.ObjectName, "mb:"+u.Register.Name, u.Register.Value, now)
			}
		}
	})

	serverMgr.SetOPCUACallback(func(serverID, serverName string, updates []opcua.SensorUpdate) {
		sseHub.BroadcastOPCUASensorBatchWithServer(serverID, serverName, updates)
		if recordingMgr != nil && recordingMgr.IsRecording() {
			now := time.Now()
			for _, u := range updates {
				recordingMgr.Save(serverID, u.ObjectName, "opcua:"+u.Sensor.Name, u.Sensor.Value, now)
			}
		}
	})

	serverMgr.SetUWSGateCallback(func(serverID, serverName string, updates []uwsgate.SensorUpdate) {
		sseHub.BroadcastUWSGateSensorBatchWithServer(serverID, serverName, updates)
		if recordingMgr != nil && recordingMgr.IsRecording() {
			now := time.Now()
			for _, u := range updates {
				recordingMgr.Save(serverID, u.ObjectName, "ws:"+u.Sensor.Name, u.Sensor.Value, now)
			}
		}
	})

	serverMgr.SetStatusCallback(sseHub.BroadcastServerStatus)
	serverMgr.SetObjectsCallback(sseHub.BroadcastObjectsList)

	if recordingMgr != nil {
		serverMgr.SetRecordingManager(recordingMgr)
	}
}

// setupLauncher creates the launcher manager if launchers are configured.
func setupLauncher(cfg *config.Config, sseHub *api.SSEHub) *launcher.Manager {
	if len(cfg.Launchers) == 0 {
		return nil
	}

	mgr := launcher.NewManager()
	for _, lcfg := range cfg.Launchers {
		if err := mgr.AddLauncher(lcfg); err != nil {
			slog.Error("Failed to add launcher", "name", lcfg.Name, "url", lcfg.URL, "error", err)
		}
	}
	mgr.SetStatusCallback(sseHub.BroadcastLauncherStatus)
	mgr.SetConnectionCallback(sseHub.BroadcastLauncherConnection)
	mgr.StartAll()
	return mgr
}

// setupHandlers creates and configures API handlers.
func setupHandlers(
	cfg *config.Config,
	store storage.Storage,
	serverMgr *server.Manager,
	sseHub *api.SSEHub,
	perServerConfigs map[string]*sensorconfig.SensorConfig,
	controlsEnabled bool,
	logServerMgr *logserver.Manager,
	controlMgr *api.ControlManager,
	recordingMgr *recording.Manager,
	launcherMgr *launcher.Manager,
) *api.Handlers {
	// IONC/Modbus/OPCUA pollers пока остаются с legacy single-instance fallback;
	// в multi-server режиме per-server поллеры подбираются через serverMgr,
	// поля используются только когда serverID не указан.
	var ioncPollerInstance *ionc.Poller
	var modbusPollerInstance *modbus.Poller
	var opcuaPollerInstance *opcua.Poller
	if instance, ok := serverMgr.GetFirstServer(); ok {
		ioncPollerInstance = instance.IONCPoller
		modbusPollerInstance = instance.ModbusPoller
		opcuaPollerInstance = instance.OPCUAPoller
	}

	handlers := api.NewHandlers(store, cfg.PollInterval)
	handlers.SetVersion(Version)
	handlers.SetLogServerManager(logServerMgr)
	handlers.SetServerManager(serverMgr)
	handlers.SetSSEHub(sseHub)
	handlers.SetControlsEnabled(controlsEnabled)

	for serverID, sc := range perServerConfigs {
		handlers.SetPerServerSensorConfig(serverID, sc)
	}
	handlers.SetUIConfig(cfg.UI)
	handlers.SetLogStreamConfig(cfg.LogStream)
	if controlMgr != nil {
		handlers.SetControlManager(controlMgr)
	}
	if recordingMgr != nil {
		handlers.SetRecordingManager(recordingMgr)
	}
	if launcherMgr != nil {
		handlers.SetLauncherManager(launcherMgr)
	}
	if ioncPollerInstance != nil {
		handlers.SetIONCPoller(ioncPollerInstance)
	}
	if modbusPollerInstance != nil {
		handlers.SetModbusPoller(modbusPollerInstance)
	}
	if opcuaPollerInstance != nil {
		handlers.SetOPCUAPoller(opcuaPollerInstance)
	}
	if cfg.Sidebar != nil {
		handlers.SetSidebarConfig(cfg.Sidebar)
	}

	return handlers
}

// setupDashboards creates the dashboard manager if directory is specified.
func setupDashboards(cfg *config.Config, handlers *api.Handlers) *dashboard.Manager {
	if cfg.DashboardsDir == "" {
		return nil
	}

	mgr := dashboard.NewManager(cfg.DashboardsDir)
	if err := mgr.Load(); err != nil {
		slog.Error("Failed to load dashboards", "dir", cfg.DashboardsDir, "error", err)
		return nil
	}
	handlers.SetDashboardManager(mgr)
	slog.Info("Loaded server dashboards", "dir", cfg.DashboardsDir, "count", mgr.Count())
	return mgr
}

// setupJournals creates the journal manager and pollers if configured.
func setupJournals(cfg *config.Config, handlers *api.Handlers, sseHub *api.SSEHub) (*journal.Manager, []*journal.Poller) {
	if len(cfg.JournalURLs) == 0 {
		return nil, nil
	}

	journalMgr := journal.NewManager(slog.Default())
	for _, url := range cfg.JournalURLs {
		if err := journalMgr.AddJournal(url); err != nil {
			slog.Error("Failed to add journal", "url", url, "error", err)
			continue
		}
	}
	handlers.SetJournalManager(journalMgr)
	slog.Info("Journal manager initialized", "count", journalMgr.Count())

	var pollers []*journal.Poller
	for _, client := range journalMgr.GetAllClients() {
		p := journal.NewPoller(client, 2*time.Second, func(journalID string, messages []journal.Message) {
			sseHub.BroadcastJournalMessages(journalID, messages)
		}, slog.Default())
		p.SetConnectionCallback(func(journalID string, connected bool, lastError string) {
			journalMgr.UpdateConnectionStatus(journalID, connected)
			sseHub.BroadcastJournalConnection(journalID, connected, lastError)
		})
		pollers = append(pollers, p)
	}

	return journalMgr, pollers
}

// setupSMPoller creates the SharedMemory poller if configured.
func setupSMPoller(cfg *config.Config, store storage.Storage, sseHub *api.SSEHub, handlers *api.Handlers) *sm.Poller {
	if cfg.SMURL == "" {
		return nil
	}

	smClient := sm.NewClient(cfg.SMURL)
	smInterval := cfg.SMPollInterval
	if smInterval == 0 {
		smInterval = cfg.PollInterval
	}
	smPoller := sm.NewPoller(smClient, store, smInterval, func(update sm.SensorUpdate) {
		sseHub.BroadcastSensorUpdate(update)
	})
	handlers.SetSMPoller(smPoller)
	slog.Info("SM integration enabled", "url", cfg.SMURL, "poll_interval", smInterval)
	return smPoller
}

// startHTTPServer starts the HTTP server in a goroutine.
func startHTTPServer(httpServer *http.Server, cfg *config.Config) {
	logArgs := []any{
		"addr", cfg.Addr,
		"poll_interval", cfg.PollInterval.String(),
		"history_ttl", cfg.HistoryTTL.String(),
		"servers", len(cfg.Servers),
	}
	if cfg.ConFile != "" {
		logArgs = append(logArgs, "uniset_config", cfg.ConFile)
	}
	slog.Info("Starting server", logArgs...)

	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("Server failed", "error", err)
		os.Exit(1)
	}
}

// gracefulShutdown stops all services gracefully.
func gracefulShutdown(
	httpServer *http.Server,
	sseHub *api.SSEHub,
	controlMgr *api.ControlManager,
	recordingMgr *recording.Manager,
	journalMgr *journal.Manager,
	journalPollers []*journal.Poller,
	launcherMgr *launcher.Manager,
	serverMgr *server.Manager,
) {
	slog.Info("Shutting down server...")

	if controlMgr != nil {
		controlMgr.Stop()
	}

	if recordingMgr != nil {
		if err := recordingMgr.Stop(); err != nil {
			slog.Error("Recording manager stop error", "error", err)
		}
	}

	for _, jp := range journalPollers {
		jp.Stop()
	}
	if journalMgr != nil {
		journalMgr.Close()
	}

	if launcherMgr != nil {
		launcherMgr.Shutdown()
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := serverMgr.Shutdown(shutdownCtx); err != nil {
		slog.Error("Server manager shutdown error", "error", err)
	}

	sseHub.Close()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("Server shutdown error", "error", err)
	}

	slog.Info("Server stopped")
}
