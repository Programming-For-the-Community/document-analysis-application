const signInBtn = document.getElementById('sign-in-btn') as HTMLButtonElement
const usernameInput = document.getElementById('username') as HTMLInputElement
const passwordInput = document.getElementById('password') as HTMLInputElement
const errorMsg = document.getElementById('error-msg') as HTMLParagraphElement

signInBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim()
  const password = passwordInput.value

  if (!username || !password) {
    errorMsg.textContent = 'Please enter your username and password.'
    errorMsg.classList.remove('hidden')
    return
  }

  signInBtn.disabled = true
  signInBtn.textContent = 'Signing in...'
  errorMsg.classList.add('hidden')

  const result = await window.electron.auth.start({ username, password })

  if (!result.success) {
    errorMsg.textContent = result.error ?? 'Sign in failed. Please try again.'
    errorMsg.classList.remove('hidden')
    signInBtn.disabled = false
    signInBtn.textContent = 'Sign In'
  }
})
