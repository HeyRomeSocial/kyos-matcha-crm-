// ── View handling ──
const loginView = document.getElementById('login-view')
const formView = document.getElementById('form-view')
const signoutBtn = document.getElementById('signout')

function show(view) {
  loginView.style.display = view === 'login' ? 'block' : 'none'
  formView.style.display = view === 'form' ? 'block' : 'none'
  signoutBtn.style.display = view === 'form' ? 'block' : 'none'
}

// ── Auth ──
async function getSession() {
  const { km_session } = await chrome.storage.local.get('km_session')
  if (!km_session) return null
  // Refresh if expired
  if (km_session.expires_at * 1000 < Date.now() + 60000) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: km_session.refresh_token }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      await chrome.storage.local.set({ km_session: data })
      return data
    } catch {
      await chrome.storage.local.remove('km_session')
      return null
    }
  }
  return km_session
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const msg = document.getElementById('login-msg')
  msg.className = 'msg'
  msg.textContent = 'Signing in…'
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Sign in failed')
    await chrome.storage.local.set({ km_session: data })
    msg.textContent = ''
    show('form')
    prefillFromPage()
  } catch (err) {
    msg.className = 'msg err'
    msg.textContent = err.message
  }
})

signoutBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove('km_session')
  show('login')
})

// ── Pre-fill from current page ──
async function prefillFromPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title || '',
        url: location.href,
        host: location.hostname,
      }),
    })
    if (!result) return

    const nameField = document.getElementById('f-name')
    const igField = document.getElementById('f-instagram')
    const notesField = document.getElementById('f-notes')
    const channelField = document.getElementById('f-channel')

    if (result.host.includes('instagram.com')) {
      // Extract handle from URL like instagram.com/bloomcafe/
      const match = result.url.match(/instagram\.com\/([^/?]+)/)
      if (match && !['p', 'reel', 'explore', 'accounts'].includes(match[1])) {
        igField.value = '@' + match[1]
      }
      // Page title is usually "Name (@handle) • Instagram"
      const nameMatch = result.title.match(/^([^(•]+)/)
      if (nameMatch) nameField.value = nameMatch[1].trim()
      channelField.value = 'instagram'
    } else {
      // Generic site — use page title, strip common suffixes
      nameField.value = result.title.split(/[|–—-]/)[0].trim().slice(0, 60)
      channelField.value = 'other'
    }
    notesField.value = `Found: ${result.url}`
  } catch {
    // Page not scriptable (chrome:// etc) — leave blank
  }
}

// ── Add to outreach ──
document.getElementById('add-btn').addEventListener('click', async () => {
  const msg = document.getElementById('form-msg')
  const name = document.getElementById('f-name').value.trim()
  if (!name) {
    msg.className = 'msg err'
    msg.textContent = 'Business name is required'
    return
  }
  const session = await getSession()
  if (!session) { show('login'); return }

  msg.className = 'msg'
  msg.textContent = 'Adding…'
  const btn = document.getElementById('add-btn')
  btn.disabled = true

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/outreach`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        business_name: name,
        location: document.getElementById('f-location').value.trim() || null,
        instagram: document.getElementById('f-instagram').value.trim() || null,
        email: document.getElementById('f-email').value.trim() || null,
        channel: document.getElementById('f-channel').value,
        notes: document.getElementById('f-notes').value.trim() || null,
        status: 'to_contact',
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.message || `Error ${res.status}`)
    }
    msg.className = 'msg ok'
    msg.textContent = `✓ ${name} added to Outreach!`
    // Clear form for next prospect
    ;['f-name', 'f-location', 'f-instagram', 'f-email', 'f-notes'].forEach(id => {
      document.getElementById(id).value = ''
    })
  } catch (err) {
    msg.className = 'msg err'
    msg.textContent = err.message
  }
  btn.disabled = false
})

// ── Init ──
;(async () => {
  const session = await getSession()
  if (session) {
    show('form')
    prefillFromPage()
  } else {
    show('login')
  }
})()
