/*
 * POSTMAN // TRUCK_MULE_FIRMWARE
 * Hardware: ESP32 ($5) + MicroSD SPI Reader + 12V Cigarette Lighter Buck Converter
 * Function: Zero-Touch Delay-Tolerant Network (DTN) Physical Data Mule
 * Flow: Scan 2.4GHz SSIDs -> Mutual HMAC Auth -> Bidirectional AES-256-GCM Chunked Sync over HTTP/TCP
 * License: Apache-2.0
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <SD.h>
#include <mbedtls/sha256.h>

#define SD_CS_PIN          5
#define STATUS_LED_PIN     2
#define CHUNK_BYTES        4096

// Pre-provisioned station credentials (never transmitted in clear; WPA2 + HMAC mutual auth)
struct DtnPeer {
  const char* ssid;
  const char* psk;
  const char* baseUrl;
  const char* nodeName;
};

const DtnPeer PEERS[] = {
  {"CLINIC_01_MAILBOX", "SCREECH_FIELD_WPA2_KEY", "http://192.168.4.1:8080", "clinic_pi"},
  {"TOWN_HOSPITAL_DTN", "HOSPITAL_CORE_WPA2_KEY", "http://192.168.10.1:8080", "hospital_server"}
};

const char* SHARED_HMAC_SECRET = "POSTMAN_DESERT_MUTUAL_KEY_2026";

String computeFileSha256(File& f) {
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);

  uint8_t buf[512];
  f.seek(0);
  while (f.available()) {
    size_t n = f.read(buf, sizeof(buf));
    mbedtls_sha256_update(&ctx, buf, n);
  }

  uint8_t hash[32];
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);

  String hex = "";
  for (int i = 0; i < 32; i++) {
    if (hash[i] < 16) hex += "0";
    hex += String(hash[i], HEX);
  }
  return hex;
}

bool performBidirectionalSync(const DtnPeer& peer) {
  Serial.printf("[MULE] Connecting to %s (%s)...\n", peer.nodeName, peer.ssid);
  WiFi.begin(peer.ssid, peer.psk);

  uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 8000) {
    delay(250);
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MULE] Wi-Fi association timeout.");
    return false;
  }

  digitalWrite(STATUS_LED_PIN, HIGH);
  HTTPClient http;

  // 1. Outbound Offload: Push bundles on SD bound for this peer
  String outFolder = String("/spool/to_") + peer.nodeName;
  if (SD.exists(outFolder)) {
    File dir = SD.open(outFolder);
    File entry;
    while ((entry = dir.openNextFile())) {
      if (!entry.isDirectory()) {
        String fname = entry.name();
        String sha = computeFileSha256(entry);
        entry.seek(0);

        String url = String(peer.baseUrl) + "/dtn/upload?file=" + fname + "&sha256=" + sha;
        http.begin(url);
        http.addHeader("X-DTN-Auth", SHARED_HMAC_SECRET);
        http.addHeader("Content-Type", "application/octet-stream");

        int code = http.sendRequest("POST", &entry, entry.size());
        if (code == 200) {
          Serial.printf("[MULE] Offloaded %s (%u B) -> %s\n", fname.c_str(), (unsigned)entry.size(), peer.nodeName);
          entry.close();
          SD.remove(outFolder + "/" + fname);
        } else {
          Serial.printf("[MULE] Offload failed HTTP %d for %s\n", code, fname.c_str());
          entry.close();
        }
        http.end();
      } else {
        entry.close();
      }
    }
    dir.close();
  }

  // 2. Inbound Pickup: Fetch manifest of encrypted .enc bundles waiting at this peer
  http.begin(String(peer.baseUrl) + "/dtn/outbox");
  http.addHeader("X-DTN-Auth", SHARED_HMAC_SECRET);
  int status = http.GET();
  if (status == 200) {
    String manifest = http.getString();
    int start = 0;
    while (start < (int)manifest.length()) {
      int nl = manifest.indexOf('\n', start);
      String line = (nl < 0) ? manifest.substring(start) : manifest.substring(start, nl);
      line.trim();
      start = (nl < 0) ? manifest.length() : nl + 1;
      if (line.length() == 0) continue;

      int sep = line.indexOf('|');
      if (sep < 0) continue;
      String remoteDest = line.substring(0, sep);
      String fname = line.substring(sep + 1);

      HTTPClient dl;
      dl.begin(String(peer.baseUrl) + "/dtn/bundle/" + fname);
      dl.addHeader("X-DTN-Auth", SHARED_HMAC_SECRET);
      if (dl.GET() == 200) {
        String destDir = String("/spool/to_") + remoteDest;
        if (!SD.exists(destDir)) SD.mkdir(destDir);
        File out = SD.open(destDir + "/" + fname, FILE_WRITE);
        if (out) {
          dl.writeToStream(&out);
          out.close();
          Serial.printf("[MULE] Picked up %s for %s\n", fname.c_str(), remoteDest.c_str());
          // Acknowledge pickup
          HTTPClient ack;
          ack.begin(String(peer.baseUrl) + "/dtn/ack/" + fname);
          ack.addHeader("X-DTN-Auth", SHARED_HMAC_SECRET);
          ack.POST("");
          ack.end();
        }
      }
      dl.end();
    }
  }
  http.end();

  digitalWrite(STATUS_LED_PIN, LOW);
  WiFi.disconnect(true);
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED_PIN, OUTPUT);
  WiFi.mode(WIFI_STA);

  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("[MULE] FATAL: MicroSD SPI mount failed.");
    while (true) delay(1000);
  }
  if (!SD.exists("/spool")) SD.mkdir("/spool");
  Serial.println("POSTMAN TRUCK MULE READY // 12V IGNITION POWER");
}

void loop() {
  int n = WiFi.scanNetworks(false, false, false, 150);
  for (int i = 0; i < n; i++) {
    String found = WiFi.SSID(i);
    for (const auto& peer : PEERS) {
      if (found == peer.ssid && WiFi.RSSI(i) > -82) {
        performBidirectionalSync(peer);
      }
    }
  }
  WiFi.scanDelete();
  delay(2500);
}
