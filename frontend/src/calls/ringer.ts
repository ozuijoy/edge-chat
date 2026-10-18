export function createCallRinger() {
  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  function stop() {
    clearInterval(timer);
    timer = undefined;
    if (context) void context.close().catch(() => {});
    context = null;
  }
  function start() {
    if (context || !globalThis.AudioContext) return;
    try { context = new AudioContext(); } catch { return; }
    const current = context;
    function ring() {
      if (current.state !== 'running') return;
      const gain = current.createGain();
      gain.gain.setValueAtTime(0, current.currentTime);
      gain.gain.linearRampToValueAtTime(0.035, current.currentTime + 0.04);
      gain.gain.setValueAtTime(0.035, current.currentTime + 0.7);
      gain.gain.linearRampToValueAtTime(0, current.currentTime + 0.8);
      gain.connect(current.destination);
      for (const frequency of [440, 480]) {
        const oscillator = current.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(current.currentTime + 0.85);
        oscillator.onended = () => { oscillator.disconnect(); };
      }
      setTimeout(() => gain.disconnect(), 1000);
    }
    // 自动播放被浏览器阻止时保留可视来电，不能为了响铃索取麦克风权限。
    void current.resume().then(ring).catch(() => {});
    timer = setInterval(ring, 3000);
  }
  return { start, stop };
}
