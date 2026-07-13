const PAD = { top: 24, right: 80, bottom: 44, left: 52 };

function catmullRomToBezier(pts) {
  const segments = [];
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(pts.length - 1, i + 1)];
    segments.push({
      from: p1,
      cp1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      cp2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      to: p2,
    });
  }
  return segments;
}

export function drawEvolutionChart(canvas, history, strategies) {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;
  const G  = history.length - 1;

  // Background
  ctx.clearRect(0, 0, W, H);

  // Grid lines + y labels
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const pct = i / 4;
    const y   = PAD.top + (1 - pct) * cH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + cW, y);
    ctx.stroke();

    ctx.fillStyle  = 'rgba(255,255,255,0.28)';
    ctx.font       = '10px Inter, system-ui';
    ctx.textAlign  = 'right';
    ctx.fillText(`${Math.round(pct * 100)}%`, PAD.left - 6, y + 4);
  }

  // X axis labels
  const xStep = Math.max(1, Math.ceil(G / 8));
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.font      = '10px Inter, system-ui';
  ctx.textAlign = 'center';
  for (let g = 0; g <= G; g += xStep) {
    const x = PAD.left + (g / G) * cW;
    ctx.fillText(g, x, H - PAD.bottom + 16);
  }
  ctx.fillText('Generation', PAD.left + cW / 2, H - 6);

  // Y axis label
  ctx.save();
  ctx.translate(12, PAD.top + cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('Population share', 0, 0);
  ctx.restore();

  // Draw each strategy line
  strategies.forEach((strat, i) => {
    const pts = history.map((gen, g) => ({
      x: PAD.left + (g / G) * cW,
      y: PAD.top  + (1 - gen[i]) * cH,
    }));

    // Filled gradient area
    const segs = catmullRomToBezier(pts);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, PAD.top + cH);
    ctx.lineTo(pts[0].x, pts[0].y);
    segs.forEach(s => ctx.bezierCurveTo(s.cp1.x, s.cp1.y, s.cp2.x, s.cp2.y, s.to.x, s.to.y));
    ctx.lineTo(pts[pts.length - 1].x, PAD.top + cH);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    grad.addColorStop(0,   strat.color + '33');
    grad.addColorStop(1,   strat.color + '04');
    ctx.fillStyle = grad;
    ctx.fill();

    // Smooth line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    segs.forEach(s => ctx.bezierCurveTo(s.cp1.x, s.cp1.y, s.cp2.x, s.cp2.y, s.to.x, s.to.y));
    ctx.strokeStyle = strat.color;
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Terminal dot
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
    ctx.fillStyle   = strat.color;
    ctx.fill();
    ctx.strokeStyle = '#07071a';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
  });

  // Right-side labels (sorted by final pop to reduce overlap)
  const finals = strategies.map((s, i) => ({
    strat: s,
    pop: history[history.length - 1][i],
    y: PAD.top + (1 - history[history.length - 1][i]) * cH,
  })).sort((a, b) => a.y - b.y);

  // Simple collision avoidance
  const MIN_GAP = 13;
  for (let k = 1; k < finals.length; k++) {
    if (finals[k].y - finals[k - 1].y < MIN_GAP) {
      finals[k].y = finals[k - 1].y + MIN_GAP;
    }
  }

  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  finals.forEach(({ strat, y }) => {
    ctx.fillStyle = strat.color;
    ctx.fillText(strat.short, PAD.left + cW + 6, y + 4);
  });
}
