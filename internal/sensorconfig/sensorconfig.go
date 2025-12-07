package sensorconfig

import (
	"encoding/xml"
	"fmt"
	"os"
	"strings"
)

// IOType represents the type of sensor
type IOType string

const (
	IOTypeDI IOType = "DI" // Digital Input
	IOTypeDO IOType = "DO" // Digital Output
	IOTypeAI IOType = "AI" // Analog Input
	IOTypeAO IOType = "AO" // Analog Output
)

// IsDiscrete returns true if this is a discrete (digital) signal
func (t IOType) IsDiscrete() bool {
	return t == IOTypeDI || t == IOTypeDO
}

// IsAnalog returns true if this is an analog signal
func (t IOType) IsAnalog() bool {
	return t == IOTypeAI || t == IOTypeAO
}

// IsInput returns true if this is an input signal
func (t IOType) IsInput() bool {
	return t == IOTypeDI || t == IOTypeAI
}

// IsOutput returns true if this is an output signal
func (t IOType) IsOutput() bool {
	return t == IOTypeDO || t == IOTypeAO
}

// Sensor represents a sensor configuration from XML
type Sensor struct {
	ID       int64  `xml:"id,attr" json:"id"`
	Name     string `xml:"name,attr" json:"name"`
	IOType   IOType `xml:"iotype,attr" json:"iotype"`
	TextName string `xml:"textname,attr" json:"textname"`
}

// UniSetObject represents an object or service from XML config
type UniSetObject struct {
	ID   int64  `xml:"id,attr" json:"id"`
	Name string `xml:"name,attr" json:"name"`
}

// SensorConfig holds all sensor configurations
// Note: Name is the primary key, ID is optional (may be 0 if not present in XML)
type SensorConfig struct {
	byName     map[string]*Sensor // by Name (primary)
	allSensors []*Sensor
	objects    map[string]*UniSetObject // objects by name
	services   map[string]*UniSetObject // services by name
}

// XML parsing structures
// Root element can have any name (UNISETPLC, Configure, etc.)
type xmlRoot struct {
	XMLName    xml.Name      // Accept any root element name
	Sensors    xmlSensors    `xml:"sensors"`    // Direct sensors under root
	ObjectsMap xmlObjectsMap `xml:"ObjectsMap"` // Sensors under ObjectsMap
}

type xmlObjectsMap struct {
	Sensors  xmlSensors  `xml:"sensors"`
	Objects  xmlObjects  `xml:"objects"`
	Services xmlServices `xml:"services"`
}

type xmlObjects struct {
	Items []UniSetObject `xml:"item"`
}

type xmlServices struct {
	Items []UniSetObject `xml:"item"`
}

type xmlSensors struct {
	Items []Sensor `xml:"item"`
}

// New creates an empty SensorConfig
func New() *SensorConfig {
	return &SensorConfig{
		byName:     make(map[string]*Sensor),
		allSensors: make([]*Sensor, 0),
		objects:    make(map[string]*UniSetObject),
		services:   make(map[string]*UniSetObject),
	}
}

// LoadFromFile loads sensor configuration from an XML file
func LoadFromFile(path string) (*SensorConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	return Parse(data)
}

// Parse parses sensor configuration from XML data
func Parse(data []byte) (*SensorConfig, error) {
	var root xmlRoot
	if err := xml.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("parse XML: %w", err)
	}

	cfg := New()

	// Helper to add sensors from xmlSensors
	addSensors := func(sensors *xmlSensors) {
		for i := range sensors.Items {
			sensor := &sensors.Items[i]
			// Normalize IOType to uppercase
			sensor.IOType = IOType(strings.ToUpper(string(sensor.IOType)))

			// Use Name as primary key (ID is optional, may be 0)
			cfg.byName[sensor.Name] = sensor
			cfg.allSensors = append(cfg.allSensors, sensor)
		}
	}

	// Collect sensors from direct path (UNISETPLC > sensors)
	addSensors(&root.Sensors)

	// Collect sensors from ObjectsMap path (UNISETPLC > ObjectsMap > sensors)
	addSensors(&root.ObjectsMap.Sensors)

	// Collect objects from ObjectsMap path (UNISETPLC > ObjectsMap > objects)
	for i := range root.ObjectsMap.Objects.Items {
		obj := &root.ObjectsMap.Objects.Items[i]
		cfg.objects[obj.Name] = obj
	}

	// Collect services from ObjectsMap path (UNISETPLC > ObjectsMap > services)
	for i := range root.ObjectsMap.Services.Items {
		svc := &root.ObjectsMap.Services.Items[i]
		cfg.services[svc.Name] = svc
	}

	return cfg, nil
}

// GetByName returns sensor by name
func (c *SensorConfig) GetByName(name string) *Sensor {
	if c == nil {
		return nil
	}
	return c.byName[name]
}

// GetAll returns all sensors
func (c *SensorConfig) GetAll() []*Sensor {
	if c == nil {
		return nil
	}
	return c.allSensors
}

// GetDiscrete returns all discrete sensors (DI, DO)
func (c *SensorConfig) GetDiscrete() []*Sensor {
	if c == nil {
		return nil
	}
	result := make([]*Sensor, 0)
	for _, s := range c.allSensors {
		if s.IOType.IsDiscrete() {
			result = append(result, s)
		}
	}
	return result
}

// GetAnalog returns all analog sensors (AI, AO)
func (c *SensorConfig) GetAnalog() []*Sensor {
	if c == nil {
		return nil
	}
	result := make([]*Sensor, 0)
	for _, s := range c.allSensors {
		if s.IOType.IsAnalog() {
			result = append(result, s)
		}
	}
	return result
}

// Count returns the number of sensors
func (c *SensorConfig) Count() int {
	if c == nil {
		return 0
	}
	return len(c.allSensors)
}

// HasObjectOrService checks if the given name exists in objects or services
func (c *SensorConfig) HasObjectOrService(name string) bool {
	if c == nil {
		return false
	}
	_, inObjects := c.objects[name]
	_, inServices := c.services[name]
	return inObjects || inServices
}

// ObjectCount returns the number of registered objects
func (c *SensorConfig) ObjectCount() int {
	if c == nil {
		return 0
	}
	return len(c.objects)
}

// ServiceCount returns the number of registered services
func (c *SensorConfig) ServiceCount() int {
	if c == nil {
		return 0
	}
	return len(c.services)
}

// SensorInfo is a JSON-friendly version for API responses
type SensorInfo struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	IOType     string `json:"iotype"`
	TextName   string `json:"textname"`
	IsDiscrete bool   `json:"isDiscrete"`
	IsInput    bool   `json:"isInput"`
}

// ToInfo converts Sensor to SensorInfo
func (s *Sensor) ToInfo() SensorInfo {
	return SensorInfo{
		ID:         s.ID,
		Name:       s.Name,
		IOType:     string(s.IOType),
		TextName:   s.TextName,
		IsDiscrete: s.IOType.IsDiscrete(),
		IsInput:    s.IOType.IsInput(),
	}
}

// GetAllInfo returns all sensors as SensorInfo slice
func (c *SensorConfig) GetAllInfo() []SensorInfo {
	if c == nil {
		return nil
	}
	result := make([]SensorInfo, len(c.allSensors))
	for i, s := range c.allSensors {
		result[i] = s.ToInfo()
	}
	return result
}
