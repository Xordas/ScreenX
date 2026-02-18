# ScreenX

ScreenX is a DIY telemetry display for the Moza ES Lite wheel. It streams Assetto Corsa data over WiFi to an ESP32 + 2.08" OLED mounted on your wheel, powered by a desktop companion app.

### Click this to view a example video of the ScreenX in action!
[![ScreenX example video](https://img.youtube.com/vi/Xs3BgeOfBho/0.jpg)](https://youtu.be/fExnvN5_pLo)

## Table of Contents
- [ESP32 Firmware](firmware/README.md)
- [Docs](docs/README.md)
- [PCB](pcb/README.md)
- [Devlog](devlog/README.md)
- [Companion App](companion/README.md)

## Features
- Real-time telemetry (speed, RPM, gear, temps, etc.)
- One-click flashing and WiFi setup from the companion app
- Wireless ESP32 connection (no extra wires to the PC)
- Optional PCB workflow (coming soon)

## Requirements

### Hardware
- Seeed Studio XIAO ESP32 (C6 recommended; C3/S3 supported)
- 2.08" 256x64 SPI OLED (7-pin)
- Jumper wires

### Software
- Windows 10/11
    - Linux is **NOT** supported because of Asseto Corsa not running natively on linux and needing a emulator to run, thus making it so the companion app cannot access the AC shared memory.
- Python 3.9+ (only if running from source)
- Assetto Corsa


## Quick Start (Companion App)
1. Download the latest release from the GitHub releases page.
2. Run `companion.exe`.
3. Follow the in-app onboarding (detect device, flash firmware, send WiFi).
4. Enter the ESP32 IP shown on the display in the Dashboard tab.

## Run From Source
View the readme files inside of `companion/` and  `firmware/`

## Firmware
If you are building or flashing manually, you can use `firmware.ino` or the prebuilt `firmware.bin`. The companion app can flash `.bin` files directly.

## Docs
See the HTML docs in `docs/`, or on the website to the right of this repo, for full wiring, setup, and troubleshooting.

## Ai usage disclosure
### AI was used in the following ways to assist with this project:
- Code auto completions
- Debugging help (Sparsely)
- Cleaning up the ESP32 gui after I made the original version
- Cleaning messy code and some frontend gui
- Parts of documentation, I have since verified all information inside the docs is correct
