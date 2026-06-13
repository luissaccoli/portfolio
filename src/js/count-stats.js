const statValues = document.querySelectorAll('[data-count-value]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = 3000;

if (!reducedMotion) {
  statValues.forEach((element) => {
    const finalText = element.dataset.countValue;
    const match = finalText.match(/^(\d+(?:\.\d+)?)(.*)$/);

    if (!match) {
      return;
    }

    const target = Number(match[1]);
    const suffix = match[2];
    const decimals = match[1].includes('.') ? match[1].split('.')[1].length : 0;
    const startedAt = performance.now();
    element.textContent = `0${suffix}`;

    const update = (time) => {
      const progress = Math.min((time - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const value = target * eased;
      element.textContent = `${value.toFixed(decimals)}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = finalText;
      }
    };

    requestAnimationFrame(update);
  });
}
