const phones = Array.from(document.querySelectorAll('.phone'));
const captions = Array.from(document.querySelectorAll('.work .caption, .work .final'));
const phoneSpeeds = [0.12, 0.15, 0.21, 0.18, 0.13, 0.19];

const updateParallax = () => {
  const viewportHeight = window.innerHeight;

  phones.forEach((el, index) => {
    const speed = phoneSpeeds[index % phoneSpeeds.length];
    const rect = el.getBoundingClientRect();
    const translateY = rect.top * speed - viewportHeight * speed * 0.4;
    const viewportPosition = ((rect.top + rect.height / 2) / viewportHeight) * 2 - 1;
    const shadowY = Math.max(-1, Math.min(1, viewportPosition)) * 24;

    el.style.setProperty('--parallax', `${translateY}px`);
    el.style.setProperty('--shadow-y', `${shadowY}px`);
  });

  captions.forEach((el) => {
    const speed = 0.08;
    const rect = el.getBoundingClientRect();
    const translateY = rect.top * speed - viewportHeight * speed * 0.4;
    el.style.setProperty('--parallax', `${translateY}px`);
  });
};

window.addEventListener('scroll', updateParallax, { passive: true });
window.addEventListener('resize', updateParallax);
updateParallax();
