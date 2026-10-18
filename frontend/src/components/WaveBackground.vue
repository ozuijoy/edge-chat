<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import store from '../store.js';

const canvasRef = ref(null);
let rafId = null;
let resizeHandler = null;

const waves = [
  { amp: 12, freq: 0.004, speed: 0.018, baseY: 0.92, harmonics: [{ ampRatio: 0.2, freqRatio: 2.0, speedRatio: 0.4, phase: 0.8 }], colors: ['#3a7aaa', '#4688b4'] },
  { amp: 15, freq: 0.0035, speed: 0.022, baseY: 0.88, harmonics: [{ ampRatio: 0.25, freqRatio: 2.2, speedRatio: 0.5, phase: 1.5 }], colors: ['#4688b4', '#5a9ac4'] },
  { amp: 18, freq: 0.003, speed: 0.028, baseY: 0.84, harmonics: [{ ampRatio: 0.3, freqRatio: 2.0, speedRatio: 0.5, phase: 2.2 }], colors: ['#5a9ac4', '#6aadd4'] },
  { amp: 20, freq: 0.0028, speed: 0.032, baseY: 0.80, harmonics: [{ ampRatio: 0.25, freqRatio: 2.5, speedRatio: 0.6, phase: 3.0 }], colors: ['#6aadd4', '#7eb8dc'] },
  { amp: 22, freq: 0.0025, speed: 0.038, baseY: 0.76, harmonics: [{ ampRatio: 0.3, freqRatio: 2.2, speedRatio: 0.65, phase: 0.3 }], colors: ['#7eb8dc', '#8cc6e6'] },
  { amp: 25, freq: 0.0022, speed: 0.042, baseY: 0.72, harmonics: [{ ampRatio: 0.35, freqRatio: 2.0, speedRatio: 0.7, phase: 1.8 }], colors: ['#8cc6e6', '#a0d2ec'] },
  { amp: 28, freq: 0.002, speed: 0.048, baseY: 0.68, harmonics: [{ ampRatio: 0.35, freqRatio: 2.3, speedRatio: 0.75, phase: 4.0 }], colors: ['#a0d2ec', '#b8e0f0'] },
  { amp: 30, freq: 0.0018, speed: 0.055, baseY: 0.64, harmonics: [{ ampRatio: 0.4, freqRatio: 2.5, speedRatio: 0.8, phase: 2.6 }], colors: ['#b8e0f0', '#d4ecf8'] },
  { amp: 32, freq: 0.0015, speed: 0.065, baseY: 0.60, harmonics: [{ ampRatio: 0.45, freqRatio: 2.5, speedRatio: 0.85, phase: 5.2 }], colors: ['#d4ecf8', '#e8f4fc'] },
  { amp: 35, freq: 0.0012, speed: 0.08, baseY: 0.56, harmonics: [{ ampRatio: 0.5, freqRatio: 3.0, speedRatio: 1.0, phase: 3.8 }], colors: ['#eef8fe', '#f6fbff'] }
];

const spots = [
  { x: 0.15, y: 0.82, r: 80, dx: 25, dy: 12, speed: 0.018, phase: 0 },
  { x: 0.35, y: 0.75, r: 100, dx: 20, dy: 10, speed: 0.022, phase: 1.2 },
  { x: 0.55, y: 0.68, r: 90, dx: 28, dy: 14, speed: 0.025, phase: 2.5 },
  { x: 0.75, y: 0.72, r: 110, dx: 22, dy: 11, speed: 0.028, phase: 3.8 },
  { x: 0.25, y: 0.62, r: 70, dx: 18, dy: 9, speed: 0.02, phase: 1.8 },
  { x: 0.85, y: 0.65, r: 85, dx: 24, dy: 13, speed: 0.03, phase: 4.5 },
  { x: 0.45, y: 0.58, r: 75, dx: 20, dy: 10, speed: 0.026, phase: 3.2 }
];

let waveColors;
let skyColor;
let horizonColor;
let depthRgb;

function readPalette() {
  // Canvas 不会自动继承 CSS 颜色，挂载时读取主题令牌，避免每帧触发计算样式。
  const style = getComputedStyle(document.documentElement);
  const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  waveColors = waves.map((wave, i) => [
    color(`--auth-wave-${i}`, wave.colors[0]),
    color(`--auth-wave-${i + 1}`, wave.colors[1])
  ]);
  skyColor = color('--auth-wave-sky', '#ffffff');
  horizonColor = color('--auth-wave-horizon', '#d0e8f4');
  depthRgb = color('--auth-wave-depth-rgb', '80,150,192');
}

watch(() => store.site.colorTheme, readPalette, { flush: 'post' });

function getColor(c1, c2, t) {
  const r = parseInt(c1.slice(1,3),16) * (1-t) + parseInt(c2.slice(1,3),16) * t;
  const g = parseInt(c1.slice(3,5),16) * (1-t) + parseInt(c2.slice(3,5),16) * t;
  const b = parseInt(c1.slice(5,7),16) * (1-t) + parseInt(c2.slice(5,7),16) * t;
  return `rgb(${r|0},${g|0},${b|0})`;
}

function drawWaves(ctx, w, h, time) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, skyColor);
  gradient.addColorStop(0.3, horizonColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const deepGrad = ctx.createLinearGradient(0, h * 0.85, 0, h);
  deepGrad.addColorStop(0, `rgba(${depthRgb},0)`);
  deepGrad.addColorStop(1, `rgba(${depthRgb},0.35)`);
  ctx.fillStyle = deepGrad;
  ctx.fillRect(0, h * 0.85, w, h * 0.15);

  waves.forEach((wave, i) => {
    const baseY = h * wave.baseY;
    const colorT = (Math.sin(time * 0.1 + i * 0.5) + 1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let x = 0; x <= w; x += 2) {
      let y = baseY;
      y += Math.sin(x * wave.freq + time * wave.speed) * wave.amp;
      wave.harmonics.forEach(harm => {
        y += Math.sin(x * wave.freq * harm.freqRatio + time * wave.speed * harm.speedRatio + harm.phase) * wave.amp * harm.ampRatio;
      });
      if (i === 0) {
        ctx.lineTo(x, Math.min(y, h));
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.lineTo(w, h);
    ctx.closePath();

    const fill = getColor(waveColors[i][0], waveColors[i][1], colorT);
    ctx.fillStyle = fill;
    ctx.fill();

    const foamAlpha = 0.2 + (wave.baseY - 0.35) * 0.25;
    ctx.strokeStyle = `rgba(255,255,255,${foamAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= w; x += 3) {
      let y = baseY;
      y += Math.sin(x * wave.freq + time * wave.speed) * wave.amp;
      wave.harmonics.forEach(harm => {
        y += Math.sin(x * wave.freq * harm.freqRatio + time * wave.speed * harm.speedRatio + harm.phase) * wave.amp * harm.ampRatio;
      });
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  spots.forEach(s => {
    const sx = w * s.x + Math.sin(time * s.speed + s.phase) * s.dx;
    const sy = h * s.y + Math.cos(time * s.speed * 0.8 + s.phase) * s.dy;
    const alpha = 0.12 + Math.sin(time * s.speed * 2 + s.phase) * 0.07;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.r);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function loop(ctx, canvas) {
  let time = 0;
  function frame() {
    time += 0.5;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawWaves(ctx, canvas.width, canvas.height, time);
    rafId = requestAnimationFrame(frame);
  }
  frame();
}

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  readPalette();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  loop(ctx, canvas);

  resizeHandler = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resizeHandler);
});

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId);
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
});
</script>

<template>
  <canvas ref="canvasRef" class="wave-bg" />
</template>

<style scoped>
.wave-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  display: block;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}
</style>
