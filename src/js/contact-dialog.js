const dialog = document.querySelector('#contact-dialog');
const openButton = document.querySelector('[data-open-contact]');

if (dialog && openButton) {
  const form = dialog.querySelector('.contact-form');
  const closeButton = dialog.querySelector('.dialog-close');
  const error = dialog.querySelector('.contact-error');

  openButton.addEventListener('click', () => {
    dialog.showModal();
  });

  closeButton.addEventListener('click', () => {
    dialog.close();
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  form.addEventListener('input', () => {
    error.hidden = true;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const data = new FormData(form);
    const name = data.get('name').trim();
    const email = data.get('email').trim();
    const phone = data.get('phone').trim();
    const message = data.get('message').trim();

    if (!email && !phone) {
      error.hidden = false;
      form.elements.email.focus();
      return;
    }

    const details = [
      message,
      '',
      name && `Name: ${name}`,
      email && `Email: ${email}`,
      phone && `Phone: ${phone}`,
    ].filter(Boolean).join('\n');
    const whatsappNumber = form.dataset.whatsappNumber.replace(/\D/g, '');
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(details)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    dialog.close();
    form.reset();
  });
}
