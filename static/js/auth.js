import { login, register, requestRecovery } from './api.js';

document.getElementById('footerYear').textContent = new Date().getFullYear();

// --- Tabs y tema ---
const tabs = document.querySelectorAll('.auth-tab');
const loginWrap = document.getElementById('authFormLogin');
const registerWrap = document.getElementById('authFormRegister');

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('df_theme', next);
});

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    loginWrap.classList.toggle('hidden', !isLogin);
    registerWrap.classList.toggle('hidden', isLogin);
  });
});

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// --- Login ---
const form = document.getElementById('loginForm');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const emailError = document.getElementById('login-email-error');
const passwordError = document.getElementById('login-password-error');
const submitBtn = document.getElementById('login-submit');
const rememberChk = document.getElementById('loginRemember');

const savedEmail = localStorage.getItem('df_remembered_email');
if (savedEmail) {
  emailInput.value = savedEmail;
  rememberChk.checked = true;
}

function clearLoginError(input) {
  input.classList.remove('error');
  if (input === emailInput) emailError.textContent = '';
  if (input === passwordInput) passwordError.textContent = '';
}
emailInput.addEventListener('input', () => clearLoginError(emailInput));
passwordInput.addEventListener('input', () => clearLoginError(passwordInput));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let valid = true;
  if (!emailInput.value) {
    emailInput.classList.add('error');
    emailError.textContent = 'El correo electrónico es requerido';
    valid = false;
  } else if (!validateEmail(emailInput.value)) {
    emailInput.classList.add('error');
    emailError.textContent = 'Por favor ingresa un correo electrónico válido';
    valid = false;
  }
  if (!passwordInput.value) {
    passwordInput.classList.add('error');
    passwordError.textContent = 'La contraseña es requerida';
    valid = false;
  }
  if (!valid) return;

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading-spinner"></span> Cargando...';
  try {
    await login(emailInput.value, passwordInput.value, rememberChk.checked);
    if (rememberChk.checked) localStorage.setItem('df_remembered_email', emailInput.value);
    else localStorage.removeItem('df_remembered_email');
    window.location.href = '/dashboard';
  } catch (err) {
    emailInput.classList.add('error');
    passwordInput.classList.add('error');
    emailError.textContent = 'Credenciales incorrectas';
    passwordError.textContent = err.message || 'Error al iniciar sesión';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Iniciar Sesión';
  }
});

// --- Recuperar contraseña ---
const recoveryOverlay = document.getElementById('recoveryOverlay');
const recoverySubmit = document.getElementById('recoverySubmit');
const recoveryEmail = document.getElementById('recoveryEmail');
const recoveryError = document.getElementById('recoveryError');
const recoverySuccess = document.getElementById('recoverySuccess');

function openRecovery() {
  recoveryOverlay.classList.remove('hidden');
  recoveryEmail.value = emailInput.value || '';
  recoveryError.textContent = '';
  recoverySuccess.classList.add('hidden');
  recoverySubmit.disabled = false;
  recoverySubmit.textContent = 'Enviar Enlace';
}
function closeRecovery() { recoveryOverlay.classList.add('hidden'); }

document.getElementById('forgotLink').addEventListener('click', (e) => { e.preventDefault(); openRecovery(); });
document.getElementById('recoveryClose').addEventListener('click', closeRecovery);
document.getElementById('recoveryCancel').addEventListener('click', closeRecovery);
recoveryOverlay.addEventListener('click', (e) => { if (e.target === recoveryOverlay) closeRecovery(); });

recoverySubmit.addEventListener('click', async () => {
  const email = recoveryEmail.value.trim();
  if (!email || !validateEmail(email)) {
    recoveryError.textContent = 'Ingresa un correo válido';
    return;
  }
  recoveryError.textContent = '';
  recoverySubmit.disabled = true;
  recoverySubmit.innerHTML = '<span class="loading-spinner"></span> Enviando...';
  try {
    await requestRecovery(email);
    recoverySuccess.classList.remove('hidden');
    recoverySubmit.textContent = 'Enviado';
    setTimeout(closeRecovery, 3000);
  } catch (err) {
    recoveryError.textContent = err.message || 'Error al enviar el correo';
    recoverySubmit.disabled = false;
    recoverySubmit.textContent = 'Enviar Enlace';
  }
});

// --- Registro ---
const regForm = document.getElementById('registerForm');
const firstName = document.getElementById('register-first-name');
const lastName = document.getElementById('register-last-name');
const regEmail = document.getElementById('register-email');
const password = document.getElementById('register-password');
const confirmPassword = document.getElementById('register-confirm-password');
const acceptTerms = document.querySelector('[name="acceptTerms"]');
const errFirst = document.getElementById('reg-firstname-error');
const errLast = document.getElementById('reg-lastname-error');
const errEmail = document.getElementById('reg-email-error');
const errPass = document.getElementById('reg-password-error');
const errConfirm = document.getElementById('reg-confirm-error');
const errTerms = document.getElementById('reg-terms-error');
const regSubmit = document.getElementById('register-submit');

const errMap = {
  'register-first-name': errFirst,
  'register-last-name': errLast,
  'register-email': errEmail,
  'register-password': errPass,
  'register-confirm-password': errConfirm,
};
[firstName, lastName, regEmail, password, confirmPassword].forEach(inp => inp.addEventListener('input', () => {
  inp.classList.remove('error');
  errMap[inp.id].textContent = '';
}));
acceptTerms.addEventListener('change', () => { errTerms.textContent = ''; });

function fail(input, errEl, msg) {
  if (input) input.classList.add('error');
  errEl.textContent = msg;
  return false;
}

regForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  let valid = true;
  if (!firstName.value) valid = fail(firstName, errFirst, 'El nombre es requerido');
  if (!lastName.value) valid = fail(lastName, errLast, 'El apellido es requerido');
  if (!regEmail.value) valid = fail(regEmail, errEmail, 'El correo electrónico es requerido');
  else if (!validateEmail(regEmail.value)) valid = fail(regEmail, errEmail, 'Por favor ingresa un correo electrónico válido');
  if (!password.value) valid = fail(password, errPass, 'La contraseña es requerida');
  else if (password.value.length < 8) valid = fail(password, errPass, 'La contraseña debe tener al menos 8 caracteres');
  if (password.value !== confirmPassword.value) valid = fail(confirmPassword, errConfirm, 'Las contraseñas no coinciden');
  if (!acceptTerms.checked) valid = fail(null, errTerms, 'Debes aceptar los términos y condiciones');
  if (!valid) return;

  regSubmit.disabled = true;
  regSubmit.innerHTML = '<span class="loading-spinner"></span> Creando...';
  try {
    await register({
      firstName: firstName.value.trim(),
      lastName: lastName.value.trim(),
      clinic: document.getElementById('register-clinic').value.trim(),
      email: regEmail.value.trim(),
      password: password.value,
    });
    window.location.href = '/dashboard';
  } catch (err) {
    if (err.status === 409) fail(regEmail, errEmail, 'Este correo ya está registrado');
    else fail(regEmail, errEmail, err.message || 'Error al crear la cuenta');
    regSubmit.disabled = false;
    regSubmit.textContent = 'Crear Cuenta';
  }
});
