function parseProjectJwt(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  return JSON.parse(atob(base64)) as Record<string, unknown>;
}

async function initProjectPage(): Promise<void> {
  const tokens = await window.electron.auth.getTokens();

  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseProjectJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = String(payload['email'] ?? '');

  const params = new URLSearchParams(window.location.search);
  const projectName = params.get('name') ?? 'Project';
  const nameEl = document.getElementById('project-name');
  if (nameEl) nameEl.textContent = projectName;

  document.title = `${projectName} — Document Analysis`;
}

document.getElementById('back-btn')?.addEventListener('click', async () => {
  await window.electron.nav.goHome();
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await window.electron.auth.logout();
});

void initProjectPage();
