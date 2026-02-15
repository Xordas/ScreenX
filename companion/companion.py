"""""""""""""""""""""""""""""""""
#################################

ScreenX Companion App
Version 1.0.0

#################################
"""""""""""""""""""""""""""""""""

import ctypes
import json
import mmap
import os
import queue
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import urllib.parse
import webbrowser
from http import server
from http.server import ThreadingHTTPServer
import warnings
with warnings.catch_warnings():
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    try:
        import cgi
    except Exception:
        cgi = None

try:
    import serial
    import serial.tools.list_ports
    SERIAL_AVAILABLE = True
except Exception:
    SERIAL_AVAILABLE = False

# Debug mode (i dont know if this even works i havent used it in forever, dont rely on it)
DEBUG_VERBOSE = False

DEFAULT_IP = "192.168.1.1"
DEFAULT_PORT = 8888
DEFAULT_BAUD = 115200
DEFAULT_FLASH_BAUD = 460800
DEFAULT_CHIP = "esp32c6"
SERVER_PORT = 8765

APP_NAME = "ScreenX-Companion"

# If its an app use localappdata if its not use the script dir
if getattr(sys, "frozen", False):
    RESOURCE_DIR = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    if os.name == "nt":
        base_data = os.getenv("LOCALAPPDATA") or os.path.expanduser("~")
    else:
        base_data = os.path.expanduser("~")
    DATA_DIR = os.path.join(base_data, APP_NAME)
else:
    RESOURCE_DIR = os.path.dirname(os.path.abspath(__file__))
    DATA_DIR = RESOURCE_DIR

WEB_DIR = os.path.join(RESOURCE_DIR, "web")
STATE_FILE = os.path.join(DATA_DIR, "companion_state.json")
PRESETS_FILE = os.path.join(DATA_DIR, "layout_presets.json")

MIN_SEND_INTERVAL = 0.02
HEARTBEAT_INTERVAL = 0.5
ESP_HEARTBEAT_INTERVAL = 0.5
ESP_HEARTBEAT_TIMEOUT = 2.0

telemetry_queue = queue.Queue()
telemetry_worker = None
telemetry_status = "Idle"
telemetry_last = None
heartbeat_worker = None
heartbeat_lock = threading.Lock()
heartbeat_last = 0.0
heartbeat_ever = False

flash_jobs = {}
flash_lock = threading.Lock()
flash_seq = 0
json_io_lock = threading.Lock()

# DEFINITIONS BELOW:

def is_ac_running():
    try:
        creationflags = 0
        startupinfo = None
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0

        result = subprocess.run(
            ['tasklist', '/FI', 'IMAGENAME eq acs.exe', '/NH'],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        return 'acs.exe' in result.stdout.lower()
    except Exception:
        return False
    
def open_physics_map():
    return mmap.mmap(-1, PHYSICS_SIZE, tagname="acpmf_physics", access=mmap.ACCESS_READ)

def _atomic_write_json(path, payload):
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, temp_path = tempfile.mkstemp(prefix=".tmp_", suffix=".json", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass

def load_state():
    with json_io_lock:
        if not os.path.exists(STATE_FILE):
            if DEBUG_VERBOSE:
                print("State file not found, using default")
            return {"onboarding_seen": False}

        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                state = json.load(f)
            if isinstance(state, dict):
                return state
            if DEBUG_VERBOSE:
                print("State file had invalid format, using default")
        except Exception as e:
            if DEBUG_VERBOSE:
                print(f"Error loading state file, using default: {e}")
        return {"onboarding_seen": False}

def save_state(state):
    with json_io_lock:
        _atomic_write_json(STATE_FILE, state)
        if DEBUG_VERBOSE:
            print("Saved state to file:", STATE_FILE)

def load_presets():
    with json_io_lock:
        if not os.path.exists(PRESETS_FILE):
            return []
        try:
            with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                presets = json.load(f)
            return presets if isinstance(presets, list) else []
        except Exception:
            return []

def save_presets(presets):
    with json_io_lock:
        _atomic_write_json(PRESETS_FILE, presets)

def send_layout(ip, port, layout):
    def zone_str(zone):
        p = zone.get("primary", "none")
        s = zone.get("secondary", "none")
        return f"{p},{s}"

    packet = f"LAYOUT:{zone_str(layout.get('left', {}))}|{zone_str(layout.get('middle', {}))}|{zone_str(layout.get('right', {}))}"
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.sendto(packet.encode("utf-8"), (ip, port))
        if DEBUG_VERBOSE:
            print(f"Sent layout to {ip}:{port}: {packet}")
        return True
    except Exception as e:
        if DEBUG_VERBOSE:
            print(f"Layout send error: {e}")
        return False
    finally:
        sock.close()

def list_ports():
    if not SERIAL_AVAILABLE:
        if DEBUG_VERBOSE:
            print("Cannot list availible COM ports.")
        return []
    
    return list(serial.tools.list_ports.comports())

def find_esp_port(ports):
    serial_candidates = []
    generic_candidates = []
    jtag_candidates = []
    for p in ports:
        desc = (p.description or "").lower()
        manu = (p.manufacturer or "").lower()
        if "xiao" in desc or "seeed" in desc or "xiao" in manu or "seeed" in manu:
            if "jtag" in desc:
                jtag_candidates.append(p.device)
            else:
                serial_candidates.append(p.device)
            continue 
        if p.vid == 0x303A:
            if "jtag" in desc:
                jtag_candidates.append(p.device)
            elif "serial" in desc or "usb serial" in desc or "cdc" in desc:
                serial_candidates.append(p.device)
            elif "esp32" in desc or "usb" in desc:
                generic_candidates.append(p.device)

    pick = ""
    if serial_candidates:
        pick = serial_candidates[0]
    elif len(generic_candidates) == 1:
        pick = generic_candidates[0]
    elif len(jtag_candidates) == 1:
        pick = jtag_candidates[0]

    if pick:
        if DEBUG_VERBOSE:
            print("Detected esp device on port:", pick)
        return pick
    return ""

def telemetry_sender():
    global telemetry_status, telemetry_last
    while True:
        try:
            kind, payload = telemetry_queue.get(timeout=0.5)
            if kind == "status":
                telemetry_status = payload
            elif kind == "error":
                telemetry_status = "Error"
            elif kind == "telemetry":
                telemetry_last = payload
        except queue.Empty:
            pass

def reset_heartbeat_state():
    global heartbeat_last, heartbeat_ever
    with heartbeat_lock:
        heartbeat_last = 0.0
        heartbeat_ever = False

def get_heartbeat_status():
    with heartbeat_lock:
        last = heartbeat_last
        ever = heartbeat_ever
    running = heartbeat_worker is not None and heartbeat_worker.is_alive()
    now = time.time()
    connected = running and ever and (now - last <= ESP_HEARTBEAT_TIMEOUT)
    return {
        "running": running,
        "connected": connected,
        "ever_seen": ever,
        "last_seen": last,
        "timeout_s": ESP_HEARTBEAT_TIMEOUT,
    }

# End definitions

class TelemetrySender(threading.Thread):
    def __init__(self, ip, port, Tire_live, out_queue):
        super().__init__(daemon=True)
        self.ip = ip
        self.port = port
        self.Tire_live = Tire_live
        self.out_queue = out_queue
        self.stop_event = threading.Event()

    def stop(self):
        self.stop_event.set()

    def run(self):
        udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        udp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 0)

        last_print = time.time()
        last_send = 0.0
        last_packet = ""
        last_gear = "N"
        last_heartbeat = 0.0
        last_ac_check = 0.0
        ac_running = False
        print_interval = 0.1 if self.Tire_live else 1.0

        self.out_queue.put(("status", "Telemetry running"))

        while not self.stop_event.is_set():
            try:
                now = time.time()

                # Check if Assetto Corsa is running
                if now - last_ac_check >= 3.0:
                    ac_running = is_ac_running()
                    last_ac_check = now

                if not ac_running:
                    # Dont send data if its not running
                    if time.time() - last_print > print_interval:
                        self.out_queue.put(("telemetry", {"ac_running": False}))
                        last_print = time.time()
                    time.sleep(0.5)
                    last_packet = ""
                    continue

                
                try:
                    mm = open_physics_map()
                except Exception:
                    # ac is probably starting so wait and retry
                    time.sleep(0.5)
                    continue
                try:
                    mm.seek(0)
                    data = mm.read(PHYSICS_SIZE)
                finally:
                    mm.close()

                physics = MemMap.from_buffer_copy(data)

                raw_gear = physics.gear
                if raw_gear == 0:
                    gear_str = "R"
                elif raw_gear == 1:
                    gear_str = "N"
                else:
                    gear_str = str(raw_gear - 1)

                try:
                    max_wheel_slip = max(abs(float(physics.wheelSlip[i])) for i in range(4))
                except Exception:
                    max_wheel_slip = 0.0

                SLIP_THRESHOLD = 1.0  # change for tuning, i didnt find a way to 100% find if abs or tc is actively working so this is my workaround
                abs_alert = int(float(physics.abs) > 0 and max_wheel_slip > SLIP_THRESHOLD and physics.brake > 0.5 and physics.brake > physics.gas)
                tc_alert  = int(float(physics.tc) > 0 and max_wheel_slip > SLIP_THRESHOLD and physics.gas > 0.5 and physics.gas > physics.brake)
                # print(f"ABS: {physics.abs:.3f}, TC: {physics.tc:.3f}, ABS Alert: {abs_alert}, TC Alert: {tc_alert}, Max Slip: {max_wheel_slip:.3f}, brake: {physics.brake:.3f}, gas: {physics.gas:.3f}")

                low_wear = 97.9
                display_empty_at = 86.0

                Tire_low = [0, 0, 0, 0]
                Tire_wear_pct = [0, 0, 0, 0]
                Tire_display_pct = [100, 100, 100, 100]

                for i in range(4):
                    wear_raw = float(physics.TireWear[i])
                    wear_pct = max(0.0, min(100.0, wear_raw))
                    Tire_wear_pct[i] = wear_pct

                    low = wear_pct < low_wear
                    Tire_low[i] = int(low)

                    remapped = (wear_pct - display_empty_at) / (100.0 - display_empty_at)
                    remapped = max(0.0, min(1.0, remapped))
                    Tire_display_pct[i] = int(round(remapped * 100.0))

                check_rl = Tire_low[2]
                placeholder_1 = int(physics.numberOfTiresOut > 0)
                placeholder_2 = int(max(physics.carDamage) > 0.01)
                pit = physics.pitLimiterOn
                speed_kmh = physics.speedKmh
                rpms = physics.rpms
                throttle = int(physics.gas * 100)
                brake_pct = int(physics.brake * 100)
                fuel = physics.fuel
                boost = physics.turboBoost
                air_temp = physics.airTemp
                road_temp = physics.roadTemp
                drs_on = physics.drsEnabled
                clutch_pct = int(physics.clutch * 100)
                steer_angle = physics.steerAngle
                avg_brake_temp = sum(physics.brakeTemp[i] for i in range(4)) / 4.0

                packet = (
                    f"G:{gear_str}|PIT:{pit}|ABS:{abs_alert}|TC:{tc_alert}|"
                    f"RL:{check_rl}|P1:{placeholder_1}|P2:{placeholder_2}|"
                    f"T0:{Tire_low[0]}|T1:{Tire_low[1]}|T2:{Tire_low[2]}|T3:{Tire_low[3]}|"
                    f"W0:{Tire_display_pct[0]}|W1:{Tire_display_pct[1]}|W2:{Tire_display_pct[2]}|W3:{Tire_display_pct[3]}|"
                    f"SPD:{speed_kmh:.0f}|RPM:{rpms}|THR:{throttle}|BRK:{brake_pct}|"
                    f"FUEL:{fuel:.1f}|BST:{boost:.2f}|ATMP:{air_temp:.0f}|RTMP:{road_temp:.0f}|"
                    f"DRS:{drs_on}|CLT:{clutch_pct}|STR:{steer_angle:.2f}|BTMP:{avg_brake_temp:.0f}"
                )

                now = time.time()
                changed = packet != last_packet or gear_str != last_gear
                heartbeat_due = (now - last_heartbeat) >= HEARTBEAT_INTERVAL
                rate_ok = (now - last_send) >= MIN_SEND_INTERVAL

                if changed or (heartbeat_due and rate_ok):
                    if changed or rate_ok:
                        udp_sock.sendto(packet.encode(), (self.ip, self.port))
                        last_send = now
                        last_packet = packet
                        last_gear = gear_str
                        if heartbeat_due:
                            last_heartbeat = now

                if time.time() - last_print > print_interval:
                    self.out_queue.put(("telemetry", {
                        "ac_running": True,
                        "gear": gear_str,
                        "pit": pit,
                        "abs": abs_alert,
                        "tc": tc_alert,
                        "rl": check_rl,
                        "wear_pct": Tire_wear_pct,
                        "Tire_low": Tire_low,
                        "Tire_display_pct": Tire_display_pct,
                        "p1": placeholder_1,
                        "p2": placeholder_2,
                        "speed": speed_kmh,
                        "rpm": rpms,
                        "throttle": throttle,
                        "brake": brake_pct,
                        "fuel": fuel,
                        "boost": boost,
                        "air_temp": air_temp,
                        "road_temp": road_temp,
                        "drs": drs_on,
                        "clutch": clutch_pct,
                        "steer": steer_angle,
                        "brake_temp": avg_brake_temp,
                    }))
                    last_print = time.time()

            except Exception as e:
                self.out_queue.put(("error", f"Telemetry error: {e}"))
                if DEBUG_VERBOSE:
                    print(f"Telemetry error: {e}")
                break

            time.sleep(0.005)

        udp_sock.close()
        self.out_queue.put(("status", "Telemetry stopped"))

class HeartbeatSender(threading.Thread):
    def __init__(self, ip, port):
        super().__init__(daemon=True)
        self.ip = ip
        self.port = port
        self.stop_event = threading.Event()

    def stop(self):
        self.stop_event.set()

    def run(self):
        global heartbeat_last, heartbeat_ever
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", 0))
        sock.settimeout(0.1)

        last_send = 0.0
        while not self.stop_event.is_set():
            now = time.time()
            if now - last_send >= ESP_HEARTBEAT_INTERVAL:
                try:
                    sock.sendto(b"HB", (self.ip, self.port))
                except Exception:
                    if DEBUG_VERBOSE:
                        print("Heartbeat send error")
                    pass
                last_send = now

            try:
                data, _addr = sock.recvfrom(64)
                if data.startswith(b"HB_ACK"):
                    with heartbeat_lock:
                        heartbeat_last = time.time()
                        heartbeat_ever = True
            except socket.timeout:
                pass
            except Exception:
                if DEBUG_VERBOSE:
                    print("Heartbeat receive error")
                pass

        sock.close()

# Flashing
class FlashJob:
    def __init__(self):
        self.lines = []
        self.done = False
        self.ok = False

    def add(self, line):
        if len(self.lines) < 1000:
            self.lines.append(line)

class FlashRunner(threading.Thread):
    def __init__(self, job_id, chip, port, baud, bin_path):
        super().__init__(daemon=True)
        self.job_id = job_id
        self.chip = chip
        self.port = port
        self.baud = baud
        self.bin_path = bin_path

    def run(self):
        base_args = [
            "--chip",
            self.chip,
            "--port",
            self.port,
            "--baud",
            str(self.baud),
            "write-flash",
            "0x0",
            self.bin_path,
        ]

        if getattr(sys, "frozen", False):
            py_launcher = shutil.which("py")
            python_cmd = shutil.which("python")
            esptool_exe = shutil.which("esptool") or shutil.which("esptool.exe")

            if py_launcher:
                cmd = [py_launcher, "-m", "esptool", *base_args]
            elif python_cmd:
                cmd = [python_cmd, "-m", "esptool", *base_args]
            elif esptool_exe:
                cmd = [esptool_exe, *base_args]
            else:
                cmd = None
        else:
            cmd = [sys.executable, "-m", "esptool", *base_args]

        with flash_lock:
            job = flash_jobs.get(self.job_id)
        if not job:
            return

        if cmd is None:
            job.add("Flash error: cannot find Python launcher or esptool in PATH")
            job.add("Install esptool with: pip install esptool")
            job.done = True
            job.ok = False
            return

        job.add("Running: " + " ".join(cmd))
        if DEBUG_VERBOSE:
            print("Running flash command:", " ".join(cmd))

        creationflags = 0
        startupinfo = None
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                startupinfo=startupinfo,
                creationflags=creationflags,
            )
        except Exception as e:
            job.add(f"Flash error: Failed to start esptool: {e}")
            if "esptool" in str(e).lower() or "module" in str(e).lower():
                job.add("Make sure esptool is installed: pip install esptool")
            job.done = True
            job.ok = False
            return

        try:
            for line in proc.stdout:
                job.add(line.rstrip())
        except Exception as e:
            job.add(f"Error reading output: {e}")

        rc = proc.wait()
        job.done = True
        job.ok = (rc == 0)

# Shared memory map, more of these may be added later to the esp32's gui, it depends on demand for specific features
class MemMap(ctypes.Structure):
    _pack_ = 4
    _fields_ = [
        ("packetId", ctypes.c_int32),
        ("gas", ctypes.c_float),
        ("brake", ctypes.c_float),
        ("fuel", ctypes.c_float),
        ("gear", ctypes.c_int32),
        ("rpms", ctypes.c_int32),
        ("steerAngle", ctypes.c_float),
        ("speedKmh", ctypes.c_float),
        ("velocity", ctypes.c_float * 3),
        ("accG", ctypes.c_float * 3),
        ("wheelSlip", ctypes.c_float * 4),
        ("wheelLoad", ctypes.c_float * 4),
        ("wheelsPressure", ctypes.c_float * 4),
        ("wheelAngularSpeed", ctypes.c_float * 4),
        ("TireWear", ctypes.c_float * 4),
        ("TireDirtyLevel", ctypes.c_float * 4),
        ("TireCoreTemperature", ctypes.c_float * 4),
        ("camberRAD", ctypes.c_float * 4),
        ("suspensionTravel", ctypes.c_float * 4),
        ("drs", ctypes.c_float),
        ("tc", ctypes.c_float),
        ("heading", ctypes.c_float),
        ("pitch", ctypes.c_float),
        ("roll", ctypes.c_float),
        ("cgHeight", ctypes.c_float),
        ("carDamage", ctypes.c_float * 5),
        ("numberOfTiresOut", ctypes.c_int32),
        ("pitLimiterOn", ctypes.c_int32),
        ("abs", ctypes.c_float),
        ("kersCharge", ctypes.c_float),
        ("kersInput", ctypes.c_float),
        ("autoShifterOn", ctypes.c_int32),
        ("rideHeight", ctypes.c_float * 2),
        ("turboBoost", ctypes.c_float),
        ("ballast", ctypes.c_float),
        ("airDensity", ctypes.c_float),
        ("airTemp", ctypes.c_float),
        ("roadTemp", ctypes.c_float),
        ("localAngularVel", ctypes.c_float * 3),
        ("finalFF", ctypes.c_float),
        ("performanceMeter", ctypes.c_float),
        ("engineBrake", ctypes.c_int32),
        ("ersRecoveryLevel", ctypes.c_int32),
        ("ersPowerLevel", ctypes.c_int32),
        ("ersHeatCharging", ctypes.c_int32),
        ("ersIsCharging", ctypes.c_int32),
        ("kersCurrentKJ", ctypes.c_float),
        ("drsAvailable", ctypes.c_int32),
        ("drsEnabled", ctypes.c_int32),
        ("brakeTemp", ctypes.c_float * 4),
        ("clutch", ctypes.c_float),
    ]

PHYSICS_SIZE = ctypes.sizeof(MemMap)

# Web server side of things
class CompanionServer(server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def _send_json(self, data, code=200):
        out = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b""
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        try:
            if self.path.startswith("/api/"):
                return self._handle_api_get()
            if self.path in ("/", "/onboarding", "/flash", "/wifi", "/telemetry", "/customize"):
                self.path = "/index.html"
            return super().do_GET()
        except Exception as e:
            traceback.print_exc()
            if self.path.startswith("/api/"):
                try:
                    return self._send_json({"ok": False, "error": f"GET handler crash: {e}"}, 500)
                except Exception:
                    pass
            raise

    def do_POST(self):
        try:
            if self.path.startswith("/api/"):
                return self._handle_api_post()
            self.send_error(404)
        except Exception as e:
            traceback.print_exc()
            if self.path.startswith("/api/"):
                try:
                    return self._send_json({"ok": False, "error": f"POST handler crash: {e}"}, 500)
                except Exception:
                    pass
            raise

    def _handle_api_get(self):
        if self.path.startswith("/api/state"):
            state = load_state()
            return self._send_json(state)

        if self.path.startswith("/api/ports"):
            ports = list_ports()
            return self._send_json({
                "ports": [p.device for p in ports],
                "details": [
                    {
                        "device": p.device,
                        "description": p.description,
                        "manufacturer": p.manufacturer,
                        "vid": p.vid,
                        "pid": p.pid,
                    }
                    for p in ports
                ],
            })

        if self.path.startswith("/api/autodetect"):
            ports = list_ports()
            auto = find_esp_port(ports)
            return self._send_json({"port": auto})

        if self.path.startswith("/api/flash/status"):
            query = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(query)
            job_id = params.get("job", [""])[0]
            with flash_lock:
                job = flash_jobs.get(job_id)
            if not job:
                return self._send_json({"ok": False, "done": True, "lines": ["Unknown job"]})
            return self._send_json({"ok": job.ok, "done": job.done, "lines": job.lines})

        if self.path.startswith("/api/telemetry/status"):
            return self._send_json({"status": telemetry_status, "last": telemetry_last})

        if self.path.startswith("/api/heartbeat/status"):
            return self._send_json(get_heartbeat_status())

        if self.path.startswith("/api/layout/current"):
            state = load_state()
            layout = state.get("current_layout", None)
            return self._send_json({"ok": True, "layout": layout})

        if self.path.startswith("/api/layout/presets"):
            presets = load_presets()
            return self._send_json({"presets": presets})

        self.send_error(404)

    def _handle_api_post(self):
        global telemetry_worker, telemetry_status, heartbeat_worker
        if self.path.startswith("/api/onboarding_seen"):
            state = load_state()
            state["onboarding_seen"] = True
            save_state(state)
            return self._send_json({"ok": True})

        if self.path.startswith("/api/flash/upload"):
            try:
                content_type = (self.headers.get("Content-Type", "") or "").lower()
                content_len = int(self.headers.get("Content-Length", "0") or "0")
                if content_len <= 0:
                    return self._send_json({"ok": False, "error": "No file data provided"}, 400)
                if content_len > 10 * 1024 * 1024:
                    return self._send_json({"ok": False, "error": "File too large (>10MB)"}, 413)

                file_data = b""
                filename = "firmware.bin"

                if "application/octet-stream" in content_type:
                    query = urllib.parse.urlparse(self.path).query
                    params = urllib.parse.parse_qs(query)
                    if "filename" in params and params["filename"]:
                        filename = params["filename"][0] or filename
                    file_data = self.rfile.read(content_len)
                else:
                    data = self._read_json()
                    if not data or "data" not in data:
                        return self._send_json({"ok": False, "error": "No file data provided"}, 400)
                    import base64
                    try:
                        file_data = base64.b64decode(data["data"])
                    except Exception as b64_err:
                        return self._send_json({"ok": False, "error": f"Invalid base64: {str(b64_err)}"}, 400)
                    filename = data.get("filename", filename)

                if not file_data:
                    return self._send_json({"ok": False, "error": "Empty file"}, 400)

                suffix = os.path.splitext(filename)[1] or ".bin"
                fd, path = tempfile.mkstemp(prefix="wheel_", suffix=suffix)
                
                try:
                    with os.fdopen(fd, "wb") as f:
                        f.write(file_data)
                except Exception as write_err:
                    try:
                        os.unlink(path)
                    except:
                        pass
                    return self._send_json({"ok": False, "error": f"Failed to write file: {str(write_err)}"}, 500)
                
                return self._send_json({"ok": True, "path": path})
            except Exception as e:
                if DEBUG_VERBOSE:
                    print(f"Upload error: {e}")
                    import traceback
                    traceback.print_exc()
                return self._send_json({"ok": False, "error": f"Upload failed: {str(e)}"}, 500)

        if self.path.startswith("/api/flash/start"):
            data = self._read_json()
            port = data.get("port", "")
            baud = int(data.get("baud", DEFAULT_FLASH_BAUD))
            chip = data.get("chip", DEFAULT_CHIP)
            bin_path = data.get("path", "")
            
            if not port:
                return self._send_json({"ok": False, "error": "No COM port selected"}, 400)
            if not bin_path:
                return self._send_json({"ok": False, "error": "No firmware file provided"}, 400)
            if not os.path.exists(bin_path):
                return self._send_json({"ok": False, "error": f"Firmware file not found: {bin_path}"}, 400)

            global flash_seq
            with flash_lock:
                flash_seq += 1
                job_id = f"job_{flash_seq}"
                flash_jobs[job_id] = FlashJob()

            worker = FlashRunner(job_id, chip, port, baud, bin_path)
            worker.start()
            return self._send_json({"ok": True, "job": job_id})

        if self.path.startswith("/api/wifi/send"):
            if not SERIAL_AVAILABLE:
                return self._send_json({"ok": False, "error": "pyserial not installed"}, 500)
            data = self._read_json()
            port = data.get("port", "")
            baud = int(data.get("baud", DEFAULT_BAUD))
            ssid = data.get("ssid", "")
            pwd = data.get("password", "")
            if not port or not ssid:
                return self._send_json({"ok": False, "error": "Missing port or SSID"}, 400)
            payload = f"{ssid},{pwd}\n"

            with flash_lock:
                flashing = any(not j.done for j in flash_jobs.values())
            if flashing:
                return self._send_json({"ok": False, "error": "Flash still running. Wait for flash to finish first."}, 409)

            last_err = None
            for attempt in range(3):
                try:
                    with serial.Serial(port, baud, timeout=2, write_timeout=2) as ser:
                        try:
                            ser.dtr = False
                            ser.rts = False
                        except Exception:
                            pass

                        if attempt == 0:
                            time.sleep(1.2)
                        else:
                            time.sleep(0.35)

                        try:
                            ser.reset_input_buffer()
                            ser.reset_output_buffer()
                        except Exception:
                            pass

                        raw = payload.encode("utf-8")
                        ser.write(raw)
                        ser.flush()
                        time.sleep(0.2)
                        ser.write(raw)
                        ser.flush()
                        time.sleep(0.2)
                    return self._send_json({"ok": True})
                except Exception as e:
                    last_err = e
                    time.sleep(0.35)

            msg = str(last_err) if last_err else "Unknown serial error"
            lower = msg.lower()
            if "permission" in lower or "access is denied" in lower or "writefile failed" in lower:
                msg = (
                    "COM port is busy or wrong interface selected. Close Serial Monitor/other apps, "
                    "pick the USB Serial port (not JTAG), unplug/replug the board, then retry. "
                    f"Raw error: {last_err}"
                )
            elif "does not recognize the command" in lower or "device does not understand the command" in lower:
                msg = (
                    "Windows rejected write on this COM interface. Select the USB Serial port (not JTAG) and retry. "
                    f"Raw error: {last_err}"
                )
            return self._send_json({"ok": False, "error": msg}, 500)

        if self.path.startswith("/api/telemetry/start"):
            data = self._read_json()
            ip = data.get("ip", DEFAULT_IP)
            port = int(data.get("port", DEFAULT_PORT))
            Tire_live = bool(data.get("Tire_live", False))
            if telemetry_worker and telemetry_worker.is_alive():
                return self._send_json({"ok": True, "status": "running"})
            telemetry_worker = TelemetrySender(ip, port, Tire_live, telemetry_queue)
            telemetry_worker.start()
            telemetry_status = "Starting"
            if heartbeat_worker and heartbeat_worker.is_alive():
                heartbeat_worker.stop()
            reset_heartbeat_state()
            heartbeat_worker = HeartbeatSender(ip, port)
            heartbeat_worker.start()
            state = load_state()
            state["telemetry_ip"] = ip
            state["telemetry_port"] = port
            state["telemetry_running"] = True
            save_state(state)
            return self._send_json({"ok": True})

        if self.path.startswith("/api/telemetry/stop"):
            if telemetry_worker:
                telemetry_worker.stop()
                telemetry_worker = None
            telemetry_status = "Stopped"
            if heartbeat_worker:
                heartbeat_worker.stop()
                heartbeat_worker = None
            reset_heartbeat_state()
            state = load_state()
            state["telemetry_running"] = False
            save_state(state)
            return self._send_json({"ok": True})

        if self.path.startswith("/api/layout/presets/delete"):
            data = self._read_json()
            name = data.get("name", "")
            if not name:
                return self._send_json({"ok": False, "error": "Missing name"}, 400)
            presets = load_presets()
            presets = [p for p in presets if p.get("name") != name]
            save_presets(presets)
            return self._send_json({"ok": True})

        if self.path.startswith("/api/layout/presets/save"):
            data = self._read_json()
            name = data.get("name", "")
            if not name:
                return self._send_json({"ok": False, "error": "Missing name"}, 400)
            presets = load_presets()
            presets = [p for p in presets if p.get("name") != name]
            presets.append(data)
            save_presets(presets)
            return self._send_json({"ok": True})

        if self.path.startswith("/api/layout/send"):
            data = self._read_json()
            ip = data.get("ip", DEFAULT_IP)
            port = int(data.get("port", DEFAULT_PORT))
            layout = data.get("layout", {})
            ok = send_layout(ip, port, layout)
            if ok:
                state = load_state()
                state["current_layout"] = layout
                save_state(state)
                return self._send_json({"ok": True})
            else:
                return self._send_json({"ok": False, "error": "UDP send failed"}, 500)

        self.send_error(404)

class WindowApi:
    def __init__(self):
        self.maximized = False

    def minimize(self):
        import webview
        if webview.windows:
            webview.windows[0].minimize()

    def toggle_maximize(self):
        import webview
        if not webview.windows:
            return
        window = webview.windows[0]
        if self.maximized:
            window.restore()
        else:
            window.maximize()
        self.maximized = not self.maximized

    def close(self):
        import webview
        if webview.windows:
            webview.windows[0].destroy()

# This definition deserves to be at the bottom (most because everything would break)
def run_server():
    os.makedirs(DATA_DIR, exist_ok=True)
    thread = threading.Thread(target=telemetry_sender, daemon=True)
    thread.start()

    url = f"http://127.0.0.1:{SERVER_PORT}/"
    httpd = ThreadingHTTPServer(("127.0.0.1", SERVER_PORT), CompanionServer)
    httpd.allow_reuse_address = True
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    print(f"Serving on {url}")

    try:
        import webview
        api = WindowApi()
        webview.create_window(
            "ScreenX - Companion",
            url,
            width=1200,
            height=800,
            frameless=True,
            easy_drag=True,
            js_api=api,
        )
        icon_path = os.path.join(RESOURCE_DIR, "logo.ico")
        # I cant get this icon to work for the life of me dude
        # Only people who run from source will even notice, its a feature not a bug, its for debugging!
        webview.start(icon=icon_path)
        httpd.shutdown()
        return
    
    except Exception as e:
        print(f"Error starting webview, falling back to browser: {e}")
        webbrowser.open(url)
        print("This can be because pywebview is not installed or failed to start. Please install pywebview for the best experience.")
        print("pip install pywebview") # Non issue for compiled app, if youre running from source check this
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            httpd.shutdown()


if __name__ == "__main__":
    run_server()
