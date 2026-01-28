const API = "/api/v1";
let vaultKey = null;
let allItems = [];
let currentView = 'all'; 

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

function renderVault(filterText = '') {
    const grid = document.getElementById('vault-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const filtered = allItems.filter(item => {
        const matches = (item.title+item.username).toLowerCase().includes(filterText.toLowerCase());
        if (currentView === 'trash') return item.isDeleted && matches;
        if (currentView === 'favorites') return !item.isDeleted && item.isFavorite && matches;
        return !item.isDeleted && matches; 
    });

    toggleElem('empty-state', filtered.length === 0);

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let btns = '';
        if (currentView === 'trash') {
            btns = `
                <button onclick="restoreItem('${item.id}')" class="action-btn" title="Restore"><i class="ph ph-arrow-counter-clockwise"></i></button>
                <button onclick="permDelete('${item.id}')" class="action-btn delete" style="color:var(--danger)" title="Delete"><i class="ph ph-trash"></i></button>
            `;
        } else {
            // FIX: Using 'ph' (Outline) vs 'ph-fill' (Solid) classes on the same 'heart' icon
            const heartClass = item.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart';
            const activeClass = item.isFavorite ? 'fav-active' : '';
            
            btns = `
                <button onclick="copyPass('${item.password}')" class="action-btn" title="Copy"><i class="ph ph-copy"></i></button>
                <button onclick="toggleFav('${item.id}')" class="action-btn ${activeClass}" title="Favorite">
                    <i class="${heartClass}"></i>
                </button>
                <button onclick="softDelete('${item.id}')" class="action-btn" title="Archive"><i class="ph ph-trash"></i></button>
            `;
        }

        card.innerHTML = `
            <div class="card-top">
                <div class="card-icon"><i class="ph ph-key"></i></div>
                <div class="card-info">
                    <h3>${item.title}</h3>
                    <p>${item.username || 'No username'}</p>
                </div>
            </div>
            <div class="card-actions">${btns}</div>
        `;
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
        const payload = {
            title: document.getElementById('i-title').value,
            username: document.getElementById('i-user').value,
            password: document.getElementById('i-pass').value,
            isFavorite: false, isDeleted: false, createdAt: Date.now()
        };
        
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

initTheme();
