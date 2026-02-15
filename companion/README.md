# ScreenX Companion App

The companion app handles firmware flashing, WiFi setup, and live telemetry streaming for your ScreenX wheel display.

## Quick Start

### Option 1: Download Pre-Built Executable (Easiest)

1. Go to the [GitHub Releases](https://github.com/Xordas/ScreenX/releases) page
2. Download the latest `ScreenX-Companion.exe`
3. Run the executable
4. Follow the in-app onboarding wizard

No installation or Python required—just download and run!

### Option 2: Run From Source

#### Requirements
- Python 3.9 or higher
- Windows 10/11 (Linux support untested)

#### Setup

1. Clone or download the repository
2. Navigate to the companion directory:
   ```bash
   cd companion
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the app:
   ```bash
   python companion.py
   ```

### Option 3: Build Your Own Executable

#### Requirements
- Python 3.9 or higher
- PyInstaller

#### Build Steps

1. Navigate to the companion directory:
   ```bash
   cd companion
   ```

2. Install build dependencies:
   ```bash
   pip install -r requirements.txt
   pip install pyinstaller
   ```

3. Build the executable:
   ```bash
   pyinstaller companion.spec
   ```

4. The compiled app will be in `dist/ScreenX-Companion.exe`

## Features

- **Device Detection**: Auto-detects your ESP32 on USB or manually select the COM port
- **Firmware Flashing**: One-click firmware upload to your device
- **WiFi Setup**: Send network credentials over serial
- **Live Dashboard**: Real time telemetry from Assetto Corsa
- **Layout Customization**: Configure what data displays on your screen
- **Preset Management**: Save and load custom display layouts

## First Run

1. **Connect Device**: Plug in your ESP32 via USB (Ensure its in bootloader mode!)
2. **Detect Port**: Click "Detect Device" (or manually select the COM port)
3. **Flash Firmware**: Select a `.bin` file and click "Flash"
4. **Send WiFi**: Enter your network name and password
5. **Start Racing**: Enter the ESP32's IP in the Dashboard tab and start Assetto Corsa

## Clearing the saved info
The files for storing app data are located at %localappdata%, or C:\Users\USER\AppData\Local\ScreenX-Companion
To completely wipe all saved data just delete these the files in this folder, they will be regenerated automatically on the next app startup.

### Dependencies

- `pyserial` – Serial port communication
- `esptool` – ESP32 flashing
- `pywebview` – Displaying the web ui as a windows app

See `requirements.txt` for versions.