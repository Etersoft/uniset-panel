package logserver

import (
	"bytes"
	"context"
	"net"
	"testing"
	"time"
)

func TestMessageMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		cmd     Command
		data    uint32
		logname string
	}{
		{
			name:    "simple command",
			cmd:     CmdSetLevel,
			data:    7,
			logname: "TestLog",
		},
		{
			name:    "filter mode with regexp",
			cmd:     CmdFilterMode,
			data:    0,
			logname: "MyProcess.*",
		},
		{
			name:    "empty logname",
			cmd:     CmdList,
			data:    0,
			logname: "",
		},
		{
			name:    "max length logname",
			cmd:     CmdAddLevel,
			data:    255,
			logname: string(bytes.Repeat([]byte("a"), MaxLogNameLen)),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := NewMessage(tt.cmd, tt.data, tt.logname)

			// Проверяем поля
			if msg.Cmd != tt.cmd {
				t.Errorf("cmd = %v, want %v", msg.Cmd, tt.cmd)
			}
			if msg.Data != tt.data {
				t.Errorf("data = %v, want %v", msg.Data, tt.data)
			}
			if msg.Magic != MagicNum {
				t.Errorf("magic = %v, want %v", msg.Magic, MagicNum)
			}

			// Сериализуем
			data, err := msg.Marshal()
			if err != nil {
				t.Fatalf("Marshal() error = %v", err)
			}

			// Проверяем размер
			if len(data) != MessageSize {
				t.Errorf("Marshal() len = %v, want %v", len(data), MessageSize)
			}

			// Десериализуем
			msg2 := &Message{}
			if err := msg2.Unmarshal(data); err != nil {
				t.Fatalf("Unmarshal() error = %v", err)
			}

			// Сравниваем
			if msg2.Cmd != msg.Cmd {
				t.Errorf("Unmarshal() cmd = %v, want %v", msg2.Cmd, msg.Cmd)
			}
			if msg2.Data != msg.Data {
				t.Errorf("Unmarshal() data = %v, want %v", msg2.Data, msg.Data)
			}
			if msg2.Magic != msg.Magic {
				t.Errorf("Unmarshal() magic = %v, want %v", msg2.Magic, msg.Magic)
			}

			// Проверяем logname (обрезанный до MaxLogNameLen)
			expectedLogname := tt.logname
			if len(expectedLogname) > MaxLogNameLen {
				expectedLogname = expectedLogname[:MaxLogNameLen]
			}
			if msg2.GetLogName() != expectedLogname {
				t.Errorf("Unmarshal() logname = %v, want %v", msg2.GetLogName(), expectedLogname)
			}
		})
	}
}

func TestMessageUnmarshalInvalidMagic(t *testing.T) {
	data := make([]byte, MessageSize)
	// Записываем неверный magic
	data[1] = 0xFF
	data[2] = 0xFF
	data[3] = 0xFF
	data[4] = 0xFF

	msg := &Message{}
	err := msg.Unmarshal(data)
	if err == nil {
		t.Error("Unmarshal() should fail with invalid magic")
	}
}

func TestMessageUnmarshalTooShort(t *testing.T) {
	data := make([]byte, 10) // Слишком короткий буфер

	msg := &Message{}
	err := msg.Unmarshal(data)
	if err == nil {
		t.Error("Unmarshal() should fail with too short data")
	}
}

func TestCommandString(t *testing.T) {
	tests := []struct {
		cmd  Command
		want string
	}{
		{CmdNOP, "NOP"},
		{CmdSetLevel, "SetLevel"},
		{CmdAddLevel, "AddLevel"},
		{CmdDelLevel, "DelLevel"},
		{CmdFilterMode, "FilterMode"},
		{CmdList, "List"},
		{Command(99), "Unknown(99)"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if got := tt.cmd.String(); got != tt.want {
				t.Errorf("Command.String() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestClientConnectDisconnect(t *testing.T) {
	// Создаем тестовый TCP сервер
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to create test server: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().(*net.TCPAddr)

	// Принимаем соединение в горутине
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		// Держим соединение открытым
		time.Sleep(time.Second)
	}()

	// Создаем клиент
	config := &ClientConfig{
		Host:           "127.0.0.1",
		Port:           addr.Port,
		ConnectTimeout: 1000,
		ReadTimeout:    1000,
		WriteTimeout:   1000,
		ReconnectDelay: 100,
	}
	client := NewClient(config, nil)

	// Подключаемся
	if err := client.Connect(); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	// Проверяем статус
	if !client.IsConnected() {
		t.Error("IsConnected() = false after Connect()")
	}

	status := client.GetStatus()
	if !status.Connected {
		t.Error("GetStatus().Connected = false after Connect()")
	}

	// Отключаемся
	client.Disconnect()

	if client.IsConnected() {
		t.Error("IsConnected() = true after Disconnect()")
	}
}

func TestClientSendCommand(t *testing.T) {
	// Создаем тестовый TCP сервер
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to create test server: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().(*net.TCPAddr)

	// Канал для получения данных
	received := make(chan []byte, 1)

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		buf := make([]byte, MessageSize)
		n, _ := conn.Read(buf)
		received <- buf[:n]
	}()

	// Создаем клиент и подключаемся
	config := &ClientConfig{
		Host:           "127.0.0.1",
		Port:           addr.Port,
		ConnectTimeout: 1000,
		WriteTimeout:   1000,
	}
	client := NewClient(config, nil)
	defer client.Close()

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	// Отправляем команду
	if err := client.SendCommand(CmdSetLevel, 7, "TestLog"); err != nil {
		t.Fatalf("SendCommand() error = %v", err)
	}

	// Проверяем полученные данные
	select {
	case data := <-received:
		if len(data) != MessageSize {
			t.Errorf("Received %d bytes, want %d", len(data), MessageSize)
		}

		// Десериализуем и проверяем
		msg := &Message{}
		if err := msg.Unmarshal(data); err != nil {
			t.Fatalf("Unmarshal() error = %v", err)
		}

		if msg.Cmd != CmdSetLevel {
			t.Errorf("Received cmd = %v, want %v", msg.Cmd, CmdSetLevel)
		}
		if msg.Data != 7 {
			t.Errorf("Received data = %v, want 7", msg.Data)
		}
		if msg.GetLogName() != "TestLog" {
			t.Errorf("Received logname = %v, want TestLog", msg.GetLogName())
		}

	case <-time.After(time.Second):
		t.Error("Timeout waiting for data")
	}
}

func TestClientReadLogs(t *testing.T) {
	// Создаем тестовый TCP сервер
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("Failed to create test server: %v", err)
	}
	defer listener.Close()

	addr := listener.Addr().(*net.TCPAddr)

	testLines := []string{
		"2024-01-01 12:00:00 INFO Test message 1\n",
		"2024-01-01 12:00:01 WARN Test message 2\n",
		"2024-01-01 12:00:02 ERROR Test message 3\n",
	}

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		// Отправляем тестовые строки
		for _, line := range testLines {
			conn.Write([]byte(line))
			time.Sleep(10 * time.Millisecond)
		}
	}()

	// Создаем клиент
	config := &ClientConfig{
		Host:           "127.0.0.1",
		Port:           addr.Port,
		ConnectTimeout: 1000,
		ReadTimeout:    500,
	}
	client := NewClient(config, nil)

	if err := client.Connect(); err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	// Читаем логи
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	var receivedLines []string
	mu := &struct{}{}
	_ = mu

	done := make(chan struct{})
	go func() {
		client.ReadLogs(ctx, func(line string) {
			receivedLines = append(receivedLines, line)
			if len(receivedLines) >= len(testLines) {
				cancel()
			}
		})
		close(done)
	}()

	<-done
	client.Close()

	// Проверяем полученные строки
	if len(receivedLines) != len(testLines) {
		t.Errorf("Received %d lines, want %d", len(receivedLines), len(testLines))
	}

	for i, line := range receivedLines {
		if line != testLines[i] {
			t.Errorf("Line %d = %q, want %q", i, line, testLines[i])
		}
	}
}

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()

	if config.Host != "localhost" {
		t.Errorf("Host = %v, want localhost", config.Host)
	}
	if config.Port != 3333 {
		t.Errorf("Port = %v, want 3333", config.Port)
	}
	if config.ConnectTimeout != 10000 {
		t.Errorf("ConnectTimeout = %v, want 10000", config.ConnectTimeout)
	}
	if config.ReconnectDelay != 5000 {
		t.Errorf("ReconnectDelay = %v, want 5000", config.ReconnectDelay)
	}
}
