const languageMenu = document.querySelector('.language-menu');
const languageOptions = languageMenu?.querySelector('.language-options');

if (languageMenu && languageOptions) {
  const summary = languageMenu.querySelector('summary');
  languageOptions.hidden = true;
  document.body.appendChild(languageOptions);

  const positionOptions = () => {
    const rect = summary.getBoundingClientRect();
    languageOptions.style.top = `${rect.bottom + 14}px`;
    languageOptions.style.left = `${rect.left + rect.width / 2}px`;
  };

  languageMenu.addEventListener('toggle', () => {
    languageOptions.hidden = !languageMenu.open;

    if (languageMenu.open) {
      positionOptions();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!languageMenu.contains(event.target) && !languageOptions.contains(event.target)) {
      languageMenu.open = false;
    }
  });

  window.addEventListener('resize', positionOptions);
  window.addEventListener('scroll', positionOptions, { passive: true });
}
