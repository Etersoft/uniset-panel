package sensorconfig

import (
	"testing"
)

const testXML = `<?xml version="1.0" encoding="utf-8"?>
<UNISETPLC>
	<sensors name="Sensors">
		<item id="1" iotype="DI" name="Input1_S" textname="Digital Input 1"/>
		<item id="2" iotype="DI" name="Input2_S" textname="Digital Input 2"/>
		<item id="101" iotype="DO" name="Output1_C" textname="Digital Output 1"/>
		<item id="201" iotype="AI" name="Temp_AS" textname="Temperature"/>
		<item id="301" iotype="AO" name="Valve_C" textname="Valve Control"/>
	</sensors>
</UNISETPLC>`

func TestParse(t *testing.T) {
	cfg, err := Parse([]byte(testXML))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if cfg.Count() != 5 {
		t.Errorf("expected 5 sensors, got %d", cfg.Count())
	}
}

func TestGetByName(t *testing.T) {
	cfg, _ := Parse([]byte(testXML))

	sensor := cfg.GetByName("Temp_AS")
	if sensor == nil {
		t.Fatal("expected sensor with name Temp_AS")
	}

	if sensor.ID != 201 {
		t.Errorf("expected ID 201, got %d", sensor.ID)
	}

	if sensor.IOType != IOTypeAI {
		t.Errorf("expected IOType AI, got %s", sensor.IOType)
	}
}

func TestIOTypeIsDiscrete(t *testing.T) {
	cfg, _ := Parse([]byte(testXML))

	discrete := cfg.GetDiscrete()
	if len(discrete) != 3 {
		t.Errorf("expected 3 discrete sensors (2 DI + 1 DO), got %d", len(discrete))
	}

	for _, s := range discrete {
		if !s.IOType.IsDiscrete() {
			t.Errorf("sensor %s should be discrete", s.Name)
		}
	}
}

func TestIOTypeIsAnalog(t *testing.T) {
	cfg, _ := Parse([]byte(testXML))

	analog := cfg.GetAnalog()
	if len(analog) != 2 {
		t.Errorf("expected 2 analog sensors (1 AI + 1 AO), got %d", len(analog))
	}

	for _, s := range analog {
		if !s.IOType.IsAnalog() {
			t.Errorf("sensor %s should be analog", s.Name)
		}
	}
}

func TestIOTypeIsInput(t *testing.T) {
	tests := []struct {
		iotype   IOType
		isInput  bool
		isOutput bool
	}{
		{IOTypeDI, true, false},
		{IOTypeDO, false, true},
		{IOTypeAI, true, false},
		{IOTypeAO, false, true},
	}

	for _, tc := range tests {
		if tc.iotype.IsInput() != tc.isInput {
			t.Errorf("%s.IsInput() = %v, want %v", tc.iotype, tc.iotype.IsInput(), tc.isInput)
		}
		if tc.iotype.IsOutput() != tc.isOutput {
			t.Errorf("%s.IsOutput() = %v, want %v", tc.iotype, tc.iotype.IsOutput(), tc.isOutput)
		}
	}
}

func TestToInfo(t *testing.T) {
	cfg, _ := Parse([]byte(testXML))

	sensor := cfg.GetByName("Input1_S")
	info := sensor.ToInfo()

	if info.Name != "Input1_S" {
		t.Errorf("expected name Input1_S, got %s", info.Name)
	}
	if info.IOType != "DI" {
		t.Errorf("expected IOType DI, got %s", info.IOType)
	}
	if info.TextName != "Digital Input 1" {
		t.Errorf("expected textname 'Digital Input 1', got '%s'", info.TextName)
	}
	if !info.IsDiscrete {
		t.Error("expected IsDiscrete = true")
	}
	if !info.IsInput {
		t.Error("expected IsInput = true")
	}
}

func TestNilConfig(t *testing.T) {
	var cfg *SensorConfig

	if cfg.GetByName("test") != nil {
		t.Error("expected nil for nil config")
	}
	if cfg.GetAll() != nil {
		t.Error("expected nil for nil config")
	}
	if cfg.Count() != 0 {
		t.Error("expected 0 for nil config")
	}
}

func TestCaseInsensitiveIOType(t *testing.T) {
	xmlLower := `<?xml version="1.0"?>
<UNISETPLC>
	<sensors>
		<item iotype="di" name="Test" textname="Test"/>
	</sensors>
</UNISETPLC>`

	cfg, err := Parse([]byte(xmlLower))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	sensor := cfg.GetByName("Test")
	if sensor.IOType != IOTypeDI {
		t.Errorf("expected IOType DI (normalized), got %s", sensor.IOType)
	}
}

// TestIDFromFileZero verifies that idfromfile="0" generates IDs from names
func TestIDFromFileZero(t *testing.T) {
	xmlNoID := `<?xml version="1.0" encoding="utf-8"?>
<UNISETPLC>
	<ObjectsMap idfromfile="0">
		<sensors name="Sensors">
			<item name="Sensor1" textname="First Sensor" iotype="DI"/>
			<item name="Sensor2" textname="Second Sensor" iotype="AI"/>
			<item name="Sensor3" textname="Third Sensor" iotype="DO"/>
		</sensors>
	</ObjectsMap>
</UNISETPLC>`

	cfg, err := Parse([]byte(xmlNoID))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	// Check count
	if cfg.Count() != 3 {
		t.Errorf("expected 3 sensors, got %d", cfg.Count())
	}

	// Check that all sensors have generated IDs (hash of name)
	s1 := cfg.GetByName("Sensor1")
	if s1 == nil {
		t.Fatal("expected Sensor1")
	}
	if s1.IOType != IOTypeDI {
		t.Errorf("expected IOType DI, got %s", s1.IOType)
	}
	expectedID1 := int64(Hash32("Sensor1"))
	if s1.ID != expectedID1 {
		t.Errorf("expected ID %d (hash of name), got %d", expectedID1, s1.ID)
	}

	s2 := cfg.GetByName("Sensor2")
	if s2 == nil {
		t.Fatal("expected Sensor2")
	}
	expectedID2 := int64(Hash32("Sensor2"))
	if s2.ID != expectedID2 {
		t.Errorf("expected ID %d (hash of name), got %d", expectedID2, s2.ID)
	}

	s3 := cfg.GetByName("Sensor3")
	if s3 == nil {
		t.Fatal("expected Sensor3")
	}
	expectedID3 := int64(Hash32("Sensor3"))
	if s3.ID != expectedID3 {
		t.Errorf("expected ID %d (hash of name), got %d", expectedID3, s3.ID)
	}
}

// TestIDFromFileOne verifies that idfromfile="1" requires IDs and errors if missing
func TestIDFromFileOne(t *testing.T) {
	xmlWithID := `<?xml version="1.0" encoding="utf-8"?>
<UNISETPLC>
	<ObjectsMap idfromfile="1">
		<sensors name="Sensors">
			<item id="100" name="Sensor1" textname="First Sensor" iotype="DI"/>
			<item id="200" name="Sensor2" textname="Second Sensor" iotype="AI"/>
		</sensors>
	</ObjectsMap>
</UNISETPLC>`

	cfg, err := Parse([]byte(xmlWithID))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	// Check that IDs from XML are preserved
	s1 := cfg.GetByName("Sensor1")
	if s1.ID != 100 {
		t.Errorf("expected ID 100, got %d", s1.ID)
	}
	s2 := cfg.GetByName("Sensor2")
	if s2.ID != 200 {
		t.Errorf("expected ID 200, got %d", s2.ID)
	}
}

// TestIDFromFileOneMissingID verifies error when idfromfile="1" but id is missing
func TestIDFromFileOneMissingID(t *testing.T) {
	xmlMissingID := `<?xml version="1.0" encoding="utf-8"?>
<UNISETPLC>
	<ObjectsMap idfromfile="1">
		<sensors name="Sensors">
			<item id="100" name="Sensor1" textname="First Sensor" iotype="DI"/>
			<item name="Sensor2" textname="Second Sensor" iotype="AI"/>
		</sensors>
	</ObjectsMap>
</UNISETPLC>`

	_, err := Parse([]byte(xmlMissingID))
	if err == nil {
		t.Fatal("expected error for missing id with idfromfile=\"1\"")
	}
	expectedErr := `sensor "Sensor2" has no id attribute but idfromfile="1"`
	if err.Error() != expectedErr {
		t.Errorf("expected error %q, got %q", expectedErr, err.Error())
	}
}

// TestIDFromFileDefault verifies that missing idfromfile defaults to "0" behavior
func TestIDFromFileDefault(t *testing.T) {
	xmlDefault := `<?xml version="1.0" encoding="utf-8"?>
<UNISETPLC>
	<ObjectsMap>
		<sensors name="Sensors">
			<item name="Sensor1" textname="First Sensor" iotype="DI"/>
		</sensors>
	</ObjectsMap>
</UNISETPLC>`

	cfg, err := Parse([]byte(xmlDefault))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	// Should generate ID from name (like idfromfile="0")
	s1 := cfg.GetByName("Sensor1")
	expectedID := int64(Hash32("Sensor1"))
	if s1.ID != expectedID {
		t.Errorf("expected ID %d (hash of name), got %d", expectedID, s1.ID)
	}
}

// TestLoadFromFileWithoutID tests loading config/test-noid.xml file with idfromfile="0"
func TestLoadFromFileWithoutID(t *testing.T) {
	cfg, err := LoadFromFile("../../config/test-noid.xml")
	if err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	// Should have 6 sensors
	if cfg.Count() != 6 {
		t.Errorf("expected 6 sensors, got %d", cfg.Count())
	}

	// Check specific sensors by name
	tests := []struct {
		name     string
		iotype   IOType
		textname string
	}{
		{"SES.AMC1_OPCUA_EM1", IOTypeDI, "Управление EM процессом обмена по opcua с ПЛК управления СЭС1"},
		{"SES.AMC1_OPCUA_EM2", IOTypeDI, "Управление EM процессом обмена по opcua с ПЛК управления СЭС2"},
		{"SES.PLC_IsMain1", IOTypeDI, "Текущий ПЛК - основной"},
		{"SES.PLC_IsMain2", IOTypeDI, "Текущий ПЛК - основной"},
		{"TestAnalog1", IOTypeAI, "Тестовый аналоговый датчик 1"},
		{"TestAnalog2", IOTypeAO, "Тестовый аналоговый датчик 2"},
	}

	for _, tc := range tests {
		s := cfg.GetByName(tc.name)
		if s == nil {
			t.Errorf("sensor %s not found", tc.name)
			continue
		}
		if s.IOType != tc.iotype {
			t.Errorf("sensor %s: expected IOType %s, got %s", tc.name, tc.iotype, s.IOType)
		}
		if s.TextName != tc.textname {
			t.Errorf("sensor %s: expected textname %q, got %q", tc.name, tc.textname, s.TextName)
		}
		// ID should be generated from name (idfromfile="0")
		expectedID := int64(Hash32(tc.name))
		if s.ID != expectedID {
			t.Errorf("sensor %s: expected ID %d (hash), got %d", tc.name, expectedID, s.ID)
		}
	}

	// Check GetAll returns all sensors
	all := cfg.GetAll()
	if len(all) != 6 {
		t.Errorf("GetAll: expected 6 sensors, got %d", len(all))
	}

	// Check GetDiscrete and GetAnalog
	discrete := cfg.GetDiscrete()
	if len(discrete) != 4 {
		t.Errorf("expected 4 discrete sensors, got %d", len(discrete))
	}

	analog := cfg.GetAnalog()
	if len(analog) != 2 {
		t.Errorf("expected 2 analog sensors, got %d", len(analog))
	}
}

// TestParseObjectsAndServices tests parsing of objects and services sections
func TestParseObjectsAndServices(t *testing.T) {
	xmlWithObjectsServices := `<?xml version="1.0" encoding="utf-8"?>
<UNISETPLC>
	<ObjectsMap>
		<sensors name="Sensors">
			<item id="1" name="Sensor1" iotype="DI" textname="Test"/>
		</sensors>
		<objects name="UniObjects">
			<item id="6000" name="TestProc"/>
			<item id="6001" name="LProcessor"/>
			<item id="6002" name="IOControl"/>
		</objects>
		<services name="Services">
			<item id="5010" name="InfoServer"/>
			<item id="5011" name="DBServer1"/>
		</services>
	</ObjectsMap>
</UNISETPLC>`

	cfg, err := Parse([]byte(xmlWithObjectsServices))
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	// Check sensors count
	if cfg.Count() != 1 {
		t.Errorf("expected 1 sensor, got %d", cfg.Count())
	}

	// Check objects count
	if cfg.ObjectCount() != 3 {
		t.Errorf("expected 3 objects, got %d", cfg.ObjectCount())
	}

	// Check services count
	if cfg.ServiceCount() != 2 {
		t.Errorf("expected 2 services, got %d", cfg.ServiceCount())
	}

	// Test HasObjectOrService
	if !cfg.HasObjectOrService("TestProc") {
		t.Error("expected TestProc in objects")
	}
	if !cfg.HasObjectOrService("LProcessor") {
		t.Error("expected LProcessor in objects")
	}
	if !cfg.HasObjectOrService("InfoServer") {
		t.Error("expected InfoServer in services")
	}
	if !cfg.HasObjectOrService("DBServer1") {
		t.Error("expected DBServer1 in services")
	}
	if cfg.HasObjectOrService("NonExistent") {
		t.Error("expected NonExistent to not be found")
	}
}

// TestNilConfigObjectsServices tests that nil config returns expected values for objects/services
func TestNilConfigObjectsServices(t *testing.T) {
	var cfg *SensorConfig

	if cfg.ObjectCount() != 0 {
		t.Error("expected 0 objects for nil config")
	}
	if cfg.ServiceCount() != 0 {
		t.Error("expected 0 services for nil config")
	}
	if cfg.HasObjectOrService("test") {
		t.Error("expected false for nil config")
	}
}

// TestLoadFromFileWithObjectsServices tests loading full config with objects/services
func TestLoadFromFileWithObjectsServices(t *testing.T) {
	cfg, err := LoadFromFile("../../config/test.xml")
	if err != nil {
		t.Fatalf("LoadFromFile failed: %v", err)
	}

	// Check that objects and services were parsed
	if cfg.ObjectCount() == 0 {
		t.Error("expected objects to be parsed from test.xml")
	}
	if cfg.ServiceCount() == 0 {
		t.Error("expected services to be parsed from test.xml")
	}

	// TestProc should be in objects
	if !cfg.HasObjectOrService("TestProc") {
		t.Error("expected TestProc in objects")
	}

	// InfoServer should be in services
	if !cfg.HasObjectOrService("InfoServer") {
		t.Error("expected InfoServer in services")
	}
}
