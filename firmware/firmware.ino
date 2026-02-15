"""""""""""""""""""""""""""""""""
#################################

ScreenX ESP32 Firmware
Version 1.0.0

#################################
"""""""""""""""""""""""""""""""""


#include <WiFi.h>
#include <WiFiUdp.h>
#include <U8g2lib.h>
#include <SPI.h>
#include <Preferences.h>
#include <nvs_flash.h>
#include <ctype.h>
#include <string.h>

// GPIO pins - Change these if you wire it differently
#define OLED_CS D3
#define OLED_DC D6
#define OLED_RST D2
#define OLED_SCK D8
#define OLED_MOSI D10

U8G2_SH1122_256X64_F_4W_HW_SPI u8g2(U8G2_R0, OLED_CS, OLED_DC, OLED_RST);

const char* PREFS_NS   = "wheel";
const char* PREF_SSID  = "ssid";
const char* PREF_PASS  = "pass";
const char* prefLayout = "layout"; 
Preferences prefs;

const uint8_t BOOT_PCT_BOOT = 5;
const uint8_t BOOT_PCT_WAIT_CRED = 30;
const uint8_t BOOT_PCT_WIFI_END = 90;
const uint8_t BOOT_PCT_FINAL = 100;

WiFiUDP udp;
const uint16_t localPort = 8888;
const uint32_t HB_TIMEOUT_MS = 3000;

enum Widget : uint8_t {
  W_NONE = 0,
  W_GEAR,
  W_SPEED,
  W_RPM,
  W_THROTTLE,
  W_BRAKE,
  W_FUEL,
  W_TireS,
  W_ABS_TC,
  W_PIT,
  W_BOOST,
  W_AIR_TEMP,
  W_ROAD_TEMP,
  W_DRS,
  W_CLUTCH,
  W_STEER,
  W_BRAKE_TEMP,
  W_COUNT
};

Widget widgetFromName(const char* name) {
  if (!name || !name[0]) return W_NONE;
  if (strcmp(name, "gear") == 0) return W_GEAR;
  if (strcmp(name, "speed") == 0) return W_SPEED;
  if (strcmp(name, "rpm") == 0) return W_RPM;
  if (strcmp(name, "throttle") == 0) return W_THROTTLE;
  if (strcmp(name, "brake") == 0) return W_BRAKE;
  if (strcmp(name, "fuel") == 0) return W_FUEL;
  if (strcmp(name, "Tires") == 0) return W_TireS;
  if (strcmp(name, "abs_tc") == 0) return W_ABS_TC;
  if (strcmp(name, "pit") == 0) return W_PIT;
  if (strcmp(name, "boost") == 0) return W_BOOST;
  if (strcmp(name, "air_temp") == 0) return W_AIR_TEMP;
  if (strcmp(name, "road_temp") == 0) return W_ROAD_TEMP;
  if (strcmp(name, "drs") == 0) return W_DRS;
  if (strcmp(name, "clutch") == 0) return W_CLUTCH;
  if (strcmp(name, "steer") == 0) return W_STEER;
  if (strcmp(name, "brake_temp") == 0) return W_BRAKE_TEMP;
  return W_NONE;
}

struct Zone {
  Widget primary;
  Widget secondary;
};

struct Layout {
  Zone left;
  Zone middle;
  Zone right;
};

// Default layout
Layout layout = {
  { W_TireS, W_ABS_TC },// left
  { W_GEAR, W_RPM },// middle
  { W_PIT, W_SPEED  },// right
};

void saveLayout();
void loadLayout();
void parseLayoutPacket(const char* pkt);
void parsePacket(const String& line);
void drawWidget(Widget wid, int x, int y, int w, int h, bool isPrimary);
void drawZone(const Zone& zone, int x, int y, int w, int h);
void drawScreen();

struct Telemetry {
  String gear = "N";
  float speed = 0;
  int rpm = 0;
  int throttle = 0;
  int brake = 0;
  float fuel = 0;
  bool pit = false;
  bool abs = false;
  bool tc = false;
  float boost = 0;
  int airTemp = 0;
  int roadTemp = 0;
  bool drs = false;
  int clutch = 0;
  float steer = 0;
  int brakeTemp = 0;
  bool TireLow[4] = {false, false, false, false};
  uint8_t TireDisplayPct[4] = {100, 100, 100, 100};
} telem;

bool firstPacketReceived = false;
bool bootFinished = false;
uint8_t bootProgress = 0;
bool heartbeatSeen = false;
uint32_t lastHeartbeatMs = 0;

void saveLayout() {
  // widget name lookup, could probably make this neater but whatever
  char buf[96];
  snprintf(buf, sizeof(buf), "%s,%s|%s,%s|%s,%s",
    widgetStr(layout.left.primary),   widgetStr(layout.left.secondary),
    widgetStr(layout.middle.primary), widgetStr(layout.middle.secondary),
    widgetStr(layout.right.primary),  widgetStr(layout.right.secondary));
  if (prefs.begin(PREFS_NS, false)) {
    prefs.putString(prefLayout, buf);
    prefs.end();
    Serial.printf("Layout saved: %s\n", buf);
  }
}

const char* widgetStr(Widget w) {
  switch (w) {
    case W_GEAR: return "gear";
    case W_SPEED: return "speed";
    case W_RPM: return "rpm";
    case W_THROTTLE: return "throttle";
    case W_BRAKE: return "brake";
    case W_FUEL: return "fuel";
    case W_TireS: return "tires";
    case W_ABS_TC: return "abs_tc";
    case W_PIT: return "pit";
    case W_BOOST: return "boost";
    case W_AIR_TEMP: return "air_temp";
    case W_ROAD_TEMP: return "road_temp";
    case W_DRS: return "drs";
    case W_CLUTCH: return "clutch";
    case W_STEER: return "steer";
    case W_BRAKE_TEMP: return "brake_temp";
    default: return "none";
  }
}

void loadLayout() {
  if (!prefs.begin(PREFS_NS, true)) return;
  String s = prefs.getString(prefLayout, "");
  prefs.end();
  if (s.length() == 0) return;
  char tmp[96];
  s.toCharArray(tmp, sizeof(tmp));
  char* zones[3];
  int zi = 0;
  char* tok = strtok(tmp, "|");
  while (tok && zi < 3) { zones[zi++] = tok; tok = strtok(NULL, "|"); }
  if (zi != 3) return;
  // parse each zone - primary,secondary format
  auto parseZone = [](char* z, Zone& out) {
    char* comma = strchr(z, ',');
    if (!comma) { out.primary = widgetFromName(z); out.secondary = W_NONE; return; }
    *comma = '\0';
    out.primary   = widgetFromName(z);
    out.secondary = widgetFromName(comma + 1);
  };

  parseZone(zones[0], layout.left);
  parseZone(zones[1], layout.middle);
  parseZone(zones[2], layout.right);
  Serial.printf("Layout loaded: %s\n", s.c_str());
}


// Layout packet format: "LAYOUT:gear,abs_tc|gear,rpm|pit,speed"
// (primary,secondary for each zone) (Also not that exact layout all the time obviously)
void parseLayoutPacket(const char* pkt) {
  const char* data = pkt + 7;
  char tmp[96];
  strncpy(tmp, data, sizeof(tmp) - 1);
  tmp[sizeof(tmp) - 1] = '\0';
  char* zones[3];
  int zi = 0;
  char* tok = strtok(tmp, "|");
  while (tok && zi < 3) { zones[zi++] = tok; tok = strtok(NULL, "|"); }
  if (zi != 3) return;
  auto parseZone = [](char* z, Zone& out) {
    char* comma = strchr(z, ',');
    if (!comma) { out.primary = widgetFromName(z); out.secondary = W_NONE; return; }
    *comma = '\0';
    out.primary   = widgetFromName(z);
    out.secondary = widgetFromName(comma + 1);
  };

  parseZone(zones[0], layout.left);
  parseZone(zones[1], layout.middle);
  parseZone(zones[2], layout.right);
  saveLayout();
}

String extractValue(const String& pkt, const char* key) {
  int idx = pkt.indexOf(key);
  if (idx < 0) return "";
  int start = idx + strlen(key);
  int end = pkt.indexOf('|', start);
  if (end < 0) end = pkt.length();
  return pkt.substring(start, end);
}

void parsePacket(const String& line) {
  String g = extractValue(line, "G:");
  if (g.length() > 0) telem.gear = g;

  telem.pit = extractValue(line, "PIT:").toInt() != 0;
  telem.abs = extractValue(line, "ABS:").toInt() != 0;
  telem.tc = extractValue(line, "TC:").toInt() != 0;
  String sp = extractValue(line, "SPD:");
  if (sp.length()) telem.speed = sp.toFloat();
  String rp = extractValue(line, "RPM:");
  if (rp.length()) telem.rpm = rp.toInt();
  String th = extractValue(line, "THR:");
  if (th.length()) telem.throttle = th.toInt();
  String br = extractValue(line, "BRK:");
  if (br.length()) telem.brake = br.toInt();
  String fu = extractValue(line, "FUEL:");
  if (fu.length()) telem.fuel = fu.toFloat();
  String bo = extractValue(line, "BST:");
  if (bo.length()) telem.boost = bo.toFloat();
  String at = extractValue(line, "ATMP:");
  if (at.length()) telem.airTemp = at.toInt();
  String rt = extractValue(line, "RTMP:");
  if (rt.length()) telem.roadTemp = rt.toInt();
  String dr = extractValue(line, "DRS:");
  if (dr.length()) telem.drs = dr.toInt() != 0;
  String cl = extractValue(line, "CLT:");
  if (cl.length()) {
    int rawClutch = constrain(cl.toInt(), 0, 100);
    telem.clutch = 100 - rawClutch;
  }
  String st = extractValue(line, "STR:");
  if (st.length()) telem.steer = st.toFloat();
  String bt = extractValue(line, "BTMP:");
  if (bt.length()) telem.brakeTemp = bt.toInt();
  
  telem.TireLow[0] = extractValue(line, "T0:").toInt() != 0;
  telem.TireLow[1] = extractValue(line, "T1:").toInt() != 0;
  telem.TireLow[2] = extractValue(line, "T2:").toInt() != 0;
  telem.TireLow[3] = extractValue(line, "T3:").toInt() != 0;
  
  heartbeatSeen = true;
  lastHeartbeatMs = millis();
  
  String w0 = extractValue(line, "W0:");
  String w1 = extractValue(line, "W1:");
  String w2 = extractValue(line, "W2:");
  String w3 = extractValue(line, "W3:");
  if (w0.length()) telem.TireDisplayPct[0] = constrain(w0.toInt(), 0, 100);
  if (w1.length()) telem.TireDisplayPct[1] = constrain(w1.toInt(), 0, 100);
  if (w2.length()) telem.TireDisplayPct[2] = constrain(w2.toInt(), 0, 100);
  if (w3.length()) telem.TireDisplayPct[3] = constrain(w3.toInt(), 0, 100);

  firstPacketReceived = true;
}

// Draw the widgets!!!
void drawTire(int x, int y, int w, int h, uint8_t pct) {
  u8g2.drawRFrame(x, y, w, h, 2);
  int ih = h - 4;
  int fillH = (ih * pct + 50) / 100;
  if (fillH > 0) {
    u8g2.drawBox(x + 2, y + 2 + ih - fillH, w - 4, fillH);
  }
}

void drawCenteredStr(const char* txt, int x, int y, int w) {
  int16_t tw = u8g2.getStrWidth(txt);
  u8g2.drawStr(x + (w - tw) / 2, y, txt);
}

void drawBar(int x, int y, int w, int h, int pct, const char* label) {
  const int barH = min(6, max(2, h - 14));
  u8g2.setFont(u8g2_font_5x7_tr);
  drawCenteredStr(label, x, y + 8, w);
  char buf[8];
  snprintf(buf, sizeof(buf), "%d%%", pct);
  u8g2.setFont(u8g2_font_6x12_tr);
  drawCenteredStr(buf, x, y + 20, w);
  int barW = w - 8;
  int barX = x + 4;
  int barY = y + h - barH - 2;
  u8g2.drawFrame(barX, barY, barW, barH);
  int fillW = (barW * pct) / 100;
  if (fillW > 0) u8g2.drawBox(barX, barY, fillW, barH);
}

// Smaller for if its in the secondary part (would clip otherwise)
void drawBarCompact(int x, int y, int w, int h, int pct, const char* label) {
  char buf[16];
  snprintf(buf, sizeof(buf), "%s %d%%", label, pct);
  u8g2.setFont(u8g2_font_5x7_tr);
  drawCenteredStr(buf, x, y + h / 2, w);
  int barH = min(3, h - 10);
  if (barH < 2) return;
  int barW = w - 6;
  int barX = x + 3;
  int barY = y + h / 2 + 3;
  u8g2.drawFrame(barX, barY, barW, barH);
  int fillW = (barW * pct) / 100;
  if (fillW > 0) u8g2.drawBox(barX, barY, fillW, barH);
}

void drawValueWidget(int x, int y, int w, int h, const char* value, const char* unit, bool isPrimary) {
  if (isPrimary) {
    u8g2.setFont(u8g2_font_logisoso16_tn);
    bool allDigits = true;
    for (const char* p = value; *p; p++) {
      if (*p < '0' || *p > '9') { allDigits = false; break; }
    }
    if (!allDigits) u8g2.setFont(u8g2_font_logisoso16_tf);
    drawCenteredStr(value, x, y + h / 2 + 4, w);
    u8g2.setFont(u8g2_font_5x7_tr);
    drawCenteredStr(unit, x, y + h / 2 + 14, w);
  } else {
    u8g2.setFont(u8g2_font_6x12_tr);
    char buf[24];
    snprintf(buf, sizeof(buf), "%s %s", value, unit);
    int16_t tw = u8g2.getStrWidth(buf);
    if (tw > w - 2) {
      drawCenteredStr(value, x, y + h / 2 + 4, w);
    } else {
      drawCenteredStr(buf, x, y + h / 2 + 4, w);
    }
  }
}

void drawWidget(Widget wid, int x, int y, int w, int h, bool isPrimary) {
  u8g2.setDrawColor(1);
  char buf[16];

  switch (wid) {
    case W_NONE:
      break;

    case W_GEAR: {
      bool isDigit = telem.gear.length() == 1 && telem.gear[0] >= '0' && telem.gear[0] <= '9';
      if (isPrimary) {
        if (isDigit) {
          if (h >= 46) u8g2.setFont(u8g2_font_logisoso46_tn);
          else if (h >= 38) u8g2.setFont(u8g2_font_logisoso38_tn);
          else if (h >= 32) u8g2.setFont(u8g2_font_logisoso32_tn);
          else if (h >= 24) u8g2.setFont(u8g2_font_logisoso24_tn);
          else              u8g2.setFont(u8g2_font_logisoso16_tn);
        } else {
          if (h >= 32) u8g2.setFont(u8g2_font_logisoso32_tf);
          else if (h >= 24) u8g2.setFont(u8g2_font_logisoso24_tf);
          else              u8g2.setFont(u8g2_font_logisoso16_tf);
        }
      } else {
        if (isDigit) u8g2.setFont(u8g2_font_logisoso16_tn);
        else         u8g2.setFont(u8g2_font_logisoso16_tf);
      }
      int16_t sw = u8g2.getStrWidth(telem.gear.c_str());
      int asc = u8g2.getAscent();
      int desc = u8g2.getDescent();
      int gh = asc - desc;
      int gx = x + (w - sw) / 2;
      int gy = y + (h - gh) / 2 + asc;
      if (gy - asc < y) gy = y + asc;
      if (gy - desc > y + h) {
        int candidate = y + h + desc;
        if (candidate - asc >= y) gy = candidate;
      }
      u8g2.drawStr(gx, gy, telem.gear.c_str());
      break;
    }

    case W_SPEED: {
      snprintf(buf, sizeof(buf), "%d", (int)telem.speed);
      drawValueWidget(x, y, w, h, buf, "km/h", isPrimary);
      break;
    }
    case W_RPM: {
      snprintf(buf, sizeof(buf), "%d", telem.rpm);
      drawValueWidget(x, y, w, h, buf, "RPM", isPrimary);
      break;
    }
    case W_THROTTLE: {
      if (isPrimary) drawBar(x, y, w, h, telem.throttle, "THR");
      else           drawBarCompact(x, y, w, h, telem.throttle, "THR");
      break;
    }
    case W_BRAKE: {
      if (isPrimary) drawBar(x, y, w, h, telem.brake, "BRK");
      else           drawBarCompact(x, y, w, h, telem.brake, "BRK");
      break;
    }
    case W_FUEL: {
      int pct = constrain((int)telem.fuel, 0, 100);
      if (isPrimary) drawBar(x, y, w, h, pct, "FUEL");
      else           drawBarCompact(x, y, w, h, pct, "FUEL");
      break;
    }
    case W_TireS: {
      int pad = 2;
      int gap = 3;
      int ah = h - (pad * 2);
      int aw = w - (pad * 2);
      int th = max(4, (ah - gap) / 2);
      int tw = min(12, (aw - gap) / 2);
      int totalW = (tw * 2) + gap;
      int totalH = (th * 2) + gap;
      int ox = x + ((w - totalW) / 2);
      int oy = y + ((h - totalH) / 2);
      
      drawTire(ox, oy, tw, th, telem.TireDisplayPct[0]);
      drawTire(ox + tw + gap, oy, tw, th, telem.TireDisplayPct[1]);
      drawTire(ox, oy + th + gap, tw, th, telem.TireDisplayPct[2]);
      drawTire(ox + tw + gap, oy + th + gap, tw, th, telem.TireDisplayPct[3]);
      break;
    }
    case W_ABS_TC: {
      u8g2.setFont(u8g2_font_6x12_tr);
      int cy = y + h / 2 + 4;
      int16_t absW = u8g2.getStrWidth("ABS");
      int16_t tcW  = u8g2.getStrWidth("TC");
      int gap = max(4, min(10, (w - absW - tcW - 4) / 1));
      int totalW = absW + gap + tcW;
      int sx = x + (w - totalW) / 2;
      if (telem.abs) {
        if ((millis() / 150) % 2 == 0) {
          u8g2.setDrawColor(15);
          u8g2.drawBox(sx - 2, cy - 10, absW + 4, 12);
          u8g2.setDrawColor(0);
          u8g2.drawStr(sx, cy, "ABS");
          u8g2.setDrawColor(1);
        } else {
          u8g2.setDrawColor(15);
          u8g2.drawStr(sx, cy, "ABS");
          u8g2.setDrawColor(1);
        }
      } else {
        u8g2.setDrawColor(3);
        u8g2.drawStr(sx, cy, "ABS");
        u8g2.setDrawColor(1);
      }
      int tcX = sx + absW + gap;
      if (telem.tc) {
        if ((millis() / 150) % 2 == 0) {
          u8g2.setDrawColor(15);
          u8g2.drawBox(tcX - 2, cy - 10, tcW + 4, 12);
          u8g2.setDrawColor(0);
          u8g2.drawStr(tcX, cy, "TC");
          u8g2.setDrawColor(1);
        } else {
          u8g2.setDrawColor(15);
          u8g2.drawStr(tcX, cy, "TC");
          u8g2.setDrawColor(1);
        }
      } else {
        u8g2.setDrawColor(3);
        u8g2.drawStr(tcX, cy, "TC");
        u8g2.setDrawColor(1);
      }
      break;
    }
    case W_PIT: {
      if (isPrimary) {
        u8g2.setFont(u8g2_font_logisoso16_tf);
        const char* s1 = "PIT";
        int16_t sw1 = u8g2.getStrWidth(s1);
        int asc = u8g2.getAscent();

        u8g2.setFont(u8g2_font_6x12_tr);
        const char* s2 = "LIMITER";
        int16_t sw2 = u8g2.getStrWidth(s2);

        int ty = y + h / 2 - 2;
        int by = ty + 14;

        if (telem.pit) {
          bool blink = (millis() / 150) % 2 == 0;
          if (blink) {
            u8g2.setFont(u8g2_font_logisoso16_tf);
            u8g2.setDrawColor(15);
            u8g2.drawBox(x + (w - sw1) / 2 - 3, ty - asc - 1, sw1 + 6, asc + 4);
            u8g2.setDrawColor(0);
            u8g2.drawStr(x + (w - sw1) / 2, ty, s1);
            u8g2.setFont(u8g2_font_6x12_tr);
            u8g2.setDrawColor(15);
            u8g2.drawBox(x + (w - sw2) / 2 - 2, by - 10, sw2 + 4, 12);
            u8g2.setDrawColor(0);
            u8g2.drawStr(x + (w - sw2) / 2, by, s2);
            u8g2.setDrawColor(1);
          } else {
            u8g2.setDrawColor(15);
            u8g2.setFont(u8g2_font_logisoso16_tf);
            u8g2.drawStr(x + (w - sw1) / 2, ty, s1);
            u8g2.setFont(u8g2_font_6x12_tr);
            u8g2.drawStr(x + (w - sw2) / 2, by, s2);
            u8g2.setDrawColor(1);
          }
        } else {
          u8g2.setDrawColor(3);
          u8g2.setFont(u8g2_font_logisoso16_tf);
          u8g2.drawStr(x + (w - sw1) / 2, ty, s1);
          u8g2.setFont(u8g2_font_6x12_tr);
          u8g2.drawStr(x + (w - sw2) / 2, by, s2);
          u8g2.setDrawColor(1);
        }
      } else {
        u8g2.setFont(u8g2_font_6x12_tr);
        const char* txt = "PIT";
        int16_t tw = u8g2.getStrWidth(txt);
        int py = y + h / 2 + 4;
        if (telem.pit) {
          bool inv = (millis() / 150) % 2 == 0;
          if (inv) {
            u8g2.setDrawColor(15);
            u8g2.drawBox(x + (w - tw) / 2 - 2, py - 10, tw + 4, 12);
            u8g2.setDrawColor(0);
            u8g2.drawStr(x + (w - tw) / 2, py, txt);
            u8g2.setDrawColor(1);
          } else {
            u8g2.setDrawColor(15);
            u8g2.drawStr(x + (w - tw) / 2, py, txt);
            u8g2.setDrawColor(1);
          }
        } else {
          u8g2.setDrawColor(3);
          u8g2.drawStr(x + (w - tw) / 2, py, txt);
          u8g2.setDrawColor(1);
        }
      }
      break;
    }

    case W_BOOST: {
      char v[8];
      snprintf(v, sizeof(v), "%.1f", telem.boost);
      drawValueWidget(x, y, w, h, v, "bar", isPrimary);
      break;
    }

    case W_AIR_TEMP: {
      snprintf(buf, sizeof(buf), "%dC", telem.airTemp);
      drawValueWidget(x, y, w, h, buf, "Air", isPrimary);
      break;
    }

    case W_ROAD_TEMP: {
      snprintf(buf, sizeof(buf), "%dC", telem.roadTemp);
      drawValueWidget(x, y, w, h, buf, "Road", isPrimary);
      break;
    }

    case W_DRS: {
      const char* txt = telem.drs ? "DRS ON" : "DRS OFF";
      if (isPrimary) u8g2.setFont(u8g2_font_logisoso16_tf);
      else           u8g2.setFont(u8g2_font_6x12_tr);
      drawCenteredStr(txt, x, y + h / 2 + (isPrimary ? 6 : 4), w);
      break;
    }

    case W_CLUTCH: {
      if (isPrimary) drawBar(x, y, w, h, telem.clutch, "CLT");
      else           drawBarCompact(x, y, w, h, telem.clutch, "CLT");
      break;
    }

    case W_STEER: {
      int pct = (int)(telem.steer * 100);
      snprintf(buf, sizeof(buf), "%d%%", pct);
      drawValueWidget(x, y, w, h, buf, "Steer", isPrimary);
      break;
    }

    case W_BRAKE_TEMP: {
      snprintf(buf, sizeof(buf), "%dC", telem.brakeTemp);
      drawValueWidget(x, y, w, h, buf, "BrkT", isPrimary);
      break;
    }

    default:
      break;
  }
}

// Draw zones on the display
void drawZone(const Zone& zone, int x, int y, int w, int h) {
  bool hasSecondary = zone.secondary != W_NONE;
  if (hasSecondary) {
    int splitY = 42;
    drawWidget(zone.primary,   x, y, w, splitY,     true);
    drawWidget(zone.secondary, x, y + splitY, w, h - splitY, false);
  } else {
    drawWidget(zone.primary, x, y, w, h, true);
  }
}

// End of the drawing

// Main draw function
void drawScreen() {
  if (!bootFinished) return;

  u8g2.clearBuffer();

  // Show IP on screen if no connection yet
  if (!firstPacketReceived) {
    u8g2.setFont(u8g2_font_logisoso32_tf);
    String ipStr = WiFi.localIP().toString();
    int16_t w = u8g2.getStrWidth(ipStr.c_str());
    u8g2.drawStr((256 - w) / 2, (64 + 32) / 2 - 5, ipStr.c_str());
    u8g2.sendBuffer();
    return;
  }

  // Show disconnected if theres no heartbeat for a while (only if connection before to stop it from showing on boot)
  bool heartbeatLost = firstPacketReceived && heartbeatSeen &&
                       (millis() - lastHeartbeatMs > HB_TIMEOUT_MS);
  if (heartbeatLost) {
    u8g2.setFont(u8g2_font_logisoso24_tf);
    const char* msg = "DISCONNECTED";
    int16_t w = u8g2.getStrWidth(msg);
    u8g2.drawStr((256 - w) / 2, (64 + 24) / 2, msg);
    u8g2.setFont(u8g2_font_6x12_tr);
    const char* sub = "Companion lost";
    int16_t w2 = u8g2.getStrWidth(sub);
    u8g2.drawStr((256 - w2) / 2, (64 + 24) / 2 + 16, sub);
    u8g2.sendBuffer();
    return;
  }

  drawZone(layout.left,   0,   0, 78, 64);
  drawZone(layout.middle, 79,  0, 99, 64);
  drawZone(layout.right,  178, 0, 78, 64);

  // Zone dividers
  for (int y = 0; y < 64; y += 5) {
    u8g2.drawPixel(78, y);
    u8g2.drawPixel(78, y + 1);
    u8g2.drawPixel(177, y);
    u8g2.drawPixel(177, y + 1);
  }

  u8g2.sendBuffer();
}

void drawBootStatus(const char* line1, const char* line2, uint8_t progressPct) {
  u8g2.clearBuffer();

  u8g2.setDrawColor(1);
  u8g2.setFont(u8g2_font_logisoso20_tf);
  const char* title = "ScreenX";
  int16_t titleW = u8g2.getStrWidth(title);
  int titleX = (256 - titleW) / 2;
  int titleY = 32;
  u8g2.drawStr(titleX, titleY, title);

  // Boot progress bar
  const int barX = 0;
  const int barY = 0;
  const int barW = 256;
  const int barH = 6;
  u8g2.drawFrame(barX, barY, barW, barH);
  int fillW = (barW - 2) * progressPct / 100;
  if (fillW < 0) fillW = 0;
  if (fillW > (barW - 2)) fillW = (barW - 2);
  u8g2.drawBox(barX + 1, barY + 1, fillW, barH - 2);

  u8g2.setFont(u8g2_font_6x12_tr);
  if (line1 && strlen(line1) > 0) {
    int16_t w1 = u8g2.getStrWidth(line1);
    int x1 = (256 - w1) / 2;
    u8g2.drawStr(x1, 54, line1);
  }
  if (line2 && strlen(line2) > 0) {
    int16_t w2 = u8g2.getStrWidth(line2);
    int x2 = (256 - w2) / 2;
    u8g2.drawStr(x2, 64, line2);
  }

  u8g2.sendBuffer();
}

bool readSerialLine(String& out) {
  static String buf;
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      out = buf;
      buf = "";
      return true;
    }
    if (buf.length() < 96) buf += c;
  }
  return false;
}

bool parseCreds(const String& line, String& ssid, String& pass) {
  int comma = line.indexOf(',');
  if (comma <= 0) return false;
  ssid = line.substring(0, comma);
  pass = line.substring(comma + 1);
  ssid.trim();
  pass.trim();
  return ssid.length() > 0;
}

bool loadCreds(String& ssid, String& pass) {
  if (!prefs.begin(PREFS_NS, true)) {
    Serial.println("Failed to read preferences.");
    return false;
  }
  ssid = prefs.getString(PREF_SSID, "");
  pass = prefs.getString(PREF_PASS, "");
  prefs.end();
  return ssid.length() > 0;
}

bool checkWifi(const String& ssid, const String& pass) {
  if (ssid.length() == 0) return false;
  if (ssid == "PLACEHOLDER") return false;
  if (pass == "PLACEHOLDER") return false;
  return true;
}

bool saveWifi(const String& ssid, const String& pass) {
  if (!prefs.begin(PREFS_NS, false)) {
    Serial.println("Prefs begin failed (write)");
    return false;
  }
  size_t ssidLen = prefs.putString(PREF_SSID, ssid);
  size_t passLen = prefs.putString(PREF_PASS, pass);
  prefs.end();

  String checkSsid;
  String checkPass;
  loadCreds(checkSsid, checkPass);
  bool ok = (ssidLen == ssid.length()) && (passLen == pass.length()) &&
            (checkSsid == ssid) && (checkPass == pass);

  Serial.print("Creds save ");
  Serial.println(ok ? "ok" : "failed");
  return ok;
}

bool WaitForWifiCreds(String& ssid, String& pass) {
  uint8_t dots = 0;
  while (true) {
    String line;
    if (readSerialLine(line) && parseCreds(line, ssid, pass)) return true;

    char anim[4] = {0};
    uint8_t count = dots % 4;
    for (uint8_t i = 0; i < count; i++) anim[i] = '.';
    anim[count] = '\0';
    drawBootStatus("Waiting for WiFi credentials", anim, BOOT_PCT_WAIT_CRED);
    dots++;
    delay(200);
  }
}

bool initNvs() {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    nvs_flash_erase();
    err = nvs_flash_init();
  }
  return err == ESP_OK;
}

// Boot + WiFi
void bootAndConnect() {
  bootProgress = BOOT_PCT_BOOT;
  drawBootStatus("Boot", "", bootProgress);
  delay(250);

  String ssid;
  String pass;
  if (!loadCreds(ssid, pass) || !checkWifi(ssid, pass)) {
    drawBootStatus("Waiting for WiFi credentials", "Send SSID,PASS", BOOT_PCT_WAIT_CRED);
    WaitForWifiCreds(ssid, pass);
    drawBootStatus("Saving creds", "", BOOT_PCT_WAIT_CRED);
    bool saved = saveWifi(ssid, pass);
    if (saved) {
      drawBootStatus("Saving creds", "Restarting", BOOT_PCT_WAIT_CRED);
      delay(800);
      ESP.restart();
    }
    drawBootStatus("Save failed", "Send SSID,PASS", BOOT_PCT_WAIT_CRED);
    delay(600);
  }

  drawBootStatus("Connecting to WiFi", "", bootProgress);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  int dotCount = 0;
  uint32_t wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    char dots[4] = {0};
    int count = dotCount % 4;
    for (int i = 0; i < count; i++) dots[i] = '.';
    dots[count] = '\0';

    uint32_t elapsed = millis() - wifiStart;
    const uint32_t WIFI_ANIM_MS = 8000;
    if (elapsed > WIFI_ANIM_MS) elapsed = WIFI_ANIM_MS;
    uint8_t wifiPct = BOOT_PCT_BOOT + (uint8_t)((BOOT_PCT_WIFI_END - BOOT_PCT_BOOT) * elapsed / WIFI_ANIM_MS);
    if (wifiPct < bootProgress) wifiPct = bootProgress;
    bootProgress = wifiPct;

    drawBootStatus("Connecting to WiFi", dots, wifiPct);
    dotCount++;
    delay(200);
  }

  bootProgress = BOOT_PCT_WIFI_END;
  String ipStr = WiFi.localIP().toString();
  drawBootStatus("WiFi connected", ipStr.c_str(), bootProgress);
  delay(500);

  bootProgress = BOOT_PCT_FINAL;
  drawBootStatus("Finished", "", BOOT_PCT_FINAL);
  delay(700);
}

// Setup
void setup() {
  Serial.begin(115200);

  SPI.begin(OLED_SCK, -1, OLED_MOSI);
  u8g2.begin();
  u8g2.setBusClock(10000000);
  WiFi.setSleep(false);

  if (!initNvs()) {
    drawBootStatus("NVS init failed", "Reflash or erase", BOOT_PCT_BOOT);
    Serial.println("NVS init failed");
    while (true) { delay(1000); }
  }

  bootAndConnect();
  loadLayout();
  bootFinished = true;

  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());

  udp.begin(localPort);
}

void loop() {
  if (!bootFinished) { delay(1); return; }

  // Get rid of packets we dont need because it just bogs it down
  while (true) {
    int packetSize = udp.parsePacket();
    if (!packetSize) break;

    char buf[512];
    int len = udp.read(buf, sizeof(buf) - 1);
    if (len <= 0) continue;
    buf[len] = '\0';

    String packet(buf);

    if (packet.startsWith("LAYOUT:")) {
      parseLayoutPacket(buf);
    } else if (packet.startsWith("HB")) {
      heartbeatSeen = true;
      lastHeartbeatMs = millis();
      udp.beginPacket(udp.remoteIP(), udp.remotePort());
      const uint8_t ack[] = {'H','B','_','A','C','K'};
      udp.write(ack, sizeof(ack));
      udp.endPacket();
    } else {
      parsePacket(packet);
    }
  }

  drawScreen();
  delay(1);
}
