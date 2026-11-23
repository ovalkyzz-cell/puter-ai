const SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and concisely. Reply in the user's language.";

const CLAUDE_MODELS = [
    { id: "claude-sonnet-5-5", label: "claude-sonnet-5-5" },
    { id: "claude-haiku-5-5", label: "claude-haiku-5-5" },
    { id: "claude-opus-5-5", label: "claude-opus-5-5" },
    { id: "claude-opus-5-fast", label: "claude-opus-5-fast" },
    { id: "claude-fable-5-2", label: "claude-fable-5-2" },
    { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
    { id: "claude-opus-4-8", label: "claude-opus-4-8" },
];

const els = {
    messages: document.getElementById('messages'),
    welcome: document.getElementById('welcome'),
    composer: document.getElementById('composer'),
    input: document.getElementById('input'),
    sendBtn: document.getElementById('sendBtn'),
    abortBtn: document.getElementById('abortBtn'),
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
let currentAbort = null;

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

function loginBtnLabel() {
    let signed = false;
    try { signed = !!(window.puter && puter.auth && puter.auth.isSignedIn()); } catch {}
    els.loginBtn.textContent = signed ? '✓ Login' : 'Login';
    els.loginBtn.classList.toggle('logged-in', signed);
}

function friendlyError(err) {
    const msg = err?.message || err?.error || String(err);
    if (err?.name === 'AbortError') return 'Dihentikan.';
    if (String(msg).includes('popup_blocked')) {
        return 'Pop-up login diblokir. Izinkan pop-up, lalu klik Login/Kirim lagi.';
    }
    if (String(msg).includes('auth_window_closed')) return 'Login dibatalkan.';
    if (String(msg).includes('unsupported_origin')) {
        return 'Buka lewat http(s), bukan file://.';
    }
    if (String(msg).includes('402') || String(msg).includes('rate')) {
        return 'Rate limit — tunggu sebentar lalu kirim lagi.';
    }
    return msg;
}

async function ensureAuth() {
    if (location.protocol === 'file:') {
        throw new Error('unsupported_origin');
    }
    try {
        if (window.puter && puter.auth && puter.auth.isSignedIn()) return;
    } catch {}

    setStatus('login Puter diperlukan…', true);
    // panggil langsung dari handler klik → pop-up tidak diblokir
    await puter.auth.signIn();
    loginBtnLabel();
}

async function send(text) {
    if (busy) return;
    const chat = activeChat();

    try {
        await ensureAuth();
    } catch (err) {
        const bubbleWrap = document.createElement('div');
        bubbleWrap.className = 'msg assistant error';
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = 'AI';
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.textContent = 'Error: ' + friendlyError(err);
        bubbleWrap.append(avatar, bubble);
        els.messages.appendChild(bubbleWrap);
        chat.messages.push({ role: 'assistant', content: 'Error: ' + friendlyError(err), error: true });
        save();
        setStatus('siap', false);
        return;
    }

    chat.messages.push({ role: 'user', content: text });
    if (chat.messages.length === 1) {
        chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    }
    save();
    renderHistory();
    renderMessages();

    busy = true;
    els.sendBtn.disabled = true;
    els.abortBtn.hidden = false;
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

    currentAbort = new AbortController();
    let full = '';

    try {
        // === pola tutorial: stream + for await + part?.text ===
        // messages array → signature (messages, testMode, options)
        const response = await puter.ai.chat(
            history,
            false,
            {
                model: els.modelSelect.value || 'claude-sonnet-5-5',
                stream: true,
                signal: currentAbort.signal,
            }
        );

        for await (const part of response) {
            if (part && part.type === 'error') {
                throw new Error(part.message || 'stream error');
            }
            const chunk = part?.text;
            if (chunk) {
                full += chunk;
                bubble.textContent = full;
                bubble.appendChild(cursor);
                scrollBottom();
                setStatus('streaming…', true);
            }
        }

        if (!full) throw new Error('Respons kosong dari model');

        chat.messages.push({ role: 'assistant', content: full });
        save();
        setStatus('siap', false);
    } catch (err) {
        const msg = friendlyError(err);
        if (err?.name === 'AbortError' && bubble.textContent.trim()) {
            chat.messages.push({ role: 'assistant', content: bubble.textContent });
            save();
            setStatus('dihentikan', false);
        } else {
            bubble.textContent = 'Error: ' + msg;
            bubbleWrap.classList.add('error');
            chat.messages.push({ role: 'assistant', content: 'Error: ' + msg, error: true });
            save();
            setStatus('siap', false);
        }
    } finally {
        busy = false;
        currentAbort = null;
        els.sendBtn.disabled = false;
        els.abortBtn.hidden = true;
        els.input.focus();
        scrollBottom();
        loginBtnLabel();
    }
}

els.composer.addEventListener('submit', e => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text || busy) return;
    els.input.value = '';
    els.input.style.height = 'auto';
    send(text);
});

els.loginBtn.addEventListener('click', async () => {
    if (busy) return;
    try {
        await ensureAuth();
        setStatus('login berhasil — siap kirim pesan', false);
    } catch (err) {
        setStatus('siap', false);
        alert('Login: ' + friendlyError(err));
    }
});

els.abortBtn.addEventListener('click', () => {
    if (currentAbort) currentAbort.abort();
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

// init model select
els.modelSelect.innerHTML = '';
for (const m of CLAUDE_MODELS) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    els.modelSelect.appendChild(opt);
}

load();
renderHistory();
renderMessages();
loginBtnLabel();
