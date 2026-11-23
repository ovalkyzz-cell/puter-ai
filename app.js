const SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and concisely. Reply in the user's language.";

const els = {
    messages: document.getElementById('messages'),
    welcome: document.getElementById('welcome'),
    composer: document.getElementById('composer'),
    input: document.getElementById('input'),
    sendBtn: document.getElementById('sendBtn'),
    modelSelect: document.getElementById('modelSelect'),
    history: document.getElementById('history'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatTitle: document.getElementById('chatTitle'),
    status: document.getElementById('status'),
    loginBtn: document.getElementById('loginBtn'),
};

let chats = [];
let activeId = null;
let busy = false;

function load() {
    try {
        chats = JSON.parse(localStorage.getItem('puter-ai-chats') || '[]');
    } catch { chats = []; }
    if (!chats.length) createChat(false);
    activeId = chats[0].id;
}

function save() {
    localStorage.setItem('puter-ai-chats', JSON.stringify(chats));
}

function createChat(switchTo = true) {
    const chat = { id: Date.now().toString(36), title: 'Chat Baru', messages: [] };
    chats.unshift(chat);
    if (switchTo) activeId = chat.id;
    save();
    renderHistory();
    if (switchTo) renderMessages();
    return chat;
}

function activeChat() {
    return chats.find(c => c.id === activeId);
}

function renderHistory() {
    els.history.innerHTML = '';
    for (const c of chats) {
        const div = document.createElement('div');
        div.className = 'history-item' + (c.id === activeId ? ' active' : '');
        div.textContent = c.title;
        div.onclick = () => { activeId = c.id; renderHistory(); renderMessages(); };
        els.history.appendChild(div);
    }
}

function renderMessages() {
    const chat = activeChat();
    els.messages.innerHTML = '';
    els.chatTitle.textContent = chat.title;

    if (!chat.messages.length) {
        els.messages.appendChild(els.welcome);
        return;
    }

    for (const m of chat.messages) {
        els.messages.appendChild(msgNode(m.role, m.content, m.error));
    }
    scrollBottom();
}

function msgNode(role, content, isError) {
    const div = document.createElement('div');
    div.className = 'msg ' + role + (isError ? ' error' : '');
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = content;
    div.append(avatar, bubble);
    return div;
}

function scrollBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
}

function setStatus(text, busyState) {
    els.status.textContent = text;
    els.status.classList.toggle('busy', !!busyState);
}

function showError(text) {
    const chat = activeChat();
    chat.messages.push({ role: 'assistant', content: text, error: true });
    save();
    renderMessages();
}

function isFileProtocol() {
    return location.protocol === 'file:';
}

function loginBtnLabel() {
    let signed = false;
    try { signed = !!(puter.auth && puter.auth.isSignedIn()); } catch {}
    els.loginBtn.textContent = signed ? '✓ Login' : 'Login';
    els.loginBtn.classList.toggle('logged-in', signed);
}

async function ensureAuth() {
    if (isFileProtocol()) {
        showError('Halaman dibuka sebagai file:// — Puter butuh http(s). Jalankan: python3 -m http.server 8000 --directory puter-ai lalu buka http://localhost:8000');
        throw new Error('unsupported_origin');
    }
    try {
        if (puter.auth && puter.auth.isSignedIn()) return;
    } catch {}

    setStatus('login Puter diperlukan…', true);
    try {
        // panggil langsung dari handler klik → popup tidak diblokir browser
        await puter.auth.signIn();
    } catch (err) {
        const code = err?.error || err?.message || String(err);
        if (String(code).includes('popup_blocked')) {
            showError('Pop-up diblokir browser. Izinkan pop-up untuk situs ini, lalu klik Kirim lagi (atau tombol Login).');
        } else {
            showError('Login gagal: ' + String(code));
        }
        throw err;
    }
    loginBtnLabel();
}

async function send(text) {
    if (busy) return;
    const chat = activeChat();

    chat.messages.push({ role: 'user', content: text });
    if (chat.messages.length === 1) {
        chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    }
    save();
    renderHistory();
    renderMessages();

    busy = true;
    els.sendBtn.disabled = true;
    setStatus('berpikir…', true);

    const history = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chat.messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const bubbleWrap = document.createElement('div');
    bubbleWrap.className = 'msg assistant';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = 'AI';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    bubble.appendChild(cursor);
    bubbleWrap.append(avatar, bubble);
    els.messages.appendChild(bubbleWrap);
    scrollBottom();

    let full = '';
    try {
        const resp = await puter.ai.chat(history, true, {
            model: els.modelSelect.value,
            stream: true,
        });

        for await (const part of resp) {
            if (part && part.type === 'error') throw new Error(part.message || 'stream error');
            const chunk = part?.text || part?.message?.content || '';
            if (chunk) {
                full += chunk;
                bubble.textContent = full;
                bubble.appendChild(cursor);
                scrollBottom();
            }
        }

        if (!full) throw new Error('Respons kosong dari model');

        chat.messages.push({ role: 'assistant', content: full });
        save();
    } catch (err) {
        bubble.textContent = 'Error: ' + (err?.message || err);
        bubbleWrap.classList.add('error');
        chat.messages.push({
            role: 'assistant',
            content: 'Error: ' + (err?.message || String(err)),
            error: true,
        });
        save();
    } finally {
        busy = false;
        els.sendBtn.disabled = false;
        setStatus('siap', false);
        els.input.focus();
        scrollBottom();
    }
}

els.composer.addEventListener('submit', async e => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text || busy) return;

    try {
        await ensureAuth();
    } catch {
        els.input.value = '';
        els.input.style.height = 'auto';
        setStatus('siap', false);
        return;
    }

    els.input.value = '';
    els.input.style.height = 'auto';
    send(text);
});

els.loginBtn.addEventListener('click', async () => {
    if (busy) return;
    try {
        await ensureAuth();
        setStatus('login berhasil — siap kirim pesan', false);
    } catch {
        setStatus('siap', false);
    }
});

els.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        els.composer.requestSubmit();
    }
});

els.input.addEventListener('input', () => {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 160) + 'px';
});

els.newChatBtn.addEventListener('click', () => {
    if (busy) return;
    createChat(true);
});

load();
renderHistory();
renderMessages();
loginBtnLabel();
if (isFileProtocol()) {
    showError('Buka lewat http(s), bukan file:// — contoh: python3 -m http.server 8000 di folder ini, lalu http://localhost:8000');
}
