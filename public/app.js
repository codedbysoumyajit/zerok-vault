const API = "/api/v1";
let vaultKey = null;
let allItems = [];
let currentView = 'all';
let currentCategory = 'all'; 

// --- Crypto ---
function buf2hex(buf) { return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2,'0')).join(''); }
function hex2buf(hex) { return new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))); }

async function deriveKeys(pass, saltHex) {
    const enc = new TextEncoder();
    const keyMat = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({
        name: "PBKDF2", salt: hex2buf(saltHex), iterations: 100000, hash: "SHA-256"
    }, keyMat, 512);
    return { 
        authKey: buf2hex(bits.slice(0, 32)), 
        wrapperKey: await crypto.subtle.importKey("raw", bits.slice(32, 64), "AES-GCM", false, ["encrypt", "decrypt"]) 
    };
}

async function encrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encData = new TextEncoder().encode(JSON.stringify(data));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encData);
    return { ct: buf2hex(cipher), iv: buf2hex(iv) };
}

async function decrypt(key, ctHex, ivHex) {
    try {
        const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hex2buf(ivHex) }, key, hex2buf(ctHex));
        return JSON.parse(new TextDecoder().decode(dec));
    } catch(e) { return null; }
}

// --- Theme ---
function toggleTheme() { 
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}
function initTheme() {
    if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
}

// --- UI Logic ---
function toggleElem(id, show) {
    const el = document.getElementById(id);
    if(el) show ? el.classList.remove('hidden') : el.classList.add('hidden');
}

function openModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.add('open');
        setTimeout(() => document.getElementById('i-title').focus(), 50);
    });
}

function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('open');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.querySelector('#modal form').reset();
    }, 250);
}

function setView(view) {
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`nav-${view}`).classList.add('active');
    
    const titles = { 'all': 'My Vault', 'favorites': 'Favorites', 'trash': 'Trash Bin' };
    document.getElementById('page-title').innerText = titles[view];
    renderVault();
}

function setCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.category-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`cat-${category}`).classList.add('active');
    renderVault();
}

function renderVault(filterText = '') {
    const grid = document.getElementById('vault-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const filtered = allItems.filter(item => {
        const searchText = item.type === 'card' 
            ? (item.title + item.cardHolder + item.cardNumber)
            : (item.title + item.username);
        const matches = searchText.toLowerCase().includes(filterText.toLowerCase());
        
        // View filter
        let viewMatch = false;
        if (currentView === 'trash') viewMatch = item.isDeleted;
        else if (currentView === 'favorites') viewMatch = !item.isDeleted && item.isFavorite;
        else viewMatch = !item.isDeleted;
        
        // Category filter
        let categoryMatch = false;
        if (currentCategory === 'all') categoryMatch = true;
        else if (currentCategory === 'login') categoryMatch = item.type === 'login' || !item.type;
        else if (currentCategory === 'card') categoryMatch = item.type === 'card';
        
        return matches && viewMatch && categoryMatch;
    });

    toggleElem('empty-state', filtered.length === 0);

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let btns = '';
        if (currentView === 'trash') {
            btns = `
                <button onclick="event.stopPropagation(); restoreItem('${item.id}')" class="action-btn" title="Restore"><i class="ph ph-arrow-counter-clockwise"></i></button>
                <button onclick="event.stopPropagation(); permDelete('${item.id}')" class="action-btn delete" style="color:var(--danger)" title="Delete"><i class="ph ph-trash"></i></button>
            `;
        } else {
            const heartClass = item.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart';
            const activeClass = item.isFavorite ? 'fav-active' : '';
            
            btns = `
                <button onclick="event.stopPropagation(); toggleFav('${item.id}')" class="action-btn ${activeClass}" title="Favorite">
                    <i class="${heartClass}"></i>
                </button>
                <button onclick="event.stopPropagation(); softDelete('${item.id}')" class="action-btn" title="Archive"><i class="ph ph-trash"></i></button>
            `;
        }

        let iconHTML;
        if (item.type === 'card') {
            const brandStyles = {
                'Visa': { color: '#1A1F71', text: 'VISA', bg: '#f7f7f7' },
                'Mastercard': { color: '#EB001B', text: 'Mastercard', bg: '#f7f7f7' },
                'RuPay': { color: '#097939', text: 'RuPay', bg: '#f7f7f7' },
                'American Express': { color: '#006FCF', text: 'AMEX', bg: '#f7f7f7' },
                'Discover': { color: '#FF6000', text: 'Discover', bg: '#f7f7f7' }
            };
            const brandStyle = brandStyles[item.cardBrand];
            if (brandStyle) {
                iconHTML = `<div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: ${brandStyle.bg}; color: ${brandStyle.color}; font-weight: 800; font-size: 8px; border-radius: 6px; letter-spacing: -0.3px;">${brandStyle.text}</div>`;
            } else {
                iconHTML = `<i class="ph ph-credit-card"></i>`;
            }
        } else if (item.website) {
            iconHTML = `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.website)}&sz=64" alt="" onerror="this.parentElement.innerHTML='<i class=\'ph ph-key\'></i>'" style="width: 24px; height: 24px; border-radius: 4px;">`;
        } else {
            iconHTML = `<i class="ph ph-key"></i>`;
        }
        
        const subtitle = item.type === 'card' 
            ? (item.cardNumber ? '•••• ' + item.cardNumber.slice(-4) : 'No card number')
            : (item.username || 'No username');
        
        card.innerHTML = `
            <div class="card-top">
                <div class="card-icon">${iconHTML}</div>
                <div class="card-info">
                    <h3>${item.title}</h3>
                    <p>${subtitle}</p>
                </div>
            </div>
            <div class="card-actions">${btns}</div>
        `;
        
        if (currentView !== 'trash') {
            card.addEventListener('click', () => openDetailModal(item));
        }
        
        grid.appendChild(card);
    });
}

// --- CRUD ---
async function handleSaveItem(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldText = btn.innerText;
    
    btn.disabled = true;
    btn.style.opacity = "0.7";
    btn.innerText = "Encrypting...";

    try {
        const itemType = document.getElementById('form-login').classList.contains('hidden') ? 'card' : 'login';
        
        let payload;
        if (itemType === 'card') {
            payload = {
                type: 'card',
                title: document.getElementById('i-card-name').value,
                cardHolder: document.getElementById('i-card-holder').value,
                cardNumber: document.getElementById('i-card-number').value,
                cardBrand: document.getElementById('i-card-brand').value,
                expiryMonth: document.getElementById('i-card-month').value,
                expiryYear: document.getElementById('i-card-year').value,
                cvv: document.getElementById('i-card-cvv').value,
                isFavorite: false, isDeleted: false, createdAt: Date.now()
            };
        } else {
            payload = {
                type: 'login',
                title: document.getElementById('i-title').value,
                website: document.getElementById('i-website').value,
                username: document.getElementById('i-user').value,
                password: document.getElementById('i-pass').value,
                isFavorite: false, isDeleted: false, createdAt: Date.now()
            };
        }
        
        const { ct, iv } = await encrypt(vaultKey, payload);
        const res = await fetch(API + '/vault', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ encrypted_data: ct, iv: iv })
        });
        
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        payload.id = json.id; 
        allItems.push(payload);
        
        closeModal();
        setTimeout(renderVault, 250);
        
    } catch(err) { alert("Error: " + err.message); } 
    finally { 
        btn.innerText = oldText; 
        btn.disabled = false; 
        btn.style.opacity = "1";
    }
}

async function updateItem(item) {
    const { ct, iv } = await encrypt(vaultKey, item);
    await fetch(API + `/vault/${item.id}`, {
        method: 'PUT', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ encrypted_data: ct, iv: iv })
    });
    renderVault();
}

async function toggleFav(id) { const i = allItems.find(x => x.id===id); if(i) { i.isFavorite = !i.isFavorite; await updateItem(i); } }
async function softDelete(id) { const i = allItems.find(x => x.id===id); if(i) { i.isDeleted = true; await updateItem(i); } }
async function restoreItem(id) { const i = allItems.find(x => x.id===id); if(i) { i.isDeleted = false; await updateItem(i); } }
async function permDelete(id) {
    if(!confirm("Delete forever?")) return;
    await fetch(API + `/vault/${id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') } });
    allItems = allItems.filter(x => x.id !== id);
    renderVault();
}

// --- Auth ---
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.querySelector('#login-form button');
    btn.innerText = "Verifying...";
    setTimeout(async () => {
        try {
            const email = document.getElementById('l-email').value;
            const pass = document.getElementById('l-pass').value;
            const resS = await fetch(API+'/get-salt', { method:'POST', body:JSON.stringify({email}), headers:{'Content-Type':'application/json'} });
            if(!resS.ok) throw new Error("User not found");
            const salt = (await resS.json()).kdf_salt;
            const keys = await deriveKeys(pass, salt);
            const resL = await fetch(API+'/login', { method:'POST', body:JSON.stringify({email, auth_key:keys.authKey}), headers:{'Content-Type':'application/json'} });
            if(!resL.ok) throw new Error("Wrong password");
            const data = await resL.json();
            
            const rawKey = await decrypt(keys.wrapperKey, data.encrypted_vault_key, data.vault_key_iv);
            if(!rawKey) throw new Error("Decryption failed");
            
            vaultKey = await crypto.subtle.importKey("raw", new Uint8Array(rawKey), "AES-GCM", false, ["encrypt", "decrypt"]);
            localStorage.setItem('token', data.token);
            toggleElem('auth-view', false); toggleElem('app-view', true);
            
            const resV = await fetch(API+'/vault', { headers: { 'Authorization': 'Bearer ' + data.token } });
            const rawItems = await resV.json();
            allItems = [];
            for(const r of rawItems) {
                const dec = await decrypt(vaultKey, r.encrypted_data, r.iv);
                if(dec) { dec.id = r.id; if(dec.isFavorite==null) dec.isFavorite=false; if(dec.isDeleted==null) dec.isDeleted=false; allItems.push(dec); }
            }
            renderVault();
        } catch(err) { alert(err.message); } 
        finally { btn.innerText = "Unlock Vault"; }
    }, 50);
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.querySelector('#register-form button');
    btn.innerText = "Generating...";
    setTimeout(async () => {
        try {
            const email = document.getElementById('r-email').value;
            const pass = document.getElementById('r-pass').value;
            const saltHex = buf2hex(crypto.getRandomValues(new Uint8Array(16)));
            const keys = await deriveKeys(pass, saltHex);
            const vaultK = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
            const wrap = await encrypt(keys.wrapperKey, Array.from(new Uint8Array(await crypto.subtle.exportKey("raw", vaultK))));
            
            const res = await fetch(API + '/register', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, auth_key: keys.authKey, kdf_salt: saltHex, encrypted_vault_key: wrap.ct, vault_key_iv: wrap.iv })
            });
            if(res.ok) { alert("Success! Log in now."); toggleAuth('login'); }
            else throw new Error("Email taken");
        } catch(err) { alert(err.message); } 
        finally { btn.innerText = "Create Vault"; }
    }, 50);
}

function toggleAuth(v) { toggleElem('login-form', v==='login'); toggleElem('register-form', v==='register'); }

function genPass() { 
    const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const v = crypto.getRandomValues(new Uint32Array(16));
    document.getElementById('i-pass').value = [...v].map(x => c[x % c.length]).join('');
}
function copyPass(t) { navigator.clipboard.writeText(t); }
function logout() { localStorage.removeItem('token'); location.reload(); }
function filterVault(v) { renderVault(v); }

let currentDetailItem = null;

function openDetailModal(item) {
    currentDetailItem = item;
    document.getElementById('detail-title').innerText = item.title;
    
    const loginSection = document.getElementById('detail-login');
    const cardSection = document.getElementById('detail-card');
    
    if (item.type === 'card') {
        loginSection.classList.add('hidden');
        cardSection.classList.remove('hidden');
        
        document.getElementById('detail-card-holder').innerText = item.cardHolder || 'N/A';
        document.getElementById('detail-card-number').innerText = item.cardNumber || 'N/A';
        document.getElementById('detail-card-brand').innerText = item.cardBrand || 'N/A';
        document.getElementById('detail-card-expiry').innerText = `${item.expiryMonth}/${item.expiryYear}`;
        document.getElementById('detail-card-cvv').innerText = item.cvv || 'N/A';
    } else {
        cardSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        
        document.getElementById('detail-username').innerText = item.username || 'No username';
        document.getElementById('detail-password').innerText = item.password;
        
        const websiteWrap = document.getElementById('detail-website-wrap');
        if (item.website) {
            document.getElementById('detail-website').innerText = item.website;
            websiteWrap.style.display = 'block';
        } else {
            websiteWrap.style.display = 'none';
        }
    }
    
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('open'));
}

function closeDetailModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('open');
    setTimeout(() => {
        modal.classList.add('hidden');
        currentDetailItem = null;
    }, 250);
}

function copyDetailUsername() {
    if (currentDetailItem && currentDetailItem.username) {
        navigator.clipboard.writeText(currentDetailItem.username);
    }
}

function copyDetailPassword() {
    if (currentDetailItem && currentDetailItem.password) {
        navigator.clipboard.writeText(currentDetailItem.password);
    }
}

function openDetailWebsite() {
    if (currentDetailItem && currentDetailItem.website) {
        window.open(currentDetailItem.website, '_blank', 'noopener,noreferrer');
    }
}

function switchItemType(type) {
    const loginForm = document.getElementById('form-login');
    const cardForm = document.getElementById('form-card');
    const loginTab = document.getElementById('tab-login');
    const cardTab = document.getElementById('tab-card');
    
    if (type === 'card') {
        loginForm.classList.add('hidden');
        cardForm.classList.remove('hidden');
        loginTab.classList.remove('active');
        cardTab.classList.add('active');
        
        // Clear login required attributes
        document.getElementById('i-title').removeAttribute('required');
        document.getElementById('i-pass').removeAttribute('required');
        // Add card required attributes
        document.getElementById('i-card-name').setAttribute('required', 'required');
        document.getElementById('i-card-number').setAttribute('required', 'required');
    } else {
        cardForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        cardTab.classList.remove('active');
        loginTab.classList.add('active');
        
        // Clear card required attributes
        document.getElementById('i-card-name').removeAttribute('required');
        document.getElementById('i-card-number').removeAttribute('required');
        // Add login required attributes
        document.getElementById('i-title').setAttribute('required', 'required');
        document.getElementById('i-pass').setAttribute('required', 'required');
    }
}

function copyDetail(elementId) {
    const text = document.getElementById(elementId).innerText;
    if (text && text !== 'N/A') {
        navigator.clipboard.writeText(text);
    }
}

initTheme();
