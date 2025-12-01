package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type sqliteStorage struct {
	db *sql.DB
}

func NewSQLiteStorage(dbPath string) (Storage, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := createTables(db); err != nil {
		db.Close()
		return nil, err
	}

	return &sqliteStorage{db: db}, nil
}

func createTables(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			object_name TEXT NOT NULL,
			variable_name TEXT NOT NULL,
			value TEXT NOT NULL,
			timestamp DATETIME NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_history_lookup
			ON history(object_name, variable_name, timestamp);
	`)
	if err != nil {
		return fmt.Errorf("create tables: %w", err)
	}
	return nil
}

func (s *sqliteStorage) Save(objectName, variableName string, value interface{}, timestamp time.Time) error {
	valueJSON, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("marshal value: %w", err)
	}

	_, err = s.db.Exec(
		`INSERT INTO history (object_name, variable_name, value, timestamp) VALUES (?, ?, ?, ?)`,
		objectName, variableName, string(valueJSON), timestamp,
	)
	if err != nil {
		return fmt.Errorf("insert: %w", err)
	}

	return nil
}

func (s *sqliteStorage) GetHistory(objectName, variableName string, from, to time.Time) (*VariableHistory, error) {
	rows, err := s.db.Query(
		`SELECT value, timestamp FROM history
		 WHERE object_name = ? AND variable_name = ? AND timestamp >= ? AND timestamp <= ?
		 ORDER BY timestamp ASC`,
		objectName, variableName, from, to,
	)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	return scanPoints(rows, objectName, variableName)
}

func (s *sqliteStorage) GetLatest(objectName, variableName string, count int) (*VariableHistory, error) {
	rows, err := s.db.Query(
		`SELECT value, timestamp FROM (
			SELECT value, timestamp FROM history
			WHERE object_name = ? AND variable_name = ?
			ORDER BY timestamp DESC
			LIMIT ?
		) ORDER BY timestamp ASC`,
		objectName, variableName, count,
	)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	return scanPoints(rows, objectName, variableName)
}

func scanPoints(rows *sql.Rows, objectName, variableName string) (*VariableHistory, error) {
	var points []DataPoint
	for rows.Next() {
		var valueJSON string
		var timestamp time.Time
		if err := rows.Scan(&valueJSON, &timestamp); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}

		var value interface{}
		if err := json.Unmarshal([]byte(valueJSON), &value); err != nil {
			return nil, fmt.Errorf("unmarshal value: %w", err)
		}

		points = append(points, DataPoint{
			Timestamp: timestamp,
			Value:     value,
		})
	}

	return &VariableHistory{
		ObjectName:   objectName,
		VariableName: variableName,
		Points:       points,
	}, nil
}

func (s *sqliteStorage) Cleanup(olderThan time.Time) error {
	_, err := s.db.Exec(`DELETE FROM history WHERE timestamp < ?`, olderThan)
	if err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	return nil
}

func (s *sqliteStorage) Close() error {
	return s.db.Close()
}
