function parseJwt(token: string): Record<string, unknown> {
  const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? '';
  return JSON.parse(atob(base64)) as Record<string, unknown>;
}

async function init(): Promise<void> {
  const tokens = await window.electron.auth.getTokens();

  if (!tokens) {
    await window.electron.auth.logout();
    return;
  }

  const payload = parseJwt(tokens.idToken);
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = String(payload['email'] ?? '');
}

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await window.electron.auth.logout();
});

document.getElementById('new-project-btn')?.addEventListener('click', () => {
  // Project creation will be implemented in a future iteration
});

void init();
