const $ = (id) => document.getElementById(id);

const isNil = (val) => val === null || val === undefined;

const views = {
  onboarding: $("Onboarding"),
  flash: $("ViewFlash"),
  wifi: $("ViewWifi"),
  telemetry: $("ViewTelemetry"),
  customize: $("ViewCustomize"),
};
const NavOptions = document.querySelectorAll(".NavOption");

// Window controls
const windowMin = $("WindowMinButton");
const windowMax = $("WindowMaxButton");
const windowClose = $("WindowCloseButton");

function getWindowApi() {
  return window.pywebview && window.pywebview.api ? window.pywebview.api : null;
}

if (windowMin) {
  windowMin.addEventListener("click", () => {
    const api = getWindowApi();
    if (api && api.minimize) api.minimize();
  });
}

if (windowMax) {
  windowMax.addEventListener("click", () => {
    const api = getWindowApi();
    if (api && api.toggle_maximize) api.toggle_maximize();
  });
}

if (windowClose) {
  windowClose.addEventListener("click", () => {
    const api = getWindowApi();
    if (api && api.close) api.close();
    else window.close();
  });
}

const logBox = $("LogOutput");
const detectBtn = $("DetectButton");
const detectStatus = $("DetectStatus");
const continueFlash = $("ContinueFlash");
const continueWifi = $("ContinueWifi");
const backToConnect = $("BackToConnectButton");
const backToFlash = $("BackToFlashButton");
const flashBtn = $("FlashButton");
const flashStatus = $("FlashStatus");
const wifiSend = $("WifiSend");
const wifiStatus = $("WifiStatus");
const finishBtn = $("FinishOnboardingButton");
const clearLogBtn = $("ClearLogButton");
const firmwareFile = $("FirmwareFile");
const flashPort = $("FlashPort");
const flashBaud = $("FlashBaud");
const flashChip = $("FlashChip");
const wifiSsid = $("WifiSsid");
const wifiPass = $("WifiPassword");
const wifiPort = $("WifiPort");
const wifiBaud = $("WifiBaud");
const firmwareFile2 = $("FirmwareFileTwo");
const flashPort2 = $("FlashPortTwo");
const flashBaud2 = $("FlashBaudTwo");
const flashChip2 = $("FlashChipTwo");
const flashBtn2 = $("FlashButtonTwo");
const flashStatus2 = $("FlashStatusTwo");
const wifiSsid2 = $("WifiSsidTwo");
const wifiPass2 = $("WifiPasswordTwo");
const wifiPort2 = $("WifiPortTwo");
const wifiBaud2 = $("WifiBaudTwo");
const wifiSend2 = $("WifiSendTwo");
const wifiStatus2 = $("WifiStatusTwo");
const telemetryIp = $("TelemetryIp");
const telemetryPort = $("TelemetryPort");
const telemetryLive = $("telemetryLive");
const telemetryStart = $("TelemetryStartButton");
const telemetryStop = $("TelemetryStopButton");
const telemetryStatus = $("TelemetryStatus");
const deviceDisconnect = $("DeviceDisconnect");
const statGear = $("StatGear");
const statSpeed = $("StatSpeed");
const statRpm = $("StatRpm");
const statPit = $("StatPit");
const statAbs = $("StatAbs");
const statTc = $("StatTc");
const statDrs = $("StatDrs");
const statBoost = $("StatBoost");
const statAirTemp = $("StatAirTemp");
const statRoadTemp = $("StatRoadTemp");
const statBrakeTemp = $("StatBrakeTemp");
const statThrottle = $("StatThrottle");
const statBrake = $("StatBrake");
const statClutch = $("StatClutch");
const statFuel = $("StatFuel");
const barThrottle = $("BarThrottle");
const barBrake = $("BarBrake");
const barClutch = $("BarClutch");
const barFuel = $("BarFuel");
const refreshPorts1 = $("RefreshPortsOne");
const refreshPorts2 = $("RefreshPortsTwo");
const refreshPorts3 = $("RefreshPortsThree");
const flashProgress1 = $("FlashProgressOne");
const flashProgress2 = $("FlashProgressTwo");
const fileName1 = $("FileNameOne");
const fileName2 = $("FileNameTwo");
const dropZone1 = $("DropZoneOne");
const dropZone2 = $("DropZoneTwo");

let StepProgress = 0;
let flashJob  = "";
let flashJob2 = "";

// Manual port picker
const manualPickBtn = $("ManualButton");
const manualPortPanel = $("ManualPortPanel");
const manualPortSelect = $("ManualPortSelect");
const manualPortConfirm = $("ManualConfirm");

async function api(url, opts) {
  const options = opts || {};
  try {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok && !data.ok) {
      data.ok = false;
    }
    return data;
  } catch (e) {
    console.error("API error:", e);
    return { ok: false, error: e.message || "Network error" };
  }
}

function log(msg) {
  if (!logBox) return;
  const now = new Date();
  const ts = now.toLocaleTimeString();
  const line = `[${ts}]  ${msg}\n`;
  logBox.textContent += line;
  logBox.scrollTop = logBox.scrollHeight;
}

function Alert(message, type = "Info") {
  const container = $("Alerts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `Alert ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = "AlertOut 0.3s forwards";
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function SetNotif(el, text, state) {
  el.textContent = text;
  el.className = `StatusIcon ${state}`;
}

function showView(key) {
  const target = key;
  Object.entries(views).forEach(([name, el]) => {
    el.classList.toggle("Hidden", name !== target);
  });
  NavOptions.forEach((btn) => {
    btn.classList.toggle("Active", btn.dataset.view === target);
  });
  if (target === "onboarding") showStep(StepProgress);
}

NavOptions.forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showStep(index) {
  const steps = Array.from(document.querySelectorAll("#Onboarding .StepCard"));
  steps.forEach((el) => {
    el.classList.toggle("Hidden", Number(el.dataset.step) !== index);
  });
  StepProgress = index;

  document.querySelectorAll(".StepsStep").forEach((el) => {
    const i = Number(el.dataset.stepIndicator);
    el.classList.remove("Active", "Done");
    if (i < index) el.classList.add("Done");
    else if (i === index) el.classList.add("Active");
  });

  document.querySelectorAll(".StepsLine").forEach((line, i) => {
    line.classList.toggle("filled", i < index);
  });
}

//Ports
async function refreshPorts() {
  const data = await api("/api/ports");
  const ports = data.ports || [];
  const portList = ports.slice();
  [flashPort, flashPort2, wifiPort, wifiPort2].forEach((sel) => {
    if (!sel) return;
    sel.innerHTML = "";
    portList.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
  });
}

// Ports but manual
async function loadPortsDetailed() {
  const data = await api("/api/ports");
  const details = data.details || [];
  if (!manualPortSelect) return details;
  manualPortSelect.innerHTML = "";
  details.forEach((p) => { const opt = document.createElement("option");
    opt.value = p.device;  opt.textContent = `${p.device}  —  ${p.description || "Unknown device"}`;
    manualPortSelect.appendChild(opt); });
  return details;
}

if (manualPickBtn) {
  manualPickBtn.addEventListener("click", async () => {
    manualPortPanel.classList.toggle("Hidden");
    const isOpen = !manualPortPanel.classList.contains("Hidden"); if (isOpen) {
      await loadPortsDetailed(); }
  });
}

if (manualPortConfirm) {
  manualPortConfirm.addEventListener("click", () => {
    const port = manualPortSelect.value;
    if (!port) {
      Alert("No port selected", "Error");
      return;
    }
    // Ports but multiple
    const allSelects = [flashPort, wifiPort, flashPort2, wifiPort2];
    allSelects.forEach((sel) => {
      if (!sel) return;
      let found = false;
      for (const o of sel.options) { if (o.value === port) { found = true; break; }  }
      if (!found) {
        const opt = document.createElement("option");
        opt.value = port; opt.textContent = port;
        sel.appendChild(opt);
      }
      sel.value = port;
    });
    SetNotif(detectStatus, `Using ${port}`, "Ok");
    continueFlash.disabled = false;
    log(`Manually selected port: ${port}`);
    Alert(`Port set to ${port}`, "Success");
  });
}

// Autodetect 
async function autodetect() {
  SetNotif(detectStatus, "Detecting...", "Busy");
  try {
    const data = await api("/api/autodetect");
    if (!isNil(data.port)) {
      SetNotif(detectStatus, `Found ${data.port}`, "Ok");
      continueFlash.disabled = false;
      log(`Device detected on ${data.port}`);
      Alert(`Device found on ${data.port}`, "Success");
      const portSelects = [flashPort, wifiPort, flashPort2, wifiPort2];
      portSelects.forEach((sel) => {
        if (sel && !sel.value) sel.value = data.port;
      });
    } else {
      SetNotif(detectStatus, "Not found", "Error");
      continueFlash.disabled = true;
      log("No XIAO ESP32 detected");
      Alert("No device detected. Check USB connection.", "Error");
    }
  } catch (e) {
    SetNotif(detectStatus, "Error", "Error");
    Alert("Detection failed: " + e.message, "Error");
  }
}

// Flash 
async function uploadFirmware(file) {
  const q = encodeURIComponent(file.name || "firmware.bin");
  const res = await api(`/api/flash/upload?filename=${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(res.error || "Upload failed");
  return res.path;
}

async function startFlash(fileInput, portSel, baudInput, chipSel, statusEl, progressEl, jobSetter) {
  const file = fileInput.files[0];
  if (!file) {
    SetNotif(statusEl, "No file selected", "Error");
    Alert("Please select a .bin file first", "Error");
    return;
  }

  SetNotif(statusEl, "Uploading...", "Busy");
  progressEl.classList.remove("Hidden");

  try {
    const path = await uploadFirmware(file);
    SetNotif(statusEl, "Flashing...", "Busy");
    log("Firmware uploaded, starting flash...");

    const payload = {
      port: portSel.value,
      baud: baudInput.value,
      chip: chipSel.value,
      path,
    };

    const res = await api("/api/flash/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      SetNotif(statusEl, res.error || "Flash error", "Error");
      progressEl.classList.add("Hidden");
      Alert("Flash failed: " + (res.error || "Unknown"), "Error");
      return;
    }

    const jobId = res.job;
    jobSetter(jobId);
    pollFlash(jobId, statusEl, progressEl);
    if (statusEl === flashStatus) continueWifi.disabled = true;
  } catch (e) {
    SetNotif(statusEl, "Error", "Error");
    progressEl.classList.add("Hidden");
    Alert("Flash error: " + e.message, "Error");
  }
}

async function pollFlash(job, statusEl, progressEl) {
  if (!job) return;
  try {
    const res = await api(`/api/flash/status?job=${job}`);
    const lines = res.lines || [];
    lines.slice(-4).forEach((line) => log(line));
    if (res.done) {
      progressEl.classList.add("Hidden");
      if (res.ok) {
        SetNotif(statusEl, "Complete", "Ok");
        Alert("Firmware flashed successfully!", "Success");
        if (statusEl === flashStatus) continueWifi.disabled = false;
      } else {
        SetNotif(statusEl, "Failed", "Error");
        Alert("Flash failed. Check log for details.", "Error");
      }
      return;
    }
    setTimeout(() => pollFlash(job, statusEl, progressEl), 800);
  } catch {
    setTimeout(() => pollFlash(job, statusEl, progressEl), 1200);
  }
}

// WiFi
async function sendWifi(portSel, baudInput, ssidInput, passInput, statusEl) {
  const ssidValue = ssidInput.value;
  if (!ssidValue.trim()) {
    SetNotif(statusEl, "SSID required", "Error");
    Alert("Please enter a network name", "Error");
    return;
  }

  SetNotif(statusEl, "Sending...", "Busy");
  try {
    const payload = {
      port: portSel.value,
      baud: baudInput.value,
      ssid: ssidValue,
      password: passInput.value,
    };
    const res = await api("/api/wifi/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      SetNotif(statusEl, "Sent", "Ok");
      log("WiFi credentials sent successfully");
      Alert("WiFi credentials sent!", "Success");
    } else {
      SetNotif(statusEl, res.error || "Failed", "Error");
      Alert("Send failed: " + (res.error || "Unknown"), "Error");
    }
  } catch (e) {
    SetNotif(statusEl, "Error", "Error");
    Alert("Send error: " + e.message, "Error");
  }
}

async function startTelemetry() {
  const payload = {
    ip: telemetryIp.value,
    port: telemetryPort.value,
    Tire_live: telemetryLive ? telemetryLive.checked : false,
  };

  // Oled preview updating
  if (typeof oledPreview !== 'undefined' && oledPreview) {
    oledPreview.update({
      telemetryRunning: true,
      firstPacketReceived: false,
      heartbeatLost: false,
      ip: telemetryIp.value,
    });
  }
  await api("/api/telemetry/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  SetNotif(telemetryStatus, "Running", "Ok");
  Alert("Telemetry started", "Success");
}

async function stopTelemetry() {
  await api("/api/telemetry/stop", { method: "POST" });
  SetNotif(telemetryStatus, "Stopped", "Idle");
  Alert("Telemetry stopped");
  if (typeof oledPreview !== 'undefined' && oledPreview) {
    oledPreview.update({
      telemetryRunning: false,
      firstPacketReceived: false,
      heartbeatLost: false,
    });
  }
}

function TireClass(pct) {
  if (pct >= 70) return "Good";
  if (pct >= 40) return "Warn";
  return "Bad";
}

async function pollTelemetry() {
  try {
    const res = await api("/api/telemetry/status");
    if (res.status === "running") {
      SetNotif(telemetryStatus, "Running", "Ok");
    }
    if (res.last) {
      const d = res.last;
      // Check if AC is running
      if (d.ac_running === false) {
        if (typeof oledPreview !== 'undefined' && oledPreview) {
          oledPreview.update({
            acRunning: false,
            telemetryRunning: true,
          });
        }
      } else {
        statGear.textContent = d.gear;
        statPit.textContent = d.pit  ? "ON" : "OFF";
        statAbs.textContent = d.abs  ? "ON" : "OFF";
        statTc.textContent = d.tc   ? "ON" : "OFF";

        // New telemetry woooooooo
        if (statSpeed) statSpeed.textContent = d.speed != null ? Math.round(d.speed) : "0";
        if (statRpm) statRpm.textContent = d.rpm != null ? d.rpm : "0";
        if (statDrs) statDrs.textContent = d.drs ? "ON" : "OFF";
        if (statBoost) statBoost.textContent = d.boost != null ? d.boost.toFixed(2) : "0.00";
        if (statAirTemp) statAirTemp.textContent = d.air_temp != null ? Math.round(d.air_temp) : "0";
        if (statRoadTemp) statRoadTemp.textContent = d.road_temp != null ? Math.round(d.road_temp) : "0";
        if (statBrakeTemp) statBrakeTemp.textContent = d.brake_temp != null ? Math.round(d.brake_temp) : "0";

        const thr = d.throttle != null ? d.throttle : 0;
        const brk = d.brake != null ? d.brake : 0;
        const clt = d.clutch != null ? d.clutch : 0;
        const fuel = d.fuel != null ? d.fuel : 0;
        if (statThrottle) statThrottle.textContent = thr + "%";
        if (barThrottle) barThrottle.style.width = thr + "%";
        if (statBrake) statBrake.textContent = brk + "%";
        if (barBrake) barBrake.style.width = brk + "%";
        if (statClutch) statClutch.textContent = clt + "%";
        if (barClutch) barClutch.style.width = clt + "%";
        if (statFuel) statFuel.textContent = fuel.toFixed(1) + " L";
        if (barFuel) barFuel.style.width = Math.min(100, fuel) + "L";

        const indPit = $("IndPit");
        const indAbs = $("IndAbs");
        const indTc = $("IndTc");
        const indDrs = $("IndDrs");
        if (indPit) { indPit.className = `DashDot ${d.pit ? "Warn" : ""}`; }
        if (indAbs) { indAbs.className = `DashDot ${d.abs ? "On" : ""}`; }
        if (indTc)  { indTc.className = `DashDot ${d.tc  ? "On" : ""}`; }
        if (indDrs) { indDrs.className = `DashDot ${d.drs ? "On" : ""}`; }

        if (d.wear_pct) {
          const Tires = [
            { id: "TireFl", i: 0 },
            { id: "TireFr", i: 1 },
            { id: "TireRl", i: 2 },
            { id: "TireRr", i: 3 },
          ];
          Tires.forEach(({ id, i }) => {
            const el = $(id);
            if (!el) return;
            const pct = d.wear_pct[i];
            el.className = `Tire ${TireClass(pct)}`;
            el.querySelector(".TirePercent").textContent = pct.toFixed(1) + "%";
          });
        }

        if (typeof oledPreview !== 'undefined' && oledPreview) {
          oledPreview.update({
            gear: d.gear,
            pit: d.pit,
            abs: d.abs,
            tc: d.tc,
            rl: d.rl,
            p1: d.p1 || 0,
            p2: d.p2 || 0,
            TireLow: d.Tire_low || [0, 0, 0, 0],
            TireDisplayPct: d.Tire_display_pct || [100, 100, 100, 100],
            speed: d.speed || 0,
            rpm: d.rpm || 0,
            throttle: d.throttle || 0,
            brake: d.brake || 0,
            fuel: d.fuel || 0,
            boost: d.boost || 0,
            drs: d.drs || 0,
            clutch: d.clutch || 0,
            steer: d.steer || 0,
            airTemp: d.air_temp || 0,
            roadTemp: d.road_temp || 0,
            brakeTemp: d.brake_temp || 0,
            firstPacketReceived: true,
            telemetryRunning: true,
            acRunning: true,
          });
        }
      }
    }
  } catch {}
  setTimeout(pollTelemetry, 1000);
}

async function pollHeartbeat() {
  if (!deviceDisconnect) return;
  try {
    const res = await api("/api/heartbeat/status");
    const show = res.running && res.ever_seen && !res.connected;
    deviceDisconnect.classList.toggle("Hidden", !show);

    if (typeof oledPreview !== 'undefined' && oledPreview) {
      oledPreview.update({
        heartbeatLost: show,
        telemetryRunning: res.running,
      });
    }
  } catch {
    deviceDisconnect.classList.add("Hidden");
  }
  setTimeout(pollHeartbeat, 1000);
}

// File zones
function setupDrop(zone, fileInput, nameEl) {
  if (!zone || !fileInput) return;

  zone.addEventListener("click", () => fileInput.click());
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("DragOver");
  });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("DragOver");
  });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("DragOver");
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      nameEl.textContent = e.dataTransfer.files[0].name;
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) {
      nameEl.textContent = fileInput.files[0].name;
    }
  });
}

setupDrop(dropZone1, firmwareFile, fileName1);
setupDrop(dropZone2, firmwareFile2, fileName2);

// Make wifi password visible
document.querySelectorAll(".PasswordEye").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $(btn.dataset.target);
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.style.color = show ? "var(--Accent)" : "";
  });
});

if (detectBtn) detectBtn.addEventListener("click", autodetect);
if (continueFlash) continueFlash.addEventListener("click", () => showStep(1));
if (continueWifi) continueWifi.addEventListener("click", () => showStep(2));
if (backToConnect) backToConnect.addEventListener("click", () => showStep(0));
if (backToFlash) backToFlash.addEventListener("click", () => showStep(1));

if (flashBtn) flashBtn.addEventListener("click", () =>
  startFlash(firmwareFile, flashPort, flashBaud, flashChip, flashStatus, flashProgress1, (j) => flashJob = j));
if (flashBtn2) flashBtn2.addEventListener("click", () =>
  startFlash(firmwareFile2, flashPort2, flashBaud2, flashChip2, flashStatus2, flashProgress2, (j) => flashJob2 = j));

if (wifiSend) wifiSend.addEventListener("click", () => sendWifi(wifiPort, wifiBaud, wifiSsid, wifiPass, wifiStatus));
if (wifiSend2) wifiSend2.addEventListener("click", () => sendWifi(wifiPort2, wifiBaud2, wifiSsid2, wifiPass2, wifiStatus2));

if (refreshPorts1) refreshPorts1.addEventListener("click", refreshPorts);
if (refreshPorts2) refreshPorts2.addEventListener("click", refreshPorts);
if (refreshPorts3) refreshPorts3.addEventListener("click", refreshPorts);

if (finishBtn) finishBtn.addEventListener("click", async () => {
  await api("/api/onboarding_seen", { method: "POST" });
  Alert("Setup complete! Switching to Dashboard.", "Success");
  setTimeout(() => showView("telemetry"), 600);
});

if (clearLogBtn) clearLogBtn.addEventListener("click", () => { logBox.textContent = ""; });
telemetryStart.addEventListener("click", startTelemetry);
telemetryStop.addEventListener("click", stopTelemetry);

// OLED Preview again
let oledPreview = null;
if (typeof OLEDPreview !== 'undefined') {
  oledPreview = new OLEDPreview('OledCanvas');
}


let layoutPreview = null;
if (typeof LayoutPreview !== 'undefined') {
  layoutPreview = new LayoutPreview('LayoutCanvas');
}

function populateZoneSelects() {
  if (typeof LAYOUT_WIDGETS === 'undefined') return;
  const selects = document.querySelectorAll('.ZoneSelect');
  selects.forEach(sel => {
    sel.innerHTML = '';
    Object.entries(LAYOUT_WIDGETS).forEach(([key, w]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = w.label;
      sel.appendChild(opt);
    });
  });
}

function readLayoutFromUI() {
  return {
    left: {
      primary: $("LeftZonePrimary") ? $("LeftZonePrimary").value : 'none',
      secondary: $("LeftZoneSecondary") ? $("LeftZoneSecondary").value : 'none',
    },
    middle: {
      primary: $("MidZonePrimary") ? $("MidZonePrimary").value : 'none',
      secondary: $("MidZoneSecondary")  ? $("MidZoneSecondary").value  : 'none',
    },
    right: {
      primary: $("RightZonePrimary") ? $("RightZonePrimary").value : 'none',
      secondary: $("RightZoneSecondary") ? $("RightZoneSecondary").value : 'none',
    },
  };
}

function applyLayoutToUI(layout) {
  if ($("LeftZonePrimary")) $("LeftZonePrimary").value   = layout.left.primary   || 'none';
  if ($("LeftZoneSecondary")) $("LeftZoneSecondary").value = layout.left.secondary || 'none';
  if ($("MidZonePrimary")) $("MidZonePrimary").value    = layout.middle.primary   || 'none';
  if ($("MidZoneSecondary")) $("MidZoneSecondary").value  = layout.middle.secondary || 'none';
  if ($("RightZonePrimary")) $("RightZonePrimary").value  = layout.right.primary   || 'none';
  if ($("RightZoneSecondary")) $("RightZoneSecondary").value = layout.right.secondary || 'none';
  onZoneChange();
}

function updateDashboardVisibility() {
  const layout = readLayoutFromUI();
  const active = new Set();
  for (const zone of Object.values(layout)) {
    if (zone.primary && zone.primary !== 'none') active.add(zone.primary);
    if (zone.secondary && zone.secondary !== 'none') active.add(zone.secondary);
  }
  document.querySelectorAll('.DashCard[data-widget]').forEach(card => {
    const w = card.dataset.widget;
    card.classList.toggle('DashHidden', !active.has(w));
  });
}

function onZoneChange() {
  if (!layoutPreview) return;
  const layout = readLayoutFromUI();
  layoutPreview.setLayout(layout);
  if (oledPreview) oledPreview.setLayout(layout);
  updateDashboardVisibility();
}

document.querySelectorAll('.ZoneSelect').forEach(sel => {
  sel.addEventListener('change', onZoneChange);
});

async function loadPresetList() {
  const selectEl = $("PresetSelect");
  if (!selectEl) return;
  try {
    const res = await api('/api/layout/presets');
    const presets = res.presets || [];
    selectEl.innerHTML = '';
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      selectEl.appendChild(opt);
    });
  } catch {}
}

async function savePreset() {
  const nameInput = $("PresetName");
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) { Alert('Enter a preset name', 'Error'); return; }
  const layout = readLayoutFromUI();
  layout.name = name;
  try {
    await api('/api/layout/presets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    });
    Alert(`Preset "${name}" saved`, 'Success');
    nameInput.value = '';
    await loadPresetList();
  } catch (e) {
    Alert('Save failed: ' + e.message, 'Error');
  }
}

async function loadPreset() {
  const selectEl = $("PresetSelect");
  if (!selectEl || !selectEl.value) { Alert('Select a preset first', 'Error'); return; }
  try {
    const res = await api('/api/layout/presets');
    const presets = res.presets || [];
    const preset = presets.find(p => p.name === selectEl.value);
    if (preset) {
      applyLayoutToUI(preset);
      Alert(`Loaded "${preset.name}"`, 'Success');
    } else {
      Alert('Preset not found', 'Error');
    }
  } catch (e) {
    Alert('Load failed: ' + e.message, 'Error');
  }
}

async function deletePreset() {
  const selectEl = $("PresetSelect");
  if (!selectEl || !selectEl.value) { Alert('Select a preset first', 'Error'); return; }
  try {
    await api('/api/layout/presets/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: selectEl.value }),
    });
    Alert(`Deleted "${selectEl.value}"`, 'Success');
    await loadPresetList();
  } catch (e) {
    Alert('Delete failed: ' + e.message, 'Error');
  }
}

async function sendLayoutToESP() {
  const statusEl = $("LayoutSendStatus");
  if (!layoutPreview) { Alert('Preview not loaded', 'Error'); return; }
  const layout = readLayoutFromUI();
  SetNotif(statusEl, 'Sending...', 'Busy');
  try {
    const res = await api('/api/layout/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: telemetryIp ? telemetryIp.value : '192.168.1.1',
        port: telemetryPort ? parseInt(telemetryPort.value) : 8888,
        layout: layout,
      }),
    });
    if (res.ok) {
      SetNotif(statusEl, 'Sent', 'Ok');
      Alert('Layout sent to ESP32', 'Success');
      if (oledPreview) oledPreview.setLayout(layout);
    } else {
      SetNotif(statusEl, res.error || 'Failed', 'Error');
      Alert('Send failed: ' + (res.error || 'Unknown'), 'Error');
    }
  } catch (e) {
    SetNotif(statusEl, 'Error', 'Error');
    Alert('Send error: ' + e.message, 'Error');
  }
}

if ($("PresetSave")) $("PresetSave").addEventListener('click', savePreset);
if ($("PresetLoad")) $("PresetLoad").addEventListener('click', loadPreset);
if ($("PresetDelete")) $("PresetDelete").addEventListener('click', deletePreset);
if ($("SendLayout")) $("SendLayout").addEventListener('click', sendLayoutToESP);

async function init() {
  await refreshPorts();

  try {
    const state = await api("/api/state");
    const path = window.location.pathname;

    if (state.telemetry_ip && telemetryIp)   telemetryIp.value   = state.telemetry_ip;
    if (state.telemetry_port && telemetryPort) telemetryPort.value = String(state.telemetry_port);

    if (path === "/onboarding") {
      showView("onboarding");
    } else if (state.onboarding_seen) {
      showView("telemetry");
    } else {
      showView("onboarding");
    }

    if (state.telemetry_running && state.telemetry_ip) {
      startTelemetry();
    }
  } catch {
    showView("onboarding");
  }

  pollTelemetry();
  pollHeartbeat();

  populateZoneSelects();
  let restoredLayout = null;
  try {
    const saved = await api('/api/layout/current');
    if (saved.ok && saved.layout) restoredLayout = saved.layout;
  } catch (e) {}
  const startLayout = restoredLayout || (typeof DEFAULT_LAYOUT !== 'undefined' ? DEFAULT_LAYOUT : null);
  if (startLayout) {
    applyLayoutToUI(startLayout);
    if (oledPreview) oledPreview.setLayout(JSON.parse(JSON.stringify(startLayout)));
  }
  loadPresetList();

  log("Companion ready");
}

init();

