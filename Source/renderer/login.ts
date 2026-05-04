const errorMsg = document.getElementById('error-msg') as HTMLParagraphElement;

function showError(msg: string): void {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function clearError(): void {
  errorMsg.classList.add('hidden');
}

// ── Tab switching ────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const target = btn.dataset['panel'];
    document.getElementById('signin-panel')?.classList.toggle('hidden', target !== 'signin');
    document.getElementById('signup-panel')?.classList.toggle('hidden', target !== 'signup');
    clearError();
  });
});

// ── Sign In ──────────────────────────────────────────────────────────────────

const signInBtn = document.getElementById('sign-in-btn') as HTMLButtonElement;
const usernameInput = document.getElementById('username') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;

signInBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  clearError();

  if (!username || !password) {
    showError('Please enter your username and password.');
    return;
  }

  signInBtn.disabled = true;
  signInBtn.textContent = 'Signing in...';

  const result = await window.electron.auth.start({ username, password });

  if (!result.success) {
    showError(result.error ?? 'Sign in failed. Please try again.');
    signInBtn.disabled = false;
    signInBtn.textContent = 'Sign In';
  }
});

// ── Create Account ───────────────────────────────────────────────────────────

const createBtn = document.getElementById('create-btn') as HTMLButtonElement;
const newUsernameInput = document.getElementById('new-username') as HTMLInputElement;
const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;

createBtn.addEventListener('click', async () => {
  const username = newUsernameInput.value.trim();
  const password = newPasswordInput.value;
  const confirm = confirmPasswordInput.value;
  clearError();

  if (!username || !password || !confirm) {
    showError('Please fill in all fields.');
    return;
  }

  if (password !== confirm) {
    showError('Passwords do not match.');
    return;
  }

  if (password.length < 8) {
    showError('Password must be at least 8 characters.');
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating account...';

  const result = await window.electron.auth.signup({ username, password });

  if (!result.success) {
    showError(result.error ?? 'Failed to create account. Please try again.');
    createBtn.disabled = false;
    createBtn.textContent = 'Create Account';
  }
});
