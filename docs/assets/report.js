(function () {
  const root = document.documentElement;
  const themeButton = document.querySelector('[data-theme-toggle]');
  if (themeButton) {
    themeButton.addEventListener('click', () => {
      const dark = root.dataset.theme === 'dark';
      root.dataset.theme = dark ? 'light' : 'dark';
      themeButton.setAttribute('aria-pressed', String(!dark));
    });
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copy);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent || '');
        const original = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => { button.textContent = original; }, 1200);
      } catch (_) {
        button.textContent = 'Copy unavailable';
      }
    });
  });

  const search = document.querySelector('[data-search]');
  const method = document.querySelector('[data-method-filter]');
  const permission = document.querySelector('[data-permission-filter]');
  const applyFilters = () => {
    const query = (search?.value || '').trim().toLowerCase();
    const selectedMethod = method?.value || '';
    const selectedPermission = permission?.value || '';
    document.querySelectorAll('[data-endpoint]').forEach((entry) => {
      const haystack = entry.textContent.toLowerCase();
      const visible = (!query || haystack.includes(query))
        && (!selectedMethod || entry.dataset.method === selectedMethod)
        && (!selectedPermission || entry.dataset.permission === selectedPermission);
      entry.classList.toggle('hidden', !visible);
    });
    const count = document.querySelector('[data-result-count]');
    if (count) count.textContent = `${document.querySelectorAll('[data-endpoint]:not(.hidden)').length} endpoint(s) shown`;
  };
  [search, method, permission].filter(Boolean).forEach((control) => control.addEventListener('input', applyFilters));
  applyFilters();

  const top = document.querySelector('.back-to-top');
  if (top) top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();
