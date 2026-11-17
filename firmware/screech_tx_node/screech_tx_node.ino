/*
 * SCREECH // TX_NODE_FIRMWARE
 * Hardware: ESP32 / ATmega328P + PC817 Optocoupler PTT + 3.5mm TRRS Walkie-Talkie Interface
 * Modulation: Bell 202 AFSK (1200 Hz Mark / 2200 Hz Space, 300 Baud, 500ms PTT Front-Porch)
 * Protocol: 28-Byte Binary Frame (0xAA 0xAA 0x7E + Type + NodeID + Timestamp + 8B Payload + CRC-16-CCITT + 8B RS-FEC)
 * License: Apache-2.0
 */

#include <Arduino.h>
#include <TinyGPSPlus.h>
#include <HardwareSerial.h>
#include <math.h>

// --- HARDWARE PINOUT ($2 TRRS INTERFACE) ---
#define PIN_PTT_OPTO       25   // Drives PC817 Optocoupler LED -> shorts Walkie-Talkie Mic/PTT to GND
#define PIN_AFSK_DAC       26   // DAC1 -> 10uF DC-blocking cap -> 10k/1k divider -> Radio MIC IN
#define PIN_CARRIER_ADC    34   // Radio Speaker Out -> 10uF cap -> 1.65V bias -> ADC1_CH6 (Carrier Sense)
#define PIN_SOS_BUTTON     14   // Tactile Emergency SOS Button (Active LOW)
#define PIN_FRIDGE_ADC     35   // DS18B20 / NTC Thermistor for Clinic_01 Vaccine Fridge
#define PIN_GPS_RX         16   // NEO-6M GPS UART RX
#define PIN_GPS_TX         17   // NEO-6M GPS UART TX

// --- PROTOCOL & MODEM CONSTANTS ---
#define NODE_ID            0x0001
#define SAMPLE_RATE_HZ     44100
#define MARK_FREQ_HZ       1200
#define SPACE_FREQ_HZ      2200
#define BAUD_RATE          300
#define PTT_FRONT_PORCH_MS 500
#define SQUELCH_RMS_LIMIT  48   // 12-bit ADC RMS delta threshold for Listen-Before-Talk
#define FRAME_LEN          28
#define RS_NSYM            8

// --- GALOIS FIELD GF(2^8) TABLES (0x11D) ---
static uint8_t gf_exp[512];
static uint8_t gf_log[256];
static uint8_t rs_gen[RS_NSYM + 1];

// --- 64-SAMPLE SINE LUT FOR TIMER-INTERRUPT DDS ---
static uint8_t sine_lut[64];
volatile uint32_t dds_phase_acc = 0;
volatile uint32_t dds_phase_inc = 0;
hw_timer_t* afsk_timer = nullptr;

TinyGPSPlus gps;
HardwareSerial GPS_Serial(2);

void IRAM_ATTR onAfskTimer() {
  dds_phase_acc += dds_phase_inc;
  uint8_t idx = (dds_phase_acc >> 26) & 0x3F;
  dacWrite(PIN_AFSK_DAC, sine_lut[idx]);
}

void initGaloisField() {
  uint16_t x = 1;
  for (int i = 0; i < 255; i++) {
    gf_exp[i] = (uint8_t)x;
    gf_log[x] = (uint8_t)i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (int i = 255; i < 512; i++) {
    gf_exp[i] = gf_exp[i - 255];
  }
  // Build RS(25,17) generator polynomial
  memset(rs_gen, 0, sizeof(rs_gen));
  rs_gen[0] = 1;
  uint8_t deg = 1;
  for (int i = 0; i < RS_NSYM; i++) {
    uint8_t root = gf_exp[i];
    for (int j = deg; j > 0; j--) {
      uint8_t mul = (rs_gen[j - 1] == 0) ? 0 : gf_exp[gf_log[rs_gen[j - 1]] + gf_log[root]];
      rs_gen[j] = rs_gen[j - 1] ^ ((rs_gen[j] == 0) ? 0 : gf_exp[gf_log[rs_gen[j]] + 0]);
      // Multiply polynomial by (x - alpha^i)
    }
    deg++;
  }
  // Exact polynomial multiplication g(x) *= (x + alpha^i)
  uint8_t g[RS_NSYM + 1] = {1, 0};
  int glen = 1;
  for (int i = 0; i < RS_NSYM; i++) {
    uint8_t a = gf_exp[i];
    for (int j = glen; j >= 1; j--) {
      uint8_t prod = (g[j] == 0 || a == 0) ? 0 : gf_exp[gf_log[g[j]] + gf_log[a]];
      g[j] = g[j - 1] ^ prod;
    }
    g[0] = (g[0] == 0 || a == 0) ? 0 : gf_exp[gf_log[g[0]] + gf_log[a]];
    glen++;
  }
  for (int i = 0; i <= RS_NSYM; i++) {
    rs_gen[i] = g[RS_NSYM - i];
  }
}

uint8_t gfMul(uint8_t a, uint8_t b) {
  if (a == 0 || b == 0) return 0;
  return gf_exp[gf_log[a] + gf_log[b]];
}

uint16_t crc16_ccitt(const uint8_t* data, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= ((uint16_t)data[i] << 8);
    for (uint8_t bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
  }
  return crc;
}

void rsEncodeBlock(const uint8_t* msg, size_t msgLen, uint8_t* outParity) {
  uint8_t buf[32] = {0};
  memcpy(buf, msg, msgLen);
  for (size_t i = 0; i < msgLen; i++) {
    uint8_t coef = buf[i];
    if (coef != 0) {
      for (int j = 1; j <= RS_NSYM; j++) {
        buf[i + j] ^= gfMul(rs_gen[j], coef);
      }
    }
  }
  memcpy(outParity, &buf[msgLen], RS_NSYM);
}

void setToneFreq(uint32_t freqHz) {
  // Phase increment for 32-bit accumulator at 44100 Hz interrupt rate
  dds_phase_inc = (uint32_t)(((uint64_t)freqHz << 32) / SAMPLE_RATE_HZ);
}

bool waitForChannelClear(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    int32_t sum = 0;
    int32_t samples[64];
    for (int i = 0; i < 64; i++) {
      samples[i] = analogRead(PIN_CARRIER_ADC);
      sum += samples[i];
      delayMicroseconds(200);
    }
    int32_t mean = sum / 64;
    uint32_t sqSum = 0;
    for (int i = 0; i < 64; i++) {
      int32_t d = samples[i] - mean;
      sqSum += (uint32_t)(d * d);
    }
    uint32_t rms = (uint32_t)sqrt((double)sqSum / 64.0);
    if (rms < SQUELCH_RMS_LIMIT) {
      return true; // Channel clear
    }
    delay(150); // CARRIER_BUSY_WAIT backoff
  }
  return false;
}

void sendAfskBit(uint8_t bitVal) {
  setToneFreq(bitVal ? MARK_FREQ_HZ : SPACE_FREQ_HZ);
  delayMicroseconds(1000000UL / BAUD_RATE);
}

void transmitFrame(const uint8_t* frame28) {
  if (!waitForChannelClear(5000)) {
    Serial.println("[LBT] CARRIER_BUSY_WAIT timeout - aborting TX to avoid stepping on voice.");
    return;
  }

  // 1. Key Walkie-Talkie PTT via PC817 Optocoupler
  digitalWrite(PIN_PTT_OPTO, HIGH);
  setToneFreq(MARK_FREQ_HZ);
  timerAlarmEnable(afsk_timer);

  // 2. Mandatory 500ms Front-Porch Carrier for analog squelch relay open
  delay(PTT_FRONT_PORCH_MS);

  // 3. 4 idle mark bits + 28 bytes UART 8N1 AFSK burst
  for (int i = 0; i < 4; i++) sendAfskBit(1);
  for (int i = 0; i < FRAME_LEN; i++) {
    uint8_t b = frame28[i];
    sendAfskBit(0); // Start bit
    for (int bit = 0; bit < 8; bit++) {
      sendAfskBit((b >> bit) & 1);
    }
    sendAfskBit(1); // Stop bit
  }

  // 4. 80ms Mark trailer + Release PTT
  setToneFreq(MARK_FREQ_HZ);
  delay(80);
  timerAlarmDisable(afsk_timer);
  dacWrite(PIN_AFSK_DAC, 128);
  digitalWrite(PIN_PTT_OPTO, LOW);
}

void buildSosFrame(float lat, float lon, uint32_t epochSec, uint8_t* frame) {
  frame[0] = 0xAA;
  frame[1] = 0xAA;
  frame[2] = 0x7E;
  frame[3] = 0x01; // Medic GPS SOS
  frame[4] = (NODE_ID >> 8) & 0xFF;
  frame[5] = NODE_ID & 0xFF;
  frame[6] = (epochSec >> 24) & 0xFF;
  frame[7] = (epochSec >> 16) & 0xFF;
  frame[8] = (epochSec >> 8) & 0xFF;
  frame[9] = epochSec & 0xFF;

  uint32_t latBits, lonBits;
  memcpy(&latBits, &lat, 4);
  memcpy(&lonBits, &lon, 4);
  frame[10] = (latBits >> 24) & 0xFF; frame[11] = (latBits >> 16) & 0xFF;
  frame[12] = (latBits >> 8) & 0xFF;  frame[13] = latBits & 0xFF;
  frame[14] = (lonBits >> 24) & 0xFF; frame[15] = (lonBits >> 16) & 0xFF;
  frame[16] = (lonBits >> 8) & 0xFF;  frame[17] = lonBits & 0xFF;

  uint16_t crc = crc16_ccitt(&frame[3], 15);
  frame[18] = (crc >> 8) & 0xFF;
  frame[19] = crc & 0xFF;

  rsEncodeBlock(&frame[3], 17, &frame[20]);
}

void setup() {
  Serial.begin(115200);
  GPS_Serial.begin(9600, SERIAL_8N1, PIN_GPS_RX, PIN_GPS_TX);
  pinMode(PIN_PTT_OPTO, OUTPUT);
  pinMode(PIN_SOS_BUTTON, INPUT_PULLUP);
  digitalWrite(PIN_PTT_OPTO, LOW);

  for (int i = 0; i < 64; i++) {
    sine_lut[i] = (uint8_t)(128 + 110 * sin((2.0 * PI * i) / 64.0));
  }
  initGaloisField();

  afsk_timer = timerBegin(0, 80, true); // 1 MHz tick
  timerAttachInterrupt(afsk_timer, &onAfskTimer, true);
  timerAlarmWrite(afsk_timer, 1000000UL / SAMPLE_RATE_HZ, true);
  Serial.println("SCREECH TX NODE READY // 146.520 MHz Bell-202 AFSK");
}

void loop() {
  while (GPS_Serial.available() > 0) {
    gps.encode(GPS_Serial.read());
  }

  if (digitalRead(PIN_SOS_BUTTON) == LOW) {
    float lat = gps.location.isValid() ? (float)gps.location.lat() : 24.9682f;
    float lon = gps.location.isValid() ? (float)gps.location.lng() : 55.4415f;
    uint32_t ts = 1794855979UL + (millis() / 1000UL);

    uint8_t frame[FRAME_LEN];
    buildSosFrame(lat, lon, ts, frame);
    Serial.printf("[TX] Sending 28B SOS Frame: %.4f, %.4f\n", lat, lon);
    transmitFrame(frame);
    delay(2000);
  }
}
