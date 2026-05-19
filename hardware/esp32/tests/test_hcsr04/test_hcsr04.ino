/*
  GADV HC-SR04 bench test
  Board: ESP32-S3 DevKitC-1

  Approved GADV pin map:
    TRIG = GPIO 6
    ECHO = GPIO 7

  Expected readings:
    - A flat object 10-100 cm away should produce a stable distance.
    - No echo, poor target angle, or out-of-range distance returns a warning.
    - If using a 5 V HC-SR04 module, level-shift ECHO down to 3.3 V for ESP32-S3 safety.
*/

constexpr int ULTRASONIC_TRIG_PIN = 6;
constexpr int ULTRASONIC_ECHO_PIN = 7;
constexpr unsigned long SAMPLE_INTERVAL_MS = 500;
constexpr unsigned long ECHO_TIMEOUT_US = 30000UL;

unsigned long lastSampleAt = 0;

float readDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) return -1.0f;
  return duration / 58.0f;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("GADV HC-SR04 bench test");
  Serial.printf("TRIG=GPIO %d, ECHO=GPIO %d\n", ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN);

  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
}

void loop() {
  if (millis() - lastSampleAt < SAMPLE_INTERVAL_MS) return;
  lastSampleAt = millis();

  const float distanceCm = readDistanceCm();

  Serial.println("--- HC-SR04 sample ---");
  if (distanceCm < 0.0f) {
    Serial.println("WARNING: No echo received. Check wiring, target distance, and ECHO voltage level shifting.");
  } else {
    Serial.printf("Distance: %.1f cm\n", distanceCm);
  }
}
