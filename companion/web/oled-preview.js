const LAYOUT_WIDGETS = {
  none: { label: 'None', description: 'Empty' },
  gear: { label: 'Gear', description: 'Current gear indicator' },
  speed: { label: 'Speed (km/h)', description: 'Vehicle speed' },
  rpm: { label: 'RPM', description: 'Engine RPM' },
  throttle: { label: 'Throttle %', description: 'Gas pedal position' },
  brake: { label: 'Brake %', description: 'Brake pedal position' },
  fuel: { label: 'Fuel', description: 'Fuel level' },
  Tires: { label: 'Tire Bars', description: '4 Tire wear bars' },
  abs_tc: { label: 'ABS / TC', description: 'ABS and TC alerts' },
  pit: { label: 'Pit Limiter', description: 'Pit limiter alert' },
  boost: { label: 'Turbo Boost', description: 'Turbo boost pressure' },
  air_temp: { label: 'Air Temp', description: 'Ambient temperature' },
  road_temp: { label: 'Road Temp', description: 'Road temperature' },
  drs: { label: 'DRS', description: 'DRS status' },
  clutch: { label: 'Clutch %', description: 'Clutch position' },
  steer: { label: 'Steer Angle', description: 'Steering wheel angle' },
  brake_temp: { label: 'Brake Temp', description: 'Average brake temperature' },
};

const DEFAULT_LAYOUT = {
  name: 'Default',
  left: { primary: 'Tires', secondary: 'abs_tc' },
  middle: { primary: 'gear', secondary: 'rpm' },
  right: { primary: 'pit', secondary: 'speed' },
};


// You may be wondering, if the dashboard and customization screens are almost exactly the same why have them be 2 different classes?
// The reason is they used to be 2 different files and i dont want to merge them together completely
// "If its not broken dont fix it" - Albert Einstein (probably)

class LayoutPreview {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.ctx.imageSmoothingEnabled = true;

    this.W = 256;
    this.H = 64;
    this.SS = 1;
    this.minWidth = 320;
    this.maxWidth = 820;
    this.renderScale = 1;

    this._syncCanvasSize();

    this.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));

    this.demo = {
      gear: '3',
      speed: 142,
      rpm: 7250,
      throttle: 78,
      brake: 0,
      fuel: 64.2,
      pit: 0,
      abs: 0,
      tc: 0,
      boost: 1.2,
      air_temp: 24,
      road_temp: 32,
      drs: 0,
      clutch: 0,
      steer: -0.12,
      brake_temp: 420,
      TireDisplayPct: [85, 82, 70, 72],
      TireLow: [0, 0, 0, 0],
    };

    this._raf = null;
    this._t0  = performance.now();
    this._startLoop();

    this._resizeObserver = null;
    this._listenForResize();
  }

  setLayout(layout) {
    this.layout = layout;
  }

  _startLoop() {
    const tick = (ts) => {
      this._frame(ts);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _syncCanvasSize() {
    const bezel = this.canvas.closest('.OledBezel') || this.canvas.parentElement;
    const styles = bezel ? window.getComputedStyle(bezel) : null;
    const padX = styles ? (parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)) : 0;
    const maxW = bezel ? Math.max(1, bezel.clientWidth - padX) : this.maxWidth;
    const cssW = Math.max(this.minWidth, Math.min(this.maxWidth, maxW));
    const cssH = Math.round(cssW * (this.H / this.W));
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.renderScale = (cssW * dpr) / this.W;
  }

  _listenForResize() {
    const bezel = this.canvas.closest('.OledBezel') || this.canvas.parentElement;
    if (!bezel) return;

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
      });
      this._resizeObserver.observe(bezel);
      return;
    }

    window.addEventListener('resize', () => this._syncCanvasSize());
  }



  _frame(ts) {
    const ms  = ts - this._t0;
    const S   = this.SS;
    const ctx = this.ctx;
    const scale = this.renderScale || 1;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W * S, this.H * S);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';

    const zones = {
      left: { x: 0, w: 78 * S, h: this.H * S },
      middle: { x: 79 * S, w: 99 * S, h: this.H * S },
      right: { x: 178 * S, w: 78 * S, h: this.H * S },
    };

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([2 / scale, 3 / scale]);
    ctx.beginPath();
    ctx.moveTo(78.5 * S, 0); ctx.lineTo(78.5 * S, this.H * S);
    ctx.moveTo(177.5 * S, 0); ctx.lineTo(177.5 * S, this.H * S);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const [zoneName, bounds] of Object.entries(zones)) {
      const cfg = this.layout[zoneName];
      if (!cfg) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.x, 0, bounds.w, bounds.h);
      ctx.clip();

      const hasSec = cfg.secondary && cfg.secondary !== 'none';
      if (hasSec) {
        const splitY = 42 * S;
        this._drawWidget(ctx, cfg.primary, bounds.x, 0, bounds.w, splitY, ms, 'primary');
        this._drawWidget(ctx, cfg.secondary, bounds.x, splitY, bounds.w, this.H * S - splitY, ms, 'secondary');

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([1 / scale, 2 / scale]);
        ctx.beginPath();
        ctx.moveTo(bounds.x + 4 * S, splitY + 0.5);
        ctx.lineTo(bounds.x + bounds.w - 4 * S, splitY + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        this._drawWidget(ctx, cfg.primary, bounds.x, 0, bounds.w, bounds.h, ms, 'primary');
      }

      ctx.restore();
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  _fitFont(ctx, text, maxW, startSize, minSize, bold, family) {
    family = family || 'Arial, sans-serif';
    const S = this.SS;
    let sz = startSize * S;
    const min = minSize * S;
    const margin = 4 * S;
    while (sz > min) {
      ctx.font = `${bold ? 'bold ' : ''}${sz}px ${family}`;
      if (ctx.measureText(text).width <= maxW - margin) break;
      sz -= S;
    }
    ctx.font = `${bold ? 'bold ' : ''}${sz}px ${family}`;
    return sz;
  }

  _snap(v) { return Math.round(v); }

  _clampTextY(yBase, asc, yTop, yBottom) {
    const minY = yTop + asc;
    const maxY = yBottom - 2;
    return Math.max(minY, Math.min(maxY, yBase));
  }

  _drawWidget(ctx, type, x, y, w, h, ms, importance) {
    if (!type || type === 'none') return;
    const d = this.demo;
    const S = this.SS;

    ctx.fillStyle = '#fff';

    switch (type) {
      case 'gear': {
        const isDigit = d.gear.length === 1 && d.gear >= '0' && d.gear <= '9';
        const maxSz = importance === 'primary' ?
          (h > 50 * S ? (isDigit ? 46 : 32) : (isDigit ? 36 : 24)) :
          (isDigit ? 18 : 14);
        const fsize = this._fitFont(ctx, d.gear, w, maxSz, 10, true);
        const m   = ctx.measureText(d.gear);
        const asc = m.actualBoundingBoxAscent  || fsize * 0.85;
        const dsc = m.actualBoundingBoxDescent || 1;
        const th  = asc + dsc;
        const gx  = this._snap(x + (w - m.width) / 2);
        const gyRaw  = y + ((h - th) / 2) + asc;
        const gy  = this._snap(this._clampTextY(gyRaw, asc, y, y + h));
        ctx.fillText(d.gear, gx, gy);
        break;
      }

      case 'speed': {
        const val = Math.round(d.speed);
        const maxSz = importance === 'primary' ? (h > 50 * S ? 32 : 22) : 14;
        const txt = `${val}`;
        const fsize = this._fitFont(ctx, txt, w, maxSz, 9, true);
        const m   = ctx.measureText(txt);
        const asc = m.actualBoundingBoxAscent  || fsize * 0.85;
        const dsc = m.actualBoundingBoxDescent || 1;
        const th  = asc + dsc;
        const yBase = y + ((h - th) / 2) + asc;
        const yText = this._snap(this._clampTextY(yBase, asc, y, y + h));
        ctx.fillText(txt, this._snap(x + (w - m.width) / 2), yText);

        if (importance === 'primary' && h > 30 * S) {
          ctx.font = `${9 * S}px "Courier New", monospace`;
          const u = 'km/h';
          const um = ctx.measureText(u);
          const uBase = y + ((h - th) / 2) + asc + 11 * S;
          const uText = this._snap(this._clampTextY(uBase, 0, y, y + h));
          ctx.fillText(u, this._snap(x + (w - um.width) / 2), uText);
        }
        break;
      }

      case 'rpm': {
        const val = Math.round(d.rpm);
        const maxSz = importance === 'primary' ? (h > 50 * S ? 28 : 18) : 12;
        const txt = `${val}`;
        const fsize = this._fitFont(ctx, txt, w, maxSz, 9, true);
        const m   = ctx.measureText(txt);
        const asc = m.actualBoundingBoxAscent  || fsize * 0.85;
        const dsc = m.actualBoundingBoxDescent || 1;
        const th  = asc + dsc;
        const yBase = y + ((h - th) / 2) + asc;
        const yText = this._snap(this._clampTextY(yBase, asc, y, y + h));
        ctx.fillText(txt, this._snap(x + (w - m.width) / 2), yText);

        if (importance === 'primary' && h > 30 * S) {
          ctx.font = `${9 * S}px "Courier New", monospace`;
          const u = 'RPM';
          const um = ctx.measureText(u);
          const uBase = y + ((h - th) / 2) + asc + 11 * S;
          const uText = this._snap(this._clampTextY(uBase, 0, y, y + h));
          ctx.fillText(u, this._snap(x + (w - um.width) / 2), uText);
        }
        break;
      }

      case 'throttle':
      case 'brake':
      case 'clutch': {
        const pct = Math.round(d[type]);
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        this._drawBarWidget(ctx, x, y, w, h, pct, label, importance);
        break;
      }

      case 'fuel': {
        const pct = Math.round(d.fuel);
        this._drawBarWidget(ctx, x, y, w, h, pct, 'Fuel', importance);
        break;
      }

      case 'Tires': {
        const pad = 2 * S;
        const gap = 3 * S;
        const availH = h - pad * 2;
        const availW = w - pad * 2;
        const TireH = Math.max(4 * S, Math.floor((availH - gap) / 2));
        const TireW = Math.min(12 * S, Math.floor((availW - gap) / 2));
        const rad = Math.min(2 * S, TireH / 4);
        const totalW = TireW * 2 + gap;
        const totalH = TireH * 2 + gap;
        const ox = x + (w - totalW) / 2;
        const oy = y + (h - totalH) / 2;
        this._drawTire(ctx, d.TireDisplayPct[0], ox, oy, TireW, TireH, rad);
        this._drawTire(ctx, d.TireDisplayPct[1], ox + TireW + gap, oy, TireW, TireH, rad);
        this._drawTire(ctx, d.TireDisplayPct[2], ox, oy + TireH + gap, TireW, TireH, rad);
        this._drawTire(ctx, d.TireDisplayPct[3], ox + TireW + gap, oy + TireH + gap, TireW, TireH, rad);
        break;
      }

      case 'abs_tc': {
        const absTcMaxSz = importance === 'primary' ? 10 : 9;
        this._fitFont(ctx, 'ABS  TC', w, absTcMaxSz, 7, false, '"Courier New", monospace');
        const cy = y + h / 2;
        const absText = 'ABS';
        const tcText  = 'TC';
        const absW = ctx.measureText(absText).width;
        const tcW  = ctx.measureText(tcText).width;
        const gap  = Math.max(4 * S, Math.min(12 * S, w - absW - tcW - 8 * S));
        const totalTW = absW + gap + tcW;
        const startX = x + (w - totalTW) / 2;

        if (d.abs) {
          const b = Math.floor(ms / 150) % 2 === 0;
          if (b) { ctx.fillRect(startX - 2 * S, cy - 7 * S, absW + 4 * S, 12 * S); ctx.fillStyle = '#000'; }
        }
        ctx.fillText(absText, startX, cy + 3 * S);
        ctx.fillStyle = '#fff';

        const tcX = startX + absW + gap;
        if (d.tc) {
          const b = Math.floor(ms / 150) % 2 === 0;
          if (b) { ctx.fillRect(tcX - 2 * S, cy - 7 * S, tcW + 4 * S, 12 * S); ctx.fillStyle = '#000'; }
        }
        ctx.fillText(tcText, tcX, cy + 3 * S);
        ctx.fillStyle = '#fff';
        break;
      }

      case 'pit': {
        const line1 = 'PIT';
        const line2 = 'LIMITER';

        if (importance === 'primary') {
          const sz1 = this._fitFont(ctx, line1, w, 18, 10, true);
          const m1  = ctx.measureText(line1);
          const sz2 = this._fitFont(ctx, line2, w, 12, 7, true);
          const m2  = ctx.measureText(line2);
          const gap = 3 * S;
          const asc1 = m1.actualBoundingBoxAscent || sz1 * 0.8;
          const asc2 = m2.actualBoundingBoxAscent || sz2 * 0.8;
          const totalH = asc1 + gap + asc2;
          const topY = y + (h - totalH) / 2 + asc1;
          const botY = topY + gap + asc2;

          if (d.pit) {
            const blink = Math.floor(ms / 150) % 2 === 0;
            if (blink) {
              const pad = 3 * S;
              this._fitFont(ctx, line1, w, 18, 10, true);
              ctx.fillRect(x + (w - m1.width) / 2 - pad, topY - asc1 - S, m1.width + pad * 2, asc1 + 4 * S);
              ctx.fillStyle = '#000';
              ctx.fillText(line1, x + (w - m1.width) / 2, topY);
              ctx.fillStyle = '#fff';

              this._fitFont(ctx, line2, w, 12, 7, true);
              ctx.fillRect(x + (w - m2.width) / 2 - pad, botY - asc2 - S, m2.width + pad * 2, asc2 + 4 * S);
              ctx.fillStyle = '#000';
              ctx.fillText(line2, x + (w - m2.width) / 2, botY);
              ctx.fillStyle = '#fff';
            } else {
              this._fitFont(ctx, line1, w, 18, 10, true);
              ctx.fillText(line1, x + (w - m1.width) / 2, topY);
              this._fitFont(ctx, line2, w, 12, 7, true);
              ctx.fillText(line2, x + (w - m2.width) / 2, botY);
            }
          } else {
            this._fitFont(ctx, line1, w, 18, 10, true);
            ctx.fillText(line1, x + (w - m1.width) / 2, topY);
            this._fitFont(ctx, line2, w, 12, 7, true);
            ctx.fillText(line2, x + (w - m2.width) / 2, botY);
          }
        } else {
          const sz = this._fitFont(ctx, line1, w, 12, 7, true);
          const m  = ctx.measureText(line1);
          const asc = m.actualBoundingBoxAscent || sz * 0.8;
          const py = y + h / 2 + asc / 2;
          if (d.pit) {
            const blink = Math.floor(ms / 150) % 2 === 0;
            if (blink) {
              ctx.fillRect(x + (w - m.width) / 2 - 3 * S, py - asc - S, m.width + 6 * S, asc + 4 * S);
              ctx.fillStyle = '#000';
              ctx.fillText(line1, x + (w - m.width) / 2, py);
              ctx.fillStyle = '#fff';
            } else {
              ctx.fillText(line1, x + (w - m.width) / 2, py);
            }
          } else {
            ctx.fillText(line1, x + (w - m.width) / 2, py);
          }
        }
        break;
      }

      case 'boost': {
        const val = d.boost.toFixed(1);
        this._drawValueWidget(ctx, x, y, w, h, val, 'bar', importance);
        break;
      }

      case 'air_temp': {
        const val = Math.round(d.air_temp);
        this._drawValueWidget(ctx, x, y, w, h, `${val}°`, 'Air', importance);
        break;
      }

      case 'road_temp': {
        const val = Math.round(d.road_temp);
        this._drawValueWidget(ctx, x, y, w, h, `${val}°`, 'Road', importance);
        break;
      }

      case 'drs': {
        const drsTxt = d.drs ? 'DRS ON' : 'DRS OFF';
        const drsMaxSz = importance === 'primary' ? 20 : 14;
        const drsSz = this._fitFont(ctx, drsTxt, w, drsMaxSz, 9, true);
        const m   = ctx.measureText(drsTxt);
        const asc = m.actualBoundingBoxAscent  || drsSz * 0.8;
        ctx.fillText(drsTxt, x + (w - m.width) / 2, y + h / 2 + asc / 2);
        break;
      }

      case 'steer': {
        const pct = Math.round(d.steer * 100);
        this._drawValueWidget(ctx, x, y, w, h, `${pct}%`, 'Steer', importance);
        break;
      }

      case 'brake_temp': {
        const val = Math.round(d.brake_temp);
        this._drawValueWidget(ctx, x, y, w, h, `${val}°`, 'BrkT', importance);
        break;
      }
    }
  }

  _drawValueWidget(ctx, x, y, w, h, value, unit, importance) {
    const S = this.SS;
    const maxSz = importance === 'primary' ? (h > 50 * S ? 24 : 16) : 12;
    const fsize = this._fitFont(ctx, value, w, maxSz, 8, true);
    ctx.fillStyle = '#fff';
    const m   = ctx.measureText(value);
    const asc = m.actualBoundingBoxAscent  || fsize * 0.85;
    const dsc = m.actualBoundingBoxDescent || 1;
    const th  = asc + dsc;
    const vy  = y + ((h - th) / 2) + asc - (importance === 'primary' && h > 30 * S ? 4 * S : 0);
    const vText = this._snap(this._clampTextY(vy, asc, y, y + h));
    ctx.fillText(value, this._snap(x + (w - m.width) / 2), vText);

    if (importance === 'primary' && h > 30 * S) {
      ctx.font = `${9 * S}px "Courier New", monospace`;
      const um = ctx.measureText(unit);
      const uText = this._snap(this._clampTextY(vy + 11 * S, 0, y, y + h));
      ctx.fillText(unit, this._snap(x + (w - um.width) / 2), uText);
    }
  }

  _drawBarWidget(ctx, x, y, w, h, pct, label, importance) {
    const S = this.SS;
    ctx.fillStyle = '#fff';
    const margin = 6 * S;
    const barW = w - margin * 2;
    const barX = x + margin;
    const lw = 1 / (this.renderScale || 1);

    if (importance === 'primary') {
      const barH = Math.min(6 * S, Math.max(2 * S, h - 44 * S));
      ctx.font = `${9 * S}px "Courier New", monospace`;
      const lm = ctx.measureText(label);
      ctx.fillText(
        label,
        this._snap(x + (w - lm.width) / 2),
        this._snap(y + Math.min(14 * S, h * 0.25))
      );

      this._fitFont(ctx, `${pct}%`, w, 16, 9, true);
      const pm = ctx.measureText(`${pct}%`);
      const valY = y + Math.min(34 * S, h * 0.58);
      ctx.fillText(
        `${pct}%`,
        this._snap(x + (w - pm.width) / 2),
        this._snap(valY)
      );

      const barY = Math.min(y + h - barH - 2 * S, valY + 6 * S);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = lw;
      ctx.strokeRect(barX, barY, barW, barH);
      const fillW = Math.round(barW * pct / 100);
      if (fillW > 0) ctx.fillRect(barX, barY, fillW, barH);
    } else {
      const barH = Math.min(4 * S, Math.max(2 * S, h - 14 * S));
      ctx.font = `${8 * S}px "Courier New", monospace`;
      const lm = ctx.measureText(`${label} ${pct}%`);
      ctx.fillText(
        `${label} ${pct}%`,
        this._snap(x + (w - lm.width) / 2),
        this._snap(y + h / 2 - 2 * S)
      );

      const barY = y + h / 2 + 3 * S;
      if (barY + barH <= y + h) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = lw;
        ctx.strokeRect(barX, barY, barW, barH);
        const fillW = Math.round(barW * pct / 100);
        if (fillW > 0) ctx.fillRect(barX, barY, fillW, barH);
      }
    }
  }

  _drawTire(ctx, pct, x, y, w, h, r) {
    const S = this.SS;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 / (this.renderScale || 1);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
    ctx.stroke();

    const ix = x + 2 * S, iy = y + 2 * S;
    const iw = w - 4 * S, ih = h - 4 * S;
    const fh = Math.round((ih * pct) / 100);
    if (fh > 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(ix, iy + ih - fh, iw, fh);
    }
  }
}

class OLEDPreview {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.ctx.imageSmoothingEnabled = true;

    this.W = 256;
    this.H = 64;
    this.SS = 1;
    this.minWidth = 320;
    this.maxWidth = 820;
    this.renderScale = 1;

    this._syncCanvasSize();

    // Default layout
    this.layout = {
      left: { primary: 'Tires', secondary: 'abs_tc' },
      middle: { primary: 'gear', secondary: 'rpm' },
      right: { primary: 'pit', secondary: 'speed' },
    };

    this.state = {
      gear: 'N',
      speed: 0,
      rpm: 0,
      throttle: 0,
      brake: 0,
      fuel: 0,
      pit: 0,
      abs: 0,
      tc: 0,
      boost: 0,
      airTemp: 0,
      roadTemp: 0,
      drs: 0,
      clutch: 0,
      steer: 0,
      brakeTemp: 0,
      TireDisplayPct: [100, 100, 100, 100],
      TireLow: [0, 0, 0, 0],
      firstPacketReceived: false,
      heartbeatLost: false,
      telemetryRunning: false,
      acRunning: true,
      ip: '0.0.0.0',
    };

    this._raf = null;
    this._t0  = performance.now();
    this._startLoop();

    this._resizeObserver = null;
    this._listenForResize();
  }

  update(patch) { Object.assign(this.state, patch); }
  setLayout(layout) { this.layout = layout; }

  _startLoop() {
    const tick = (ts) => {
      this._frame(ts);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _syncCanvasSize() {
    const bezel = this.canvas.closest('.OledBezel') || this.canvas.parentElement;
    const styles = bezel ? window.getComputedStyle(bezel) : null;
    const padX = styles ? (parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight)) : 0;
    const maxW = bezel ? Math.max(1, bezel.clientWidth - padX) : this.maxWidth;
    const cssW = Math.max(this.minWidth, Math.min(this.maxWidth, maxW));
    const cssH = Math.round(cssW * (this.H / this.W));
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.renderScale = (cssW * dpr) / this.W;
  }

  _listenForResize() {
    const bezel = this.canvas.closest('.OledBezel') || this.canvas.parentElement;
    if (!bezel) return;

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._syncCanvasSize();
      });
      this._resizeObserver.observe(bezel);
      return;
    }

    window.addEventListener('resize', () => this._syncCanvasSize());
  }

  _frame(ts) {
    const ms  = ts - this._t0;
    const S   = this.SS;
    const ctx = this.ctx;
    const s   = this.state;
    const scale = this.renderScale || 1;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.W * S, this.H * S);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';

    if (!s.telemetryRunning) {
      this._screenIdle(ctx, S);
    } else if (s.heartbeatLost) {
      this._screenDisconnected(ctx, S);
    } else if (!s.acRunning) {
      this._screenACNotRunning(ctx, S);
    } else {
      this._screenTelemetry(ctx, s, ms, S);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }


  _screenACNotRunning(ctx, S) {
    ctx.font = `bold ${16 * S}px Arial, sans-serif`;
    const msg = 'Assetto Corsa';
    const m   = ctx.measureText(msg);
    const asc = m.actualBoundingBoxAscent  || 13 * S;
    const y1  = this.H * S / 2 - 4 * S;
    ctx.fillText(msg, (this.W * S - m.width) / 2, y1);

    ctx.font = `bold ${14 * S}px Arial, sans-serif`;
    const msg2 = 'not running';
    const m2   = ctx.measureText(msg2);
    ctx.fillText(msg2, (this.W * S - m2.width) / 2, y1 + 18 * S);
  }

  _screenIdle(ctx, S) {
    ctx.font = `${11 * S}px Arial, sans-serif`;
    ctx.fillStyle = '#555';
    const msg = 'Telemetry not running';
    const m = ctx.measureText(msg);
    ctx.fillText(msg, (this.W * S - m.width) / 2, this.H * S / 2 + 4 * S);
    ctx.fillStyle = '#fff';
  }

  _screenDisconnected(ctx, S) {
    ctx.font = `bold ${18 * S}px Arial, sans-serif`;
    const msg = 'DISCONNECTED';
    const m = ctx.measureText(msg);
    ctx.fillText(msg, (this.W * S - m.width) / 2, this.H * S / 2);

    ctx.font = `${10 * S}px Arial, sans-serif`;
    const sub = 'Device lost';
    const m2 = ctx.measureText(sub);
    ctx.fillText(sub, (this.W * S - m2.width) / 2, this.H * S / 2 + 16 * S);
  }


  _screenTelemetry(ctx, s, ms, S) {
    const scale = this.renderScale || 1;
    const zones = {
      left:   { x: 0, w: 78  * S, h: this.H * S },
      middle: { x: 79  * S, w: 99  * S, h: this.H * S },
      right:  { x: 178 * S, w: 78  * S, h: this.H * S },
    };

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([2 / scale, 3 / scale]);
    ctx.beginPath();
    ctx.moveTo(78.5 * S, 0); ctx.lineTo(78.5 * S, this.H * S);
    ctx.moveTo(177.5 * S, 0); ctx.lineTo(177.5 * S, this.H * S);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const [zoneName, bounds] of Object.entries(zones)) {
      const cfg = this.layout[zoneName];
      if (!cfg) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.x, 0, bounds.w, bounds.h);
      ctx.clip();

      const hasSec = cfg.secondary && cfg.secondary !== 'none';
      if (hasSec) {
        const splitY = 42 * S;
        this._drawWidget(ctx, cfg.primary, bounds.x, 0, bounds.w, splitY, ms, 'primary', S);
        this._drawWidget(ctx, cfg.secondary, bounds.x, splitY, bounds.w, this.H * S - splitY, ms, 'secondary', S);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([1 / scale, 2 / scale]);
        ctx.beginPath();
        ctx.moveTo(bounds.x + 4 * S, splitY + 0.5);
        ctx.lineTo(bounds.x + bounds.w - 4 * S, splitY + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        this._drawWidget(ctx, cfg.primary, bounds.x, 0, bounds.w, bounds.h, ms, 'primary', S);
      }

      ctx.restore();
    }
  }

  _fitFont(ctx, text, maxW, startSize, minSize, bold, family) {
    family = family || 'Arial, sans-serif';
    const S = 1;
    let sz = startSize * S;
    const min = minSize * S;
    const margin = 4 * S;
    while (sz > min) {
      ctx.font = `${bold ? 'bold ' : ''}${sz}px ${family}`;
      if (ctx.measureText(text).width <= maxW - margin) break;
      sz -= S;
    }
    ctx.font = `${bold ? 'bold ' : ''}${sz}px ${family}`;
    return sz;
  }


  _drawWidget(ctx, type, x, y, w, h, ms, importance, S) {
    if (!type || type === 'none') return;
    const d = this.state;
    ctx.fillStyle = '#fff';

    switch (type) {
      case 'gear': {
        const g = String(d.gear || 'N');
        const isDigit = g.length === 1 && g >= '0' && g <= '9';
        const maxSz = importance === 'primary' ?
          (h > 50 * S ? (isDigit ? 46 : 32) : (isDigit ? 36 : 24)) :
          (isDigit ? 18 : 14);
        const fsize = this._fitFont(ctx, g, w, maxSz, 10, true);
        const m   = ctx.measureText(g);
        const asc = m.actualBoundingBoxAscent  || fsize * 0.85;
        const dsc = m.actualBoundingBoxDescent || 1;
        const th  = asc + dsc;
        let gy  = y + ((h - th) / 2) + asc;
        if (gy - asc < y) gy = y + asc;
        ctx.fillText(g, x + (w - m.width) / 2, gy);
        break;
      }

      case 'speed': {
        const val = Math.round(d.speed || 0);
        this._drawValueWidget(ctx, x, y, w, h, `${val}`, 'km/h', importance, S);
        break;
      }

      case 'rpm': {
        const val = Math.round(d.rpm || 0);
        this._drawValueWidget(ctx, x, y, w, h, `${val}`, 'RPM', importance, S);
        break;
      }

      case 'throttle':
      case 'brake':
      case 'clutch': {
        const pct = Math.round(d[type] || 0);
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        this._drawBarWidget(ctx, x, y, w, h, pct, label, importance, S);
        break;
      }

      case 'fuel': {
        const pct = Math.round(d.fuel || 0);
        this._drawBarWidget(ctx, x, y, w, h, pct, 'Fuel', importance, S);
        break;
      }

      case 'Tires': {
        const tPct = d.TireDisplayPct || [100, 100, 100, 100];
        const pad = 2 * S;
        const gap = 3 * S;
        const availH = h - pad * 2;
        const availW = w - pad * 2;
        const TireH = Math.max(4 * S, Math.floor((availH - gap) / 2));
        const TireW = Math.min(12 * S, Math.floor((availW - gap) / 2));
        const rad = Math.min(2 * S, TireH / 4);
        const totalW = TireW * 2 + gap;
        const totalH = TireH * 2 + gap;
        const ox = x + (w - totalW) / 2;
        const oy = y + (h - totalH) / 2;
        this._drawTire(ctx, tPct[0], ox, oy, TireW, TireH, rad, S);
        this._drawTire(ctx, tPct[1], ox + TireW + gap, oy, TireW, TireH, rad, S);
        this._drawTire(ctx, tPct[2], ox, oy + TireH + gap, TireW, TireH, rad, S);
        this._drawTire(ctx, tPct[3], ox + TireW + gap, oy + TireH + gap, TireW, TireH, rad, S);
        break;
      }

      case 'abs_tc': {
        const absTcMaxSz = importance === 'primary' ? 10 : 9;
        this._fitFont(ctx, 'ABS  TC', w, absTcMaxSz, 7, false, '"Courier New", monospace');
        const cy = y + h / 2;
        const absText = 'ABS';
        const tcText  = 'TC';
        const absW = ctx.measureText(absText).width;
        const tcW  = ctx.measureText(tcText).width;
        const gap  = Math.max(4 * S, Math.min(12 * S, w - absW - tcW - 8 * S));
        const totalTW = absW + gap + tcW;
        const startX = x + (w - totalTW) / 2;

        if (d.abs) {
          const b = Math.floor(ms / 150) % 2 === 0;
          if (b) { ctx.fillRect(startX - 2 * S, cy - 7 * S, absW + 4 * S, 12 * S); ctx.fillStyle = '#000'; }
        }
        ctx.fillText(absText, startX, cy + 3 * S);
        ctx.fillStyle = '#fff';

        const tcX = startX + absW + gap;
        if (d.tc) {
          const b = Math.floor(ms / 150) % 2 === 0;
          if (b) { ctx.fillRect(tcX - 2 * S, cy - 7 * S, tcW + 4 * S, 12 * S); ctx.fillStyle = '#000'; }
        }
        ctx.fillText(tcText, tcX, cy + 3 * S);
        ctx.fillStyle = '#fff';
        break;
      }

      case 'pit': {
        const line1 = 'PIT';
        const line2 = 'LIMITER';

        if (importance === 'primary') {
          const sz1 = this._fitFont(ctx, line1, w, 18, 10, true);
          const m1  = ctx.measureText(line1);
          const sz2 = this._fitFont(ctx, line2, w, 12, 7, true);
          const m2  = ctx.measureText(line2);
          const pgap = 3 * S;
          const asc1 = m1.actualBoundingBoxAscent || sz1 * 0.8;
          const asc2 = m2.actualBoundingBoxAscent || sz2 * 0.8;
          const totalH = asc1 + pgap + asc2;
          const topY = y + (h - totalH) / 2 + asc1;
          const botY = topY + pgap + asc2;

          if (d.pit) {
            const blink = Math.floor(ms / 150) % 2 === 0;
            if (blink) {
              const pad = 3 * S;
              this._fitFont(ctx, line1, w, 18, 10, true);
              ctx.fillRect(x + (w - m1.width) / 2 - pad, topY - asc1 - S, m1.width + pad * 2, asc1 + 4 * S);
              ctx.fillStyle = '#000';
              ctx.fillText(line1, x + (w - m1.width) / 2, topY);
              ctx.fillStyle = '#fff';

              this._fitFont(ctx, line2, w, 12, 7, true);
              ctx.fillRect(x + (w - m2.width) / 2 - pad, botY - asc2 - S, m2.width + pad * 2, asc2 + 4 * S);
              ctx.fillStyle = '#000';
              ctx.fillText(line2, x + (w - m2.width) / 2, botY);
              ctx.fillStyle = '#fff';
            } else {
              this._fitFont(ctx, line1, w, 18, 10, true);
              ctx.fillText(line1, x + (w - m1.width) / 2, topY);
              this._fitFont(ctx, line2, w, 12, 7, true);
              ctx.fillText(line2, x + (w - m2.width) / 2, botY);
            }
          } else {
            this._fitFont(ctx, line1, w, 18, 10, true);
            ctx.fillText(line1, x + (w - m1.width) / 2, topY);
            this._fitFont(ctx, line2, w, 12, 7, true);
            ctx.fillText(line2, x + (w - m2.width) / 2, botY);
          }
        } else {
          const sz = this._fitFont(ctx, line1, w, 12, 7, true);
          const m  = ctx.measureText(line1);
          const asc = m.actualBoundingBoxAscent || sz * 0.8;
          const py = y + h / 2 + asc / 2;
          if (d.pit) {
            const blink = Math.floor(ms / 150) % 2 === 0;
            if (blink) {
              ctx.fillRect(x + (w - m.width) / 2 - 3 * S, py - asc - S, m.width + 6 * S, asc + 4 * S);
              ctx.fillStyle = '#000';
              ctx.fillText(line1, x + (w - m.width) / 2, py);
              ctx.fillStyle = '#fff';
            } else {
              ctx.fillText(line1, x + (w - m.width) / 2, py);
            }
          } else {
            ctx.fillText(line1, x + (w - m.width) / 2, py);
          }
        }
        break;
      }

      case 'boost': {
        const val = (d.boost || 0).toFixed(1);
        this._drawValueWidget(ctx, x, y, w, h, val, 'bar', importance, S);
        break;
      }

      case 'air_temp': {
        const val = Math.round(d.airTemp || 0);
        this._drawValueWidget(ctx, x, y, w, h, `${val}°`, 'Air', importance, S);
        break;
      }

      case 'road_temp': {
        const val = Math.round(d.roadTemp || 0);
        this._drawValueWidget(ctx, x, y, w, h, `${val}°`, 'Road', importance, S);
        break;
      }

      case 'drs': {
        const drsTxt = d.drs ? 'DRS ON' : 'DRS OFF';
        const drsMaxSz = importance === 'primary' ? 20 : 14;
        const drsSz = this._fitFont(ctx, drsTxt, w, drsMaxSz, 9, true);
        const m   = ctx.measureText(drsTxt);
        const asc = m.actualBoundingBoxAscent  || drsSz * 0.8;
        ctx.fillText(drsTxt, x + (w - m.width) / 2, y + h / 2 + asc / 2);
        break;
      }

      case 'steer': {
        const pct = Math.round((d.steer || 0) * 100);
        this._drawValueWidget(ctx, x, y, w, h, `${pct}%`, 'Steer', importance, S);
        break;
      }

      case 'brake_temp': {
        const val = Math.round(d.brakeTemp || 0);
        this._drawValueWidget(ctx, x, y, w, h, `${val}°`, 'BrkT', importance, S);
        break;
      }
    }
  }

  _drawValueWidget(ctx, x, y, w, h, value, unit, importance, S) {
    const maxSz = importance === 'primary' ? (h > 50 * S ? 24 : 16) : 12;
    const fsize = this._fitFont(ctx, value, w, maxSz, 8, true);
    ctx.fillStyle = '#fff';
    const m   = ctx.measureText(value);
    const asc = m.actualBoundingBoxAscent  || fsize * 0.85;
    const dsc = m.actualBoundingBoxDescent || 1;
    const th  = asc + dsc;
    const vy  = y + ((h - th) / 2) + asc - (importance === 'primary' && h > 30 * S ? 4 * S : 0);
    ctx.fillText(value, x + (w - m.width) / 2, vy);

    if (importance === 'primary' && h > 30 * S) {
      ctx.font = `${9 * S}px "Courier New", monospace`;
      const um = ctx.measureText(unit);
      ctx.fillText(unit, x + (w - um.width) / 2, vy + 11 * S);
    }
  }

  _drawBarWidget(ctx, x, y, w, h, pct, label, importance, S) {
    ctx.fillStyle = '#fff';
    const margin = 6 * S;
    const barW = w - margin * 2;
    const barX = x + margin;
    const lw = 1 / (this.renderScale || 1);

    if (importance === 'primary') {
      const barH = Math.min(6 * S, Math.max(2 * S, h - 44 * S));
      ctx.font = `${9 * S}px "Courier New", monospace`;
      const lm = ctx.measureText(label);
      ctx.fillText(label, x + (w - lm.width) / 2, y + Math.min(14 * S, h * 0.25));

      this._fitFont(ctx, `${pct}%`, w, 16, 9, true);
      const pm = ctx.measureText(`${pct}%`);
      const valY = y + Math.min(34 * S, h * 0.58);
      ctx.fillText(`${pct}%`, x + (w - pm.width) / 2, valY);

      const barY = Math.min(y + h - barH - 2 * S, valY + 6 * S);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = lw;
      ctx.strokeRect(barX, barY, barW, barH);
      const fillW = Math.round(barW * pct / 100);
      if (fillW > 0) ctx.fillRect(barX, barY, fillW, barH);
    } else {
      const barH = Math.min(4 * S, Math.max(2 * S, h - 14 * S));
      ctx.font = `${8 * S}px "Courier New", monospace`;
      const lm = ctx.measureText(`${label} ${pct}%`);
      ctx.fillText(`${label} ${pct}%`, x + (w - lm.width) / 2, y + h / 2 - 2 * S);

      const barY = y + h / 2 + 3 * S;
      if (barY + barH <= y + h) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = lw;
        ctx.strokeRect(barX, barY, barW, barH);
        const fillW = Math.round(barW * pct / 100);
        if (fillW > 0) ctx.fillRect(barX, barY, fillW, barH);
      }
    }
  }

    _drawTire(ctx, pct, x, y, w, h, r, S) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1 / (this.renderScale || 1);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.stroke();
  
      const ix = x + 2 * S, iy = y + 2 * S;
      const iw = w - 4 * S, ih = h - 4 * S;
      const fh = Math.round((ih * pct) / 100);
      if (fh > 0) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(ix, iy + ih - fh, iw, fh);
      }
    }
  }



