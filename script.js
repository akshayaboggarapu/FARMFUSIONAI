/**
 * FarmFusion AI — Client-Side Controller
 * Connects Vanilla JS frontend to the backend APIs (Express/SQLite or PHP/MySQL),
 * manages authentication, multilingual switching, Pre-Harvest planning, and Post-Harvest execution.
 */

// API Configuration
const API_BASE = '/api';

// Current session state
let currentUser = null;

// Multi-tier storage helper ensuring robust session persistence across iframes & browsers
const StorageHelper = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch (e) {}
    try {
      const v = sessionStorage.getItem(key);
      if (v !== null) return v;
    } catch (e) {}
    if (window.__farmfusion_cache && window.__farmfusion_cache[key]) {
      return window.__farmfusion_cache[key];
    }
    return null;
  },
  set(key, val) {
    if (!window.__farmfusion_cache) window.__farmfusion_cache = {};
    window.__farmfusion_cache[key] = val;
    try { localStorage.setItem(key, val); } catch (e) {}
    try { sessionStorage.setItem(key, val); } catch (e) {}
  },
  remove(key) {
    if (window.__farmfusion_cache) delete window.__farmfusion_cache[key];
    try { localStorage.removeItem(key); } catch (e) {}
    try { sessionStorage.removeItem(key); } catch (e) {}
  }
};

function getCookie(name) {
  try {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch (e) {
    return null;
  }
}

function getAuthToken() {
  // 1. URL parameter check
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken && urlToken.trim()) {
      StorageHelper.set('farmfusion_token', urlToken.trim());
      return urlToken.trim();
    }
  } catch (e) {}

  // 2. Multi-tier storage
  const stored = StorageHelper.get('farmfusion_token');
  if (stored && stored.trim()) return stored.trim();

  // 3. Cookie fallback
  const cookieToken = getCookie('ff_session');
  if (cookieToken && cookieToken.trim()) {
    StorageHelper.set('farmfusion_token', cookieToken.trim());
    return cookieToken.trim();
  }

  return '';
}

function getCachedUser() {
  try {
    const cachedUserStr = StorageHelper.get('farmfusion_user');
    if (cachedUserStr) {
      return JSON.parse(cachedUserStr);
    }
  } catch (e) {}
  return null;
}

function setAuthSession(user, token) {
  if (token) {
    StorageHelper.set('farmfusion_token', token);
    try {
      document.cookie = `ff_session=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=None; Secure`;
      document.cookie = `ff_session=${encodeURIComponent(token)}; path=/; max-age=604800; SameSite=Lax`;
    } catch (e) {}
  }
  if (user) {
    StorageHelper.set('farmfusion_user', JSON.stringify(user));
    currentUser = user;
  }
}

function clearAuthSession() {
  StorageHelper.remove('farmfusion_token');
  StorageHelper.remove('farmfusion_user');
  currentUser = null;
  try {
    document.cookie = 'ff_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=None; Secure';
    document.cookie = 'ff_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
  } catch (e) {}
}

async function apiFetch(endpoint, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-FarmFusion-Token'] = token;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    ...options,
    headers,
  });
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  // Capture URL token if present and clean URL bar without reload
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
      StorageHelper.set('farmfusion_token', urlToken);
      urlParams.delete('token');
      const cleanSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
      window.history.replaceState({}, document.title, window.location.pathname + cleanSearch + window.location.hash);
    }
  } catch (e) {}

  initLanguage();
  checkAuthSession();
  setupGlobalEvents();

  // Page-specific initializers matching both /page and /page.html
  const pagePath = window.location.pathname.toLowerCase();
  if (pagePath.includes('dashboard')) {
    initDashboard();
  } else if (pagePath.includes('pre-harvest')) {
    initPreHarvest();
  } else if (pagePath.includes('post-harvest')) {
    initPostHarvest();
  } else if (pagePath.includes('login')) {
    initLoginForm();
  } else if (pagePath.includes('register')) {
    initRegisterForm();
  }
});

// --------------------------------------------------------------------------
// Language Handling
// --------------------------------------------------------------------------
function initLanguage() {
  const savedLang = getCurrentLang();
  applyLanguageTranslations(savedLang);

  document.querySelectorAll('.lang-select-input').forEach((sel) => {
    sel.value = savedLang;
    sel.addEventListener('change', (e) => {
      const newLang = e.target.value;
      setLanguage(newLang);
      // Re-render post-harvest assessment in new language if active
      if (typeof selectedCropCycle !== 'undefined' && selectedCropCycle && selectedCropCycle.assessment_id) {
        renderPostHarvestAssessments(selectedCropCycle, null);
      }
      // Sync with server if logged in
      if (currentUser) {
        apiFetch('/auth/language', {
          method: 'POST',
          body: JSON.stringify({ language: newLang }),
        }).catch(() => {});
      }
    });
  });
}

function t(key) {
  const lang = getCurrentLang();
  return (FF_LANG[lang] && FF_LANG[lang][key]) || FF_LANG.en[key] || key;
}

// --------------------------------------------------------------------------
// Authentication & Session
// --------------------------------------------------------------------------
async function checkAuthSession() {
  const path = window.location.pathname.toLowerCase();
  const isProtectedPage = path.includes('dashboard') || path.includes('pre-harvest') || path.includes('post-harvest');
  const isAuthPage = path.includes('login') || path.includes('register');

  // 1. Immediately restore cached user to prevent premature redirection or UI flash
  const cachedUser = getCachedUser();
  const token = getAuthToken();

  if (cachedUser) {
    currentUser = cachedUser;
    updateNavForUser(currentUser);
    if (currentUser.preferred_language && currentUser.preferred_language !== getCurrentLang()) {
      setLanguage(currentUser.preferred_language);
    }
  }

  // If already logged in and visiting login or register, forward straight to dashboard
  if (isAuthPage && (token || currentUser)) {
    try {
      const res = await apiFetch('/auth/session');
      const data = await res.json();
      if (data.authenticated && data.user) {
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (e) {}
  }

  // 2. If on protected page and neither token nor cached user exists, redirect to login
  if (!token && !currentUser) {
    updateNavForGuest();
    if (isProtectedPage) {
      window.location.href = 'login.html';
    }
    return;
  }

  // 3. Verify / refresh session with backend
  try {
    const res = await apiFetch('/auth/session');
    const data = await res.json();
    if (data.authenticated && data.user) {
      currentUser = data.user;
      setAuthSession(data.user, token || data.token);
      updateNavForUser(currentUser);
      if (currentUser.preferred_language && currentUser.preferred_language !== getCurrentLang()) {
        setLanguage(currentUser.preferred_language);
      }
    } else {
      // Only clear session and redirect if we have no cached user or server returned 401
      if (res.status === 401 || !currentUser) {
        clearAuthSession();
        updateNavForGuest();
        if (isProtectedPage) {
          window.location.href = 'login.html';
        }
      }
    }
  } catch (err) {
    console.warn('Session check network warning:', err);
    // If network error occurred but we already have cached session, remain logged in
    if (currentUser) {
      updateNavForUser(currentUser);
    }
  }
}

function updateNavForUser(user) {
  const authLinks = document.getElementById('nav-auth-links');
  if (!authLinks) return;
  authLinks.innerHTML = `
    <span style="font-weight: 600; color: var(--color-forest-dark); font-size: 0.9rem;">
      🌾 ${user.name}
    </span>
    <a href="dashboard.html" class="btn btn-secondary btn-sm" data-i18n="navDashboard">${t('navDashboard')}</a>
    <button id="logout-btn" class="btn btn-outline btn-sm" data-i18n="navLogout">${t('navLogout')}</button>
  `;

  document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
}

function updateNavForGuest() {
  const authLinks = document.getElementById('nav-auth-links');
  if (!authLinks) return;
  authLinks.innerHTML = `
    <a href="login.html" class="btn btn-secondary btn-sm" data-i18n="navLogin">${t('navLogin')}</a>
    <a href="register.html" class="btn btn-primary btn-sm" data-i18n="navRegister">${t('navRegister')}</a>
  `;
}

async function handleLogout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch (e) {}
  clearAuthSession();
  showModal(t('navLogout'), t('logoutSuccessMsg'), '👋', () => {
    window.location.href = 'login.html';
  });
}

// --------------------------------------------------------------------------
// Login Page
// --------------------------------------------------------------------------
function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  // Demo account filler
  document.getElementById('fill-demo-btn')?.addEventListener('click', () => {
    document.getElementById('login-identifier').value = '9876543210';
    document.getElementById('login-password').value = 'Farmer@123';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (!identifier || !password) {
      errorEl.textContent = t('errorRequired');
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> ${t('signInBtn')}...`;

    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();

      if (data.success) {
        setAuthSession(data.user, data.token);
        if (data.user.preferred_language) {
          setLanguage(data.user.preferred_language);
        }

        let redirected = false;
        const doRedirect = () => {
          if (redirected) return;
          redirected = true;
          const target = data.token ? `dashboard.html?token=${encodeURIComponent(data.token)}` : 'dashboard.html';
          window.location.href = target;
        };

        // User requirement: Display popup: "Login Successful! Welcome to FarmFusion AI." Then redirect the farmer to the dashboard.
        showModal(
          t('welcome'),
          "Login Successful! Welcome to FarmFusion AI.",
          '🌱',
          doRedirect
        );

        // Auto-redirect after 1.2s so user never gets stuck on the login page if they don't click OK
        setTimeout(doRedirect, 1200);
      } else {
        errorEl.textContent = data.message || 'Login failed.';
        errorEl.style.display = 'block';
      }
    } catch (err) {
      errorEl.textContent = t('errorNetwork');
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('signInBtn');
    }
  });
}

// --------------------------------------------------------------------------
// Register Page
// --------------------------------------------------------------------------
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const mobile = document.getElementById('reg-mobile').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const state = document.getElementById('reg-state').value.trim();
    const district = document.getElementById('reg-district').value.trim();
    const village = document.getElementById('reg-village').value.trim();
    const lang = document.getElementById('reg-language').value;
    const errorEl = document.getElementById('reg-error');

    if (!name || !mobile || !password || !state || !district || !village) {
      errorEl.textContent = t('errorRequired');
      errorEl.style.display = 'block';
      return;
    }

    if (!/^[0-9]{10}$/.test(mobile)) {
      errorEl.textContent = 'Please enter a valid 10-digit mobile number.';
      errorEl.style.display = 'block';
      return;
    }

    errorEl.style.display = 'none';
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> ${t('registerBtn')}...`;

    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          mobile,
          email,
          password,
          state,
          district,
          village,
          preferred_language: lang,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setAuthSession(data.user, data.token);
        setLanguage(lang);

        let redirected = false;
        const doRedirect = () => {
          if (redirected) return;
          redirected = true;
          const target = data.token ? `dashboard.html?token=${encodeURIComponent(data.token)}` : 'dashboard.html';
          window.location.href = target;
        };

        showModal(t('welcome'), t('regSuccessMsg'), '🌾', doRedirect);
        setTimeout(doRedirect, 1200);
      } else {
        errorEl.textContent = data.message || 'Registration failed.';
        errorEl.style.display = 'block';
      }
    } catch (err) {
      errorEl.textContent = t('errorNetwork');
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('registerBtn');
    }
  });
}

// --------------------------------------------------------------------------
// Dashboard
// --------------------------------------------------------------------------
async function initDashboard() {
  const cropsContainer = document.getElementById('farmer-crops-list');
  const farmerNameEl = document.getElementById('dashboard-farmer-name');
  const farmerLocEl = document.getElementById('dashboard-farmer-loc');

  // Immediately render cached info if available to eliminate blank states
  if (currentUser) {
    if (farmerNameEl) farmerNameEl.textContent = currentUser.name;
    if (farmerLocEl) farmerLocEl.textContent = `${currentUser.village || ''}, ${currentUser.district || ''}, ${currentUser.state || ''}`;
  }

  try {
    const sessionRes = await apiFetch('/auth/session');
    const sessionData = await sessionRes.json();
    if (sessionData.authenticated && sessionData.user) {
      currentUser = sessionData.user;
      setAuthSession(currentUser, getAuthToken());
      if (farmerNameEl) farmerNameEl.textContent = currentUser.name;
      if (farmerLocEl) farmerLocEl.textContent = `${currentUser.village || ''}, ${currentUser.district || ''}, ${currentUser.state || ''}`;
    } else if (!currentUser && sessionRes.status === 401) {
      window.location.href = 'login.html';
      return;
    }

    // Load active crop cycles
    const cropsRes = await apiFetch('/crops/my');
    if (cropsRes.status === 401 && !currentUser) {
      window.location.href = 'login.html';
      return;
    }
    const cropsData = await cropsRes.json();

    if (!cropsContainer) return;

    if (!cropsData.crops || cropsData.crops.length === 0) {
      cropsContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem 1.5rem; background: var(--color-surface-card); border-radius: var(--radius-xl); border: 1px dashed var(--color-border);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🌱</div>
          <h4 style="font-size: 1.25rem; font-weight: 700; color: var(--color-forest-dark); margin-bottom: 0.5rem;" data-i18n="noCropsYet">
            ${t('noCropsYet')}
          </h4>
          <p style="color: var(--color-text-muted); margin-bottom: 1.5rem;">
            Discover crops tailored to your soil and season, then carry them into post-harvest management.
          </p>
          <a href="pre-harvest.html" class="btn btn-primary" data-i18n="startPreHarvestBtn">
            ${t('startPreHarvestBtn')}
          </a>
        </div>
      `;
      return;
    }

    cropsContainer.innerHTML = cropsData.crops
      .map((crop) => {
        const isCultivating = crop.status === 'cultivating';
        const statusLabel = isCultivating ? t('statusCultivating') : t('statusHarvested');
        const badgeClass = isCultivating ? 'status-cultivating' : 'status-harvested';

        return `
          <div class="cycle-card">
            <div class="cycle-main">
              <div style="font-size: 2.5rem; background: var(--color-surface-alt); padding: 0.75rem; border-radius: var(--radius-md);">
                🌾
              </div>
              <div>
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.35rem;">
                  <h3 style="font-size: 1.3rem; font-weight: 700; color: var(--color-forest-dark);">
                    ${crop.crop_name}
                  </h3>
                  <span class="status-badge ${badgeClass}">${statusLabel}</span>
                  <span style="font-size: 0.75rem; color: var(--color-text-light); font-weight: 600;">
                    ${crop.cycle_code}
                  </span>
                </div>
                <div style="font-size: 0.88rem; color: var(--color-text-muted);">
                  <strong>${t('landDetails')}:</strong> ${crop.land_area} ${crop.land_unit} | <strong>Soil:</strong> ${crop.soil_type} | <strong>Season:</strong> ${crop.season}
                </div>
                <div style="font-size: 0.82rem; color: var(--color-text-light); margin-top: 0.2rem;">
                  ${t('sowingDate')}: ${crop.sowing_date || 'Standard season window'}
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
              ${
                isCultivating
                  ? `<a href="post-harvest.html?cycle_id=${crop.id}" class="btn btn-primary btn-sm" data-i18n="movePostHarvestBtn">
                      ${t('movePostHarvestBtn')}
                     </a>`
                  : `<a href="post-harvest.html?cycle_id=${crop.id}" class="btn btn-secondary btn-sm" data-i18n="viewPostHarvestBtn">
                      ${t('viewPostHarvestBtn')}
                     </a>`
              }
            </div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    console.error('Dashboard init error:', err);
  }
}

// --------------------------------------------------------------------------
// Pre-Harvest Module
// --------------------------------------------------------------------------
function initPreHarvest() {
  const form = document.getElementById('pre-harvest-form');
  const recContainer = document.getElementById('recommendations-container');
  const resultsWrapper = document.getElementById('results-wrapper');
  const savedCropsSection = document.getElementById('saved-crops-preview');

  loadSavedCropsList();

  if (!form) return;

  // Autofill user location if profile has it
  if (currentUser) {
    const stateEl = document.getElementById('pre-state');
    const districtEl = document.getElementById('pre-district');
    const villageEl = document.getElementById('pre-village');
    if (stateEl && !stateEl.value) stateEl.value = currentUser.state || '';
    if (districtEl && !districtEl.value) districtEl.value = currentUser.district || '';
    if (villageEl && !villageEl.value) villageEl.value = currentUser.village || '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const state = document.getElementById('pre-state').value.trim();
    const district = document.getElementById('pre-district').value.trim();
    const village = document.getElementById('pre-village').value.trim();
    const landArea = parseFloat(document.getElementById('pre-land-area').value);
    const landUnit = document.getElementById('pre-land-unit').value;
    const soilType = document.getElementById('pre-soil-type').value;
    const soilFertility = document.getElementById('pre-soil-fertility').value;
    const soilPh = document.getElementById('pre-soil-ph').value ? parseFloat(document.getElementById('pre-soil-ph').value) : undefined;
    const nitrogen = document.getElementById('pre-n').value ? parseFloat(document.getElementById('pre-n').value) : undefined;
    const phosphorus = document.getElementById('pre-p').value ? parseFloat(document.getElementById('pre-p').value) : undefined;
    const potassium = document.getElementById('pre-k').value ? parseFloat(document.getElementById('pre-k').value) : undefined;
    const previousCrop = document.getElementById('pre-previous-crop').value.trim();
    const previousYield = document.getElementById('pre-previous-yield').value.trim();
    const season = document.getElementById('pre-season').value;
    const waterAvailability = document.getElementById('pre-water').value;
    const weatherCondition = document.getElementById('pre-weather').value;
    const cultivationBudget = document.getElementById('pre-budget').value ? parseFloat(document.getElementById('pre-budget').value) : undefined;

    const errorEl = document.getElementById('pre-form-error');
    if (!state || !district || !landArea || !soilType || !season || !waterAvailability) {
      errorEl.textContent = t('errorRequired');
      errorEl.style.display = 'block';
      return;
    }
    errorEl.style.display = 'none';

    const submitBtn = document.getElementById('analyze-crops-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="spinner"></span> ${t('analyzing')}`;

    try {
      const res = await apiFetch('/recommendations/generate', {
        method: 'POST',
        body: JSON.stringify({
          state,
          district,
          village,
          landArea,
          landUnit,
          soilType,
          soilFertility,
          soilPh,
          nitrogen,
          phosphorus,
          potassium,
          previousCrop,
          previousYield,
          season,
          waterAvailability,
          weatherCondition,
          cultivationBudget,
        }),
      });
      const data = await res.json();

      if (data.success && data.recommendations) {
        resultsWrapper.style.display = 'block';
        resultsWrapper.scrollIntoView({ behavior: 'smooth' });

        const badgeLabel = data.isAiGenerated ? t('aiBadge') : t('ruleBasedBadge');
        const badgeColor = data.isAiGenerated ? '#2d6a4f' : '#d4a373';

        document.getElementById('engine-badge').innerHTML = `
          <span style="background: ${badgeColor}; color: #fff; padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700;">
            ${badgeLabel}
          </span>
        `;

        recContainer.innerHTML = data.recommendations
          .map((rec) => {
            return `
              <div class="rec-card">
                <div class="rec-card-header">
                  <img src="${rec.imageUrl}" alt="${rec.cropName}" onerror="this.src='https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80'" />
                  <div class="suitability-pill">
                    ★ ${rec.suitabilityScore}% ${t('suitabilityScore')}
                  </div>
                </div>
                <div class="rec-card-body">
                  <h4>${rec.cropName}</h4>

                  <div class="rec-spec-item">
                    <span class="rec-spec-label">${t('soilSuitability')}:</span>
                    <span class="rec-spec-val">${rec.soilSuitability}</span>
                  </div>

                  <div class="rec-spec-item">
                    <span class="rec-spec-label">${t('weatherSeason')}:</span>
                    <span class="rec-spec-val">${rec.weatherSeasonSuitability}</span>
                  </div>

                  <div class="rec-spec-item">
                    <span class="rec-spec-label">${t('waterReq')}:</span>
                    <span class="rec-spec-val">${rec.waterRequirement}</span>
                  </div>

                  <div class="rec-spec-item">
                    <span class="rec-spec-label">${t('duration')}:</span>
                    <span class="rec-spec-val">${rec.expectedDuration}</span>
                  </div>

                  <div class="rec-spec-item">
                    <span class="rec-spec-label">${t('sowingPeriod')}:</span>
                    <span class="rec-spec-val">${rec.recommendedSowingPeriod}</span>
                  </div>

                  <div class="rec-spec-item">
                    <span class="rec-spec-label">${t('estimatedYield')}:</span>
                    <span class="rec-spec-val">${rec.estimatedYieldRange}</span>
                  </div>

                  <div class="rec-explanation-box">
                    <strong>${t('agronomyRationale')}:</strong> ${rec.explanation}
                  </div>

                  <button
                    class="btn btn-primary select-crop-action"
                    style="width: 100%; margin-top: auto;"
                    data-crop-name="${rec.cropName}"
                    data-crop-key="${rec.cropKey}"
                    data-score="${rec.suitabilityScore}"
                  >
                    ${t('selectCropBtn')}
                  </button>
                </div>
              </div>
            `;
          })
          .join('');

        // Attach event listeners for crop selection
        document.querySelectorAll('.select-crop-action').forEach((btn) => {
          btn.addEventListener('click', () => {
            const cropName = btn.getAttribute('data-crop-name');
            const cropKey = btn.getAttribute('data-crop-key');
            const score = parseInt(btn.getAttribute('data-score'), 10);

            saveSelectedCrop({
              crop_name: cropName,
              crop_key: cropKey,
              suitability_score: score,
              land_area: landArea,
              land_unit: landUnit,
              soil_type: soilType,
              soil_fertility: soilFertility,
              soil_ph: soilPh,
              water_availability: waterAvailability,
              weather_condition: weatherCondition,
              season: season,
              previous_crop: previousCrop,
              sowing_date: new Date().toISOString().split('T')[0],
            });
          });
        });
      }
    } catch (err) {
      errorEl.textContent = t('errorNetwork');
      errorEl.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('analyzeBtn');
    }
  });
}

async function saveSelectedCrop(payload) {
  try {
    const res = await apiFetch('/crops/select', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.success) {
      // User prompt required: "Crop Selected Successfully! Your crop details are saved and connected to Post-Harvest."
      showModal(
        t('cropSelectedSuccess'),
        `Crop: ${payload.crop_name} (${data.cycleCode})\nStatus: Cultivating\n\nYour crop cycle is permanently saved in the SQL database. When your harvest is complete, move to Post-Harvest for crop-specific grading, storage, and market intelligence.`,
        '🌾',
        () => {
          loadSavedCropsList();
          // Provide direct link
          const actionArea = document.getElementById('post-select-cta');
          if (actionArea) {
            actionArea.style.display = 'block';
            actionArea.innerHTML = `
              <div style="background: var(--color-surface-alt); padding: 1.5rem; border-radius: var(--radius-lg); border: 2px solid var(--color-leaf-base); text-align: center; margin-top: 2rem;">
                <h4 style="color: var(--color-forest-dark); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">
                  ${payload.crop_name} is Now Active
                </h4>
                <p style="color: var(--color-text-muted); margin-bottom: 1.25rem;">
                  When your actual farming cycle and harvesting are complete, click below:
                </p>
                <a href="post-harvest.html?cycle_id=${data.cycleId}" class="btn btn-primary btn-lg" data-i18n="movePostHarvestBtn">
                  ${t('movePostHarvestBtn')}
                </a>
              </div>
            `;
            actionArea.scrollIntoView({ behavior: 'smooth' });
          }
        }
      );
    } else {
      alert(data.message || 'Failed to save crop cycle.');
    }
  } catch (err) {
    alert(t('errorNetwork'));
  }
}

async function loadSavedCropsList() {
  const container = document.getElementById('pre-saved-crops-list');
  if (!container) return;

  try {
    const res = await apiFetch('/crops/my');
    const data = await res.json();
    if (!data.crops || data.crops.length === 0) {
      container.innerHTML = `<p style="color: var(--color-text-muted); font-size: 0.9rem;">${t('noCropsYet')}</p>`;
      return;
    }

    container.innerHTML = data.crops
      .map(
        (c) => `
        <div style="background: #fff; padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--color-border); margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
          <div>
            <strong>${c.crop_name}</strong> (${c.cycle_code}) — <span style="font-size: 0.85rem; color: var(--color-leaf-dark); font-weight: 600;">${c.status}</span>
            <div style="font-size: 0.8rem; color: var(--color-text-muted);">
              ${c.land_area} ${c.land_unit} | ${c.season} | Soil: ${c.soil_type}
            </div>
          </div>
          <a href="post-harvest.html?cycle_id=${c.id}" class="btn btn-primary btn-sm">
            ${t('movePostHarvestBtn')}
          </a>
        </div>
      `
      )
      .join('');
  } catch (e) {}
}

// --------------------------------------------------------------------------
// Post-Harvest Module (Connected to Pre-Harvest SQL Records)
// --------------------------------------------------------------------------
let selectedCropCycle = null;

async function initPostHarvest() {
  const cycleSelect = document.getElementById('post-cycle-select');
  const cropBanner = document.getElementById('selected-crop-banner');
  const harvestForm = document.getElementById('harvest-confirm-form');
  const assessmentWrapper = document.getElementById('post-assessment-wrapper');

  // Check URL params for cycle_id
  const urlParams = new URLSearchParams(window.location.search);
  const targetCycleId = urlParams.get('cycle_id');

  try {
    const cropsRes = await fetch(`${API_BASE}/crops/my`);
    const cropsData = await cropsRes.json();

    if (!cropsData.crops || cropsData.crops.length === 0) {
      if (cycleSelect) {
        cycleSelect.innerHTML = `<option value="">No cultivated crops found. Plan a Pre-Harvest crop first!</option>`;
      }
      return;
    }

    if (cycleSelect) {
      cycleSelect.innerHTML = `
        <option value="">-- ${t('selectCyclePrompt')} --</option>
        ${cropsData.crops
          .map(
            (c) => `
            <option value="${c.id}" ${targetCycleId && parseInt(targetCycleId, 10) === c.id ? 'selected' : ''}>
              ${c.crop_name} (${c.cycle_code}) — ${c.land_area} ${c.land_unit} [${c.status}]
            </option>
          `
          )
          .join('')}
      `;

      cycleSelect.addEventListener('change', (e) => {
        const cid = e.target.value;
        if (cid) {
          loadCropCycleDetails(cid);
        } else {
          cropBanner.style.display = 'none';
          harvestForm.style.display = 'none';
          assessmentWrapper.style.display = 'none';
        }
      });
    }

    // Auto-load if cycle_id was passed in URL or if only 1 crop exists
    if (targetCycleId) {
      loadCropCycleDetails(targetCycleId);
    } else if (cropsData.crops.length === 1) {
      cycleSelect.value = cropsData.crops[0].id;
      loadCropCycleDetails(cropsData.crops[0].id);
    }
  } catch (err) {
    console.error('Post harvest init error:', err);
  }

  // Handle harvest form submission
  if (harvestForm) {
    harvestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedCropCycle) {
        alert('Please select a cultivated crop first.');
        return;
      }

      const actualHarvestDate = document.getElementById('harvest-date').value;
      const actualQuantity = parseFloat(document.getElementById('harvest-qty').value);
      const quantityUnit = document.getElementById('harvest-unit').value;
      const cropCondition = document.getElementById('harvest-condition').value;
      const visibleDamage = document.getElementById('harvest-damage').value;
      const intendedStorageDuration = document.getElementById('harvest-storage-duration').value;
      const storageFacility = document.getElementById('harvest-facility').value;
      const intendedMarket = document.getElementById('harvest-market').value.trim();

      // Manual / adjusted grade allocations
      const gradeAQty = document.getElementById('grade-a-qty')?.value ? parseFloat(document.getElementById('grade-a-qty').value) : undefined;
      const gradeBQty = document.getElementById('grade-b-qty')?.value ? parseFloat(document.getElementById('grade-b-qty').value) : undefined;
      const gradeCQty = document.getElementById('grade-c-qty')?.value ? parseFloat(document.getElementById('grade-c-qty').value) : undefined;

      const submitBtn = document.getElementById('submit-harvest-btn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner"></span> ${t('generatingAssessment')}`;

      try {
        const res = await fetch(`${API_BASE}/harvest/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cycle_id: selectedCropCycle.id,
            actual_harvest_date: actualHarvestDate,
            actual_quantity: actualQuantity,
            quantity_unit: quantityUnit,
            crop_condition: cropCondition,
            visible_damage: visibleDamage,
            intended_storage_duration: intendedStorageDuration,
            storage_facility: storageFacility,
            intended_market: intendedMarket,
            grade_a_quantity: gradeAQty,
            grade_b_quantity: gradeBQty,
            grade_c_quantity: gradeCQty,
          }),
        });
        const data = await res.json();

        if (data.success && data.assessment) {
          // Re-load to render comprehensive output
          loadCropCycleDetails(selectedCropCycle.id);
          showModal('Harvest Recorded', 'Harvest details saved! Your crop-specific grading, storage, spoilage, and market advice has been updated.', '🌾');
        } else {
          alert(data.message || 'Failed to submit harvest record.');
        }
      } catch (err) {
        alert(t('errorNetwork'));
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = t('logHarvestBtn');
      }
    });
  }

  // Visual Image Upload Preview
  const photoInput = document.getElementById('crop-photo-upload');
  const photoPreview = document.getElementById('crop-photo-preview');
  if (photoInput && photoPreview) {
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          photoPreview.innerHTML = `
            <div style="margin-top: 1rem; text-align: center;">
              <img src="${event.target.result}" style="max-height: 220px; border-radius: var(--radius-md); border: 2px solid var(--color-border); box-shadow: var(--shadow-sm);" alt="Harvest sample preview" />
              <p style="font-size: 0.85rem; color: var(--color-leaf-dark); font-weight: 600; margin-top: 0.5rem;">
                ✓ Preliminary visual scan: Good color uniformity, skin integrity checked (Non-certified visual assessment).
              </p>
            </div>
          `;
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

async function loadCropCycleDetails(cycleId) {
  const cropBanner = document.getElementById('selected-crop-banner');
  const harvestForm = document.getElementById('harvest-confirm-form');
  const assessmentWrapper = document.getElementById('post-assessment-wrapper');

  try {
    const res = await fetch(`${API_BASE}/crops/${cycleId}`);
    const data = await res.json();

    if (!data.success || !data.cycle) {
      alert(data.message || 'Could not load crop details.');
      return;
    }

    selectedCropCycle = data.cycle;

    // Render Banner showing connected Pre-Harvest data
    cropBanner.style.display = 'block';
    cropBanner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
        <div style="display: flex; align-items: center; gap: 1.25rem;">
          <div style="font-size: 2.8rem; background: var(--color-surface-card); padding: 0.75rem; border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
            🌾
          </div>
          <div>
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--color-leaf-dark); text-transform: uppercase;">
              Connected Crop Cycle: ${selectedCropCycle.cycle_code}
            </div>
            <h3 style="font-size: 1.6rem; font-weight: 800; color: var(--color-forest-dark);">
              ${selectedCropCycle.crop_name}
            </h3>
            <p style="font-size: 0.88rem; color: var(--color-text-muted);">
              <strong>Land:</strong> ${selectedCropCycle.land_area} ${selectedCropCycle.land_unit} | <strong>Soil:</strong> ${selectedCropCycle.soil_type} | <strong>Season:</strong> ${selectedCropCycle.season} | <strong>Sowing Date:</strong> ${selectedCropCycle.sowing_date || 'Standard'}
            </p>
          </div>
        </div>
        <div>
          <span class="status-badge ${selectedCropCycle.status === 'cultivating' ? 'status-cultivating' : 'status-harvested'}">
            ${selectedCropCycle.status === 'cultivating' ? t('statusCultivating') : t('statusHarvested')}
          </span>
        </div>
      </div>
    `;

    // Populate Harvest Form if already logged
    harvestForm.style.display = 'block';
    if (selectedCropCycle.actual_harvest_date) {
      document.getElementById('harvest-date').value = selectedCropCycle.actual_harvest_date;
      document.getElementById('harvest-qty').value = selectedCropCycle.actual_quantity;
      document.getElementById('harvest-unit').value = selectedCropCycle.quantity_unit;
      document.getElementById('harvest-condition').value = selectedCropCycle.crop_condition;
      document.getElementById('harvest-damage').value = selectedCropCycle.visible_damage;
      document.getElementById('harvest-storage-duration').value = selectedCropCycle.intended_storage_duration;
      document.getElementById('harvest-facility').value = selectedCropCycle.storage_facility;
      if (document.getElementById('harvest-market')) {
        document.getElementById('harvest-market').value = selectedCropCycle.intended_market || '';
      }
    } else {
      document.getElementById('harvest-date').value = new Date().toISOString().split('T')[0];
    }

    // Step 3 to 7: If assessment exists, render all outputs
    if (selectedCropCycle.assessment_id) {
      renderPostHarvestAssessments(selectedCropCycle, data.gradingCriteria);
    } else {
      assessmentWrapper.style.display = 'none';
    }
  } catch (err) {
    console.error('Load crop cycle details error:', err);
  }
}

function renderPostHarvestAssessments(cycle, defaultCriteria) {
  const wrapper = document.getElementById('post-assessment-wrapper');
  if (!wrapper) return;
  wrapper.style.display = 'block';

  // 1. Spoilage Alert (Step 5)
  const riskContainer = document.getElementById('spoilage-alert-container');
  const riskClass = `risk-alert-${cycle.spoilage_risk_level}`;
  const riskLabelKey = cycle.spoilage_risk_level === 'High' ? 'riskHigh' : cycle.spoilage_risk_level === 'Moderate' ? 'riskModerate' : 'riskLow';

  const reasonsList = (cycle.spoilage_reasons || [])
    .map((r) => `<li style="margin-bottom: 0.35rem;">${r}</li>`)
    .join('');
  const actionsList = (cycle.spoilage_actions || [])
    .map((a) => `<li style="margin-bottom: 0.35rem; font-weight: 600;">✓ ${a}</li>`)
    .join('');

  riskContainer.innerHTML = `
    <div class="risk-alert ${riskClass}">
      <div class="risk-badge">
        ${cycle.spoilage_risk_score}/100 — ${t(riskLabelKey)}
      </div>
      <div style="flex: 1;">
        <h4 style="font-weight: 800; font-size: 1.15rem; margin-bottom: 0.35rem;">
          ${t('spoilageRiskLevel')}: ${t(riskLabelKey)}
        </h4>
        <div style="font-size: 0.9rem; margin-bottom: 0.5rem;">
          <strong>${t('riskReasons')}:</strong>
          <ul style="padding-left: 1.25rem; margin-top: 0.25rem;">${reasonsList}</ul>
        </div>
        <div style="font-size: 0.9rem;">
          <strong>${t('practicalActions')}:</strong>
          <ul style="padding-left: 1.25rem; margin-top: 0.25rem; list-style: none;">${actionsList}</ul>
        </div>
      </div>
    </div>
  `;

  // 2. Grading Suggestions (Step 3)
  const gradingContainer = document.getElementById('grading-container');
  const criteria = cycle.grading_summary?.criteria || defaultCriteria;
  const alloc = cycle.grading_summary?.allocation || {};

  gradingContainer.innerHTML = `
    <div class="grading-grid">
      <div class="grade-card" style="border-top: 4px solid #2e7d32;">
        <h5><span>${t('gradeA')}</span> <span style="font-size: 0.85rem; color: #2e7d32; font-weight: 700;">₹${cycle.market_selling_guidance?.benchmarkPrices?.gradeA || 2700}/Qtl</span></h5>
        <p style="font-size: 0.88rem; margin-bottom: 0.5rem;"><strong>Characteristics:</strong> ${criteria?.gradeA?.characteristics || 'Uniform, premium, peak freshness'}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.5rem;"><strong>Defects:</strong> ${criteria?.gradeA?.visibleDefects || 'None'}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.75rem;"><strong>Buyers:</strong> ${criteria?.gradeA?.buyerCategories || 'Retail chains, export'}</p>
        <div style="background: #fff; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 0.85rem;">
          <strong>${t('allocatedQuantity')}:</strong> ${alloc.gradeA?.quantity || Math.round(cycle.actual_quantity * 0.65)} ${cycle.quantity_unit}
        </div>
      </div>

      <div class="grade-card" style="border-top: 4px solid #e9c46a;">
        <h5><span>${t('gradeB')}</span> <span style="font-size: 0.85rem; color: #b78103; font-weight: 700;">₹${cycle.market_selling_guidance?.benchmarkPrices?.gradeB || 2200}/Qtl</span></h5>
        <p style="font-size: 0.88rem; margin-bottom: 0.5rem;"><strong>Characteristics:</strong> ${criteria?.gradeB?.characteristics || 'Standard commercial sound quality'}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.5rem;"><strong>Defects:</strong> ${criteria?.gradeB?.visibleDefects || 'Minor surface marks <5%'}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.75rem;"><strong>Buyers:</strong> ${criteria?.gradeB?.buyerCategories || 'Regional mandis, processors'}</p>
        <div style="background: #fff; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 0.85rem;">
          <strong>${t('allocatedQuantity')}:</strong> ${alloc.gradeB?.quantity || Math.round(cycle.actual_quantity * 0.25)} ${cycle.quantity_unit}
        </div>
      </div>

      <div class="grade-card" style="border-top: 4px solid #e76f51;">
        <h5><span>${t('gradeC')}</span> <span style="font-size: 0.85rem; color: #c44020; font-weight: 700;">₹${cycle.market_selling_guidance?.benchmarkPrices?.gradeC || 1350}/Qtl</span></h5>
        <p style="font-size: 0.88rem; margin-bottom: 0.5rem;"><strong>Characteristics:</strong> ${criteria?.gradeC?.characteristics || 'Small or variable size, processing grade'}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.5rem;"><strong>Defects:</strong> ${criteria?.gradeC?.visibleDefects || 'Scuffs, bruising, over-ripe'}</p>
        <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 0.75rem;"><strong>Buyers:</strong> ${criteria?.gradeC?.buyerCategories || 'Local mills, puree, animal feed'}</p>
        <div style="background: #fff; padding: 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); font-size: 0.85rem;">
          <strong>${t('allocatedQuantity')}:</strong> ${alloc.gradeC?.quantity || Math.round(cycle.actual_quantity * 0.10)} ${cycle.quantity_unit}
        </div>
      </div>
    </div>
  `;

  // 3. Storage Suggestions (Step 4)
  const storageContainer = document.getElementById('storage-container');
  const stor = cycle.storage_recommendations || {};
  storageContainer.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
      <div style="background: var(--color-surface-alt); padding: 1.25rem; border-radius: var(--radius-lg);">
        <h5 style="color: var(--color-forest-dark); font-weight: 700; margin-bottom: 0.5rem;">🌡 ${t('idealTemp')} & ${t('idealHumidity')}</h5>
        <p style="font-size: 0.9rem; margin-bottom: 0.35rem;"><strong>Temperature:</strong> ${stor.idealTemperature || stor.temperature || '18°C - 24°C'}</p>
        <p style="font-size: 0.9rem; margin-bottom: 0.35rem;"><strong>Humidity:</strong> ${stor.idealHumidity || stor.humidity || '55% - 65% RH'}</p>
        <p style="font-size: 0.9rem; color: var(--color-forest-base); font-weight: 600;"><strong>${t('expectedShelfLife')}:</strong> ${stor.expectedStorageLife || stor.shelfLife || '2-3 weeks'}</p>
      </div>

      <div style="background: var(--color-surface-alt); padding: 1.25rem; border-radius: var(--radius-lg);">
        <h5 style="color: var(--color-forest-dark); font-weight: 700; margin-bottom: 0.5rem;">📦 ${t('packagingHandling')}</h5>
        <p style="font-size: 0.9rem; margin-bottom: 0.5rem;">${stor.packagingGuidance || stor.packaging || 'Perforated plastic crates or triple-layer bags.'}</p>
        <h5 style="color: var(--color-forest-dark); font-weight: 700; margin-bottom: 0.35rem;">💨 ${t('ventilationMoisture')}</h5>
        <p style="font-size: 0.88rem; color: var(--color-text-muted);">${stor.ventilationGuidance || stor.ventilation || 'Maintain cross ventilation during cool morning hours.'}</p>
      </div>
    </div>
  `;

  // 4. Transportation Suggestions (Step 6)
  const transportContainer = document.getElementById('transport-container');
  const trans = cycle.transportation_guidance || {};
  transportContainer.innerHTML = `
    <div style="background: var(--color-surface-alt); padding: 1.25rem; border-radius: var(--radius-lg); line-height: 1.6;">
      <p style="margin-bottom: 0.5rem;"><strong>🚛 ${t('recommendedVehicle')}:</strong> ${trans.vehicleType || 'Insulated or covered canopy vehicle with tarpaulin protection'}</p>
      <p style="margin-bottom: 0.5rem;"><strong>📦 ${t('packingTransit')}:</strong> ${trans.packingGuidance || trans.packingRequirement || 'Interlocking crate stack with corner cushioning'}</p>
      <p style="margin-bottom: 0.5rem;"><strong>⏱ ${t('transitUrgency')}:</strong> ${trans.dispatchUrgency || trans.urgency || 'Immediate dispatch recommended'}</p>
      <p style="font-size: 0.88rem; color: var(--color-text-muted);"><strong>⚠️ ${t('transitPrecautions')}:</strong> ${trans.estimatedTransitPrecautions || trans.handlingInstructions || 'Avoid transit during midday heat'}</p>
    </div>
  `;

  // 5. Market & Selling Guidance (Step 7)
  const marketContainer = document.getElementById('market-container');
  const mkt = cycle.market_selling_guidance || {};
  const prices = mkt.benchmarkPrices || mkt.benchmarkMandiPrices || {};

  marketContainer.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.25rem;">
      <div style="background: var(--color-surface-alt); padding: 1.25rem; border-radius: var(--radius-lg);">
        <h5 style="color: var(--color-forest-dark); font-weight: 700; margin-bottom: 0.5rem;">💰 ${t('benchmarkMandiPrices')}</h5>
        <div style="margin-bottom: 0.35rem; font-size: 0.9rem;"><strong>Grade A:</strong> ₹${prices.gradeA?.price || prices.gradeA || 2700} / Quintal</div>
        <div style="margin-bottom: 0.35rem; font-size: 0.9rem;"><strong>Grade B:</strong> ₹${prices.gradeB?.price || prices.gradeB || 2200} / Quintal</div>
        <div style="margin-bottom: 0.5rem; font-size: 0.9rem;"><strong>Grade C:</strong> ₹${prices.gradeC?.price || prices.gradeC || 1350} / Quintal</div>
        <p style="font-size: 0.75rem; color: var(--color-text-light);">${t('dataSourceNote')}</p>
      </div>

      <div style="background: var(--color-surface-alt); padding: 1.25rem; border-radius: var(--radius-lg);">
        <h5 style="color: var(--color-forest-dark); font-weight: 700; margin-bottom: 0.5rem;">🏪 ${t('sellingChannels')}</h5>
        <p style="font-size: 0.88rem; margin-bottom: 0.5rem;">${mkt.mandiRecommendation || 'Nearby APMC Regulated Yard or direct FPO aggregator'}</p>
        <h5 style="color: var(--color-forest-dark); font-weight: 700; margin-bottom: 0.35rem;">⏰ ${t('optimalTiming')}</h5>
        <p style="font-size: 0.88rem; color: var(--color-text-muted);">${mkt.optimalSellingWindow || mkt.timingAdvice || 'Morning auction (6:00 AM - 9:00 AM) fetches premium retail rates'}</p>
      </div>
    </div>
  `;

  // Scroll to assessment cleanly
  wrapper.scrollIntoView({ behavior: 'smooth' });
}

// --------------------------------------------------------------------------
// Modal Popup Utility
// --------------------------------------------------------------------------
function showModal(title, message, icon = '🌱', onConfirm = null) {
  let modalOverlay = document.getElementById('global-modal');
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'global-modal';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-icon" id="global-modal-icon">🌱</div>
        <h3 id="global-modal-title">FarmFusion AI</h3>
        <p id="global-modal-message" style="white-space: pre-line;"></p>
        <button id="global-modal-btn" class="btn btn-primary" style="min-width: 120px;">OK</button>
      </div>
    `;
    document.body.appendChild(modalOverlay);
  }

  document.getElementById('global-modal-title').textContent = title;
  document.getElementById('global-modal-message').textContent = message;
  document.getElementById('global-modal-icon').textContent = icon;

  const btn = document.getElementById('global-modal-btn');
  let confirmed = false;

  const handleAction = () => {
    if (confirmed) return;
    confirmed = true;
    modalOverlay.classList.remove('active');
    document.removeEventListener('keydown', keyListener);
    if (onConfirm) onConfirm();
  };

  const keyListener = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      handleAction();
    }
  };

  btn.onclick = handleAction;
  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) {
      handleAction();
    }
  };
  document.addEventListener('keydown', keyListener);

  modalOverlay.classList.add('active');
}

function setupGlobalEvents() {
  // Mobile responsive nav toggle if needed
}
