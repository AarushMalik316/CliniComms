# SCREECH // POSTMAN — Off-Grid Desert Clinic Comms

## What It Is & Why It Is Necessary

**Topic — Staying Connected in the Deep Desert:** An off-grid, solar-friendly communications platform (`$37` BOM · `$0/mo` · `1.80 W` draw) combining **VHF acoustic telemetry** over existing analog walkie-talkies with an **encrypted Delay-Tolerant Network (DTN)** that turns routine supply trucks into physical data mules.

**Why It Is Necessary:** Remote desert clinics and mobile medics operate far beyond cellular towers and fiber backhaul, while satellite terminals (such as Starlink at `65 W` and `$100+/mo`) drain small clinic solar batteries overnight and require recurring subscriptions. Yet clinics still have two urgent communication needs:
1. **Low-bandwidth, life-critical telemetry** — medic GPS SOS alerts and vaccine fridge excursion warnings (`>8 °C`) that must cross desert ridges immediately over existing NGO VHF radios, even through sandstorm static.
2. **High-bandwidth clinical records** — patient histories, lab bloodwork, and imaging manifests that must travel securely between the clinic and town hospital without internet access or exposing plaintext patient data in transit.

---

**SCREECH // POSTMAN** is an offline-first Progressive Web App (PWA) and hardware reference design built for remote clinics without cellular, fiber, or satellite coverage (`$37` BOM · `1.80 W` solar draw).

It combines two real working transports:
1. **The Screech (`Live Transceiver`):** Turns any analog walkie-talkie into a digital telemetry radio using real Bell 202 audio tones (`1200 Hz / 2200 Hz`), carrier sense, `CRC-16-CCITT`, and `GF(2^8)` Reed-Solomon error repair.
2. **The Postman (`DTN Mailbag`):** Transfers encrypted medical files (`AES-256-GCM` + `SHA-256`) using supply trucks as zero-touch `<100m` Wi-Fi data mules, saved persistently in browser **IndexedDB**.

---

## Features at a Glance

- **Real Web Audio AFSK Modem (`Live Transceiver`):** Generates and plays real `300 baud` audio bursts (`500ms` squelch front-porch + 28-byte binary frame), visualizes the live waveform & Goertzel frequency spectrum, exports `.WAV` files, and listens via your device microphone.
- **Self-Healing 28-Byte Protocol (`28-Byte FEC Integrity`):** Repairs up to ~30% burst corruption using Reed-Solomon parity and rejects overly corrupted packets with `CRC-16-CCITT` before they ever reach the rescue map.
- **Two-Screen Ranger Receiver (`Kiosk Drawer` & `Kiosk Tab`):** Syncs live alerts across browser tabs via `BroadcastChannel` and plots only CRC-verified coordinates.
- **Terrain & VHF Line-of-Sight Map (`Field Map & LOS`):** Calculates real Haversine distance, `146.520 MHz` free-space path loss (FSPL), knife-edge canyon diffraction, and 1st Fresnel clearance on an interactive Leaflet topographic map.
- **Encrypted Truck Delivery (`DTN Mailbag`):** Encrypts real uploaded files or generated HL7/Lab records in the browser, syncs automatically within `<100m`, keeps the truck mule completely blind (no decryption keys), and verifies `SHA-256` integrity on delivery.
- **Hardware, Firmware & Offline PWA (`Hardware & Firmware`):** Includes a `$2` TRRS wiring schematic, solar battery runtime calculator, downloadable ESP32/Raspberry Pi firmware in `/firmware/`, `Night Ops` dark mode, and offline PWA support.

---

## Step-by-Step Guide: How to Use & Test Every Feature

### 1. Send & Decode an Emergency Radio Burst (`Live Transceiver`)
Click **`Live Transceiver`** in the left sidebar (default screen) and look at the **TX & Channel Control** panel on the right:

1. **Transmit a Live Audio SOS:**
   - Ensure **`Live Speaker Audio`** is checked and your volume is up.
   - Click **`Send Medic GPS SOS`** (or click **`Transmit`** in the top-right header).
   - **What to check:** You will hear the `500ms` mark tone followed by the digital burst. The **`Acoustic AFSK Signal`** card displays the live waveform and `1.2 kHz / 2.2 kHz` spectrum peaks, and a new verified SOS row appears inside **`Decoded Telemetry Frames`**.
2. **Test Error Repair (Reed-Solomon FEC):**
   - Drag the **`Channel Static Injector`** slider to **`20%`** and click **`Send Medic GPS SOS`**.
   - **What to check:** Even though static corrupts bytes in transit, the status shows **`FEC +NB`** in green inside **`Decoded Telemetry Frames`**, and the green slice updates on the **`28-Byte FEC Integrity`** ring.
   - Click **`Hex Matrix`** on the **`28-Byte FEC Integrity`** card to inspect all 28 individual bytes (`PRE`, `SYNC`, `TYPE`, `NODE`, `TIME`, `DATA`, `CRC`, `FEC`), then click **`Ring View`** to return.
3. **Test Bad-Packet Rejection (`CRC-16`):**
   - Drag **`Channel Static Injector`** to **`60%`** (above FEC recovery capacity) and click **`Transmit`**.
   - **What to check:** The frame fails integrity and logs **`CRC FAIL`** / **`Rejected (CRC-16 Mismatch)`** in red—corrupted coordinates are never plotted.
4. **Test Listen-Before-Talk (Carrier Sense):**
   - Check **`Human Voice on Channel (LBT)`** and click **`Transmit`**.
   - **What to check:** The top status changes to **`Carrier Busy Wait`** and transmission is blocked so the modem does not talk over human speech. Uncheck it to resume.
5. **Test Vaccine Fridge Alert & Custom 8-Byte Code:**
   - Click **`Simulate Fridge >8°C Excursion`** (sets the **`Fridge`** probe to `11.4°C`), then click **`Transmit`**.
   - Or type up to 8 characters (such as `MED_EVAC`) in the **`8-byte field code (e.g. MED_EVAC)...`** input at the bottom-right and press **Enter** (or click the round arrow button).
6. **Test Real Audio Export & Microphone Decoding:**
   - Click **`.WAV`** at the top of **TX & Channel Control** to download a real `44.1 kHz` AFSK `.wav` audio file.
   - Click **`Acoustic Mic RX`** (switches from `OFF` to `LISTENING`) on a second browser/device and play the `.WAV` file near the microphone to decode over the air.

---

### 2. Test the Dual-Screen Ranger Receiver (`Kiosk Drawer` / `Kiosk Tab`)
1. Click **`Kiosk Tab`** in the top-right header to open the receiver in a separate browser window (`?kiosk=1`), or click **`Kiosk Drawer`** to dock it inline on the right.
2. Back in the main **`Live Transceiver`** tab, send one burst at `15%` static and another at `60%` static.
3. **What to check in the Kiosk:**
   - Valid/FEC-repaired bursts sync instantly across tabs, plot a rescue pin on the **`VERIFIED RESCUE PLOTTER`** mini-map, and can be cleared with **`Ack`** or **`Ack All`**.
   - The `60%` corrupted burst shows **`PACKET REJECTED — NOT PLOTTED`**.
   - Use **`Mute Alarm`** to silence alert state.

---

### 3. Test Terrain & Radio Line-of-Sight (`Field Map & LOS`)
Click **`Field Map & LOS`** in the left sidebar:

1. **Live Geodesic & Signal Math:**
   - Drag the orange **`MEDIC_01 [TX]`** pin anywhere on the map (or switch regions in the sector dropdown, e.g. *Rub' al Khali Sector 4* or *Wadi Rum Canyon*).
   - **What to check:** **`Link Analysis`** updates **`Haversine Distance`**, **`Azimuth Bearing`**, **`FSPL (146.52 MHz)`**, and **`Knife-Edge Diffraction`** in real time, while **`Elevation & 1st Fresnel Clearance`** redraws the terrain profile.
2. **Simulate Canyon Shadow vs. Hilltop Repeater:**
   - Click **`Test Canyon Blockage`** to place the medic behind a ridge.
   - Click **`Repeater: Online`** to toggle it to **`Repeater: Offline`**.
   - **What to check:** The link polyline turns red, signal drops below `-118 dBm` (**`BLOCKED`**), and the elevation graph displays **`Canyon Obstructed`**. Click **`Repeater: Offline`** again (or **`Reset`**) to restore the relay.
3. **Optional Hardware GPS:** Return to **`Live Transceiver`** and click **`GPS`** at the top of **TX & Channel Control** to lock your device's real browser coordinates.

---

### 4. Test Encrypted Truck Delivery (`DTN Mailbag`)
Click **`DTN Mailbag`** in the left sidebar:

1. **Create & Encrypt Real Bundles:**
   - Under **`Clinic_01 Mailbox`**, click **`+ HL7 Patient`** or click **`Upload File`** to choose any real file from your computer.
   - Under **`Town Hospital Server`**, click **`+ Lab Results`**.
   - **What to check:** Files appear in each spool with encrypted **`AES-256-GCM`** size and a **`SHA`** digest. Click **`Decrypt`** to read the verified plaintext or **`Save`** to download the original file.
2. **Run a Zero-Touch `<100m` Sync:**
   - Drag the route slider inside **`Supply Truck Mule`** to **`100`** (or click **`To Clinic`**).
   - **What to check:** Within `100m` of Clinic_01, clinic files automatically transfer onto **`Supply Truck Mule`** labeled **`Encrypted SD`** and **`Blind ESP32 Mule (Zero Plaintext Keys)`** (notice there is no **`Decrypt`** button on the truck), and **`Zero-Touch Handshake Log`** records a **`VERIFIED`** receipt.
   - Drag the slider back to **`0`** (or click **`To Hospital`**) to deliver clinic files to **`Town Hospital Server`** (`Delivered`) and verify with **`Decrypt`**.
3. **Test Monsoon Disruption & Persistence:**
   - Check **`Washed-Out Monsoon Road`** inside **`Supply Truck Mule`** to lock out truck dispatch while keeping VHF radio bursts active.
   - Refresh the page (`F5`): all encrypted bundles and sync receipts persist via **IndexedDB**. Click **`Reset Spooled Files`** anytime to reset to initial state.

---

### 5. Test Hardware Archive, Dark Mode & Search (`Hardware & Firmware`)
- Click **`Hardware & Firmware`** in the left sidebar:
  - Drag the battery slider (`Wh`) in **`Power & Cost Comparison`** to compare clinic autonomy hours against `Starlink Dishy` (`65.0 W`).
  - Inspect **`$2 TRRS-to-Walkie-Talkie Schematic`**.
  - Switch between **`screech_tx_node.ino`**, **`postman_truck_mule.ino`**, and **`mailbox_daemon.py`** in **`Firmware Repository`**, then click **`Copy`** or **`Download`**.
- **Sidebar Utilities:**
  - Press `⌘K` / `Ctrl+K` (or type in **`Search`**) to filter workspaces, nodes, or telemetry rows.
  - Click **`Night Ops`** at the bottom-left to toggle high-contrast dark mode (**`Light Studio`** switches back).

---

## Local Development, Unit Tests & Firmware

### Run the Web App & Tests Locally
```bash
npm install
npm run dev       # Starts dev server on http://localhost:3000

# Run unit tests (Protocol/FEC, AFSK Modem, Geodesic RF, Web Crypto DTN):
npx --yes tsx --test src/lib/protocol/frame.test.ts src/lib/modem/afsk.test.ts src/lib/geodesic/rf.test.ts src/lib/dtn/crypto.test.ts

# Type-check and build production PWA:
npm run lint && npm run build
```

### Flashing Physical Hardware (`/firmware/`)
- **VHF Walkie-Talkie TX Node:** `firmware/screech_tx_node/screech_tx_node.ino` (Arduino IDE · ESP32 Dev Module · `TinyGPSPlus` · `115200` baud).
- **Truck Wi-Fi Mule:** `firmware/postman_truck_mule/postman_truck_mule.ino` (ESP32 + SPI MicroSD on `CS=GPIO5`).
- **Clinic 1.0W Mailbox Daemon:** `firmware/clinic_pi_mailbox/mailbox_daemon.py` (Python 3 + `cryptography` on Raspberry Pi Zero W).
