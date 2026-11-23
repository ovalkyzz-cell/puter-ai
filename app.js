const SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and concisely. Reply in the user's language.";
const POLLINATIONS_URL = "https://text.pollinations.ai/openai";

const MODELS = [
    { id: "openai-fast", label: "openai-fast — gratis, tanpa login", free: true },
    { id: "claude-sonnet-5-5", label: "claude-sonnet-5-5 (login)", free: false },
    { id: "claude-haiku-5-5", label: "claude-haiku-5-5 (login)", free: false },
    { id: "claude-opus-5-5", label: "claude-opus-5-5 (login)", free: false },
    { id: "claude-opus-5-fast", label: "claude-opus-5-fast (login)", free: false },
    { id: "claude-fable-5-2", label: "claude-fable-5-2 (login)", free: false },
    { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6 (login)", free: false },
    { id: "claude-opus-4-8", label: "claude-opus-4-8 (login)", free: false },
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

    // tombol dengar (Web Speech API — tanpa login)
    if (role === 'assistant' && !isError && content) {
        const speak = document.createElement('button');
        speak.type = 'button';
        speak.className = 'btn-speak';
        speak.title = 'Dengarkan';
        speak.textContent = '🔊';
        speak.onclick = (e) => {
            e.stopPropagation();
            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(content);
            u.lang = 'id-ID';
            speechSynthesis.speak(u);
        };
        div.appendChild(speak);
    }
    return div;
}

function scrollBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
}

function setStatus(text, busyState) {
    els.status.textContent = text;
    els.status.classList.toggle('busy', !!busyState);
}

function isSignedIn() {
    try { return !!(window.puter && puter.auth && puter.auth.isSignedIn()); } catch { return false; }
}

function loginBtnLabel() {
    const signed = isSignedIn();
    els.loginBtn.textContent = signed ? '✓ Claude aktif' : 'Login Claude';
    els.loginBtn.classList.toggle('logged-in', signed);
}

function friendlyError(err) {
    const msg = err?.message || err?.error || String(err);
    if (err?.name === 'AbortError') return 'Dihentikan.';
    if (String(msg).includes('popup_blocked')) return 'Pop-up diblokir browser. Izinkan pop-up lalu coba lagi.';
    if (String(msg).includes('auth_window_closed')) return 'Login dibatalkan.';
    if (String(msg).includes('402') || String(msg).includes('FREE_LIMIT')) return 'Rate limit gratis — tunggu ±45 detik lalu kirim lagi.';
    if (String(msg).includes('Failed to fetch') || String(msg).includes('NetworkError')) return 'Jaringan gagal — cek koneksi.';
    return msg;
}

function selectedModel() {
    return els.modelSelect.value || 'openai-fast';
}

function isClaude(modelId) {
    return modelId.startsWith('claude-');
}

async function ensureAuthForClaude() {
    if (isSignedIn()) return;
    setStatus('login Puter untuk Claude…', true);
    await puter.auth.signIn();
    loginBtnLabel();
}

// ===== Backend 1: Pollinations — tanpa login, streaming =====
async function streamPollinations(messages, onChunk, signal, model) {
    const res = await fetch(POLLINATIONS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, stream: true }),
        signal,
    });
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        const e = new Error('API ' + res.status + ': ' + t.slice(0, 150));
        e.status = res.status;
        throw e;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if (data === '[DONE]') continue;
            let j;
            try { j = JSON.parse(data); } catch { continue; }
            if (j.error) throw new Error(j.error.message || 'stream error');
            const chunk = j.choices?.[0]?.delta?.content || '';
            if (chunk) {
                full += chunk;
                onChunk(full);
            }
        }
    }
    return full;
}

// ===== Backend 2: Puter Claude — butuh login, streaming (pola tutorial) =====
async function streamClaude(messages, onChunk, signal, model) {
    // messages array → (messages, testMode, options); pola stream + part?.text
    const response = await puter.ai.chat(
        messages,
        false,
        { model, stream: true, signal }
    );
    let full = '';
    for await (const part of response) {
        if (part && part.type === 'error') throw new Error(part.message || 'stream error');
        const chunk = part?.text;
        if (chunk) {
            full += chunk;
            onChunk(full);
        }
    }
    return full;
}

async function send(text) {
    if (busy) return;
    const chat = activeChat();
    const model = selectedModel();
    const useClaude = isClaude(model);

    // Claude → wajib login dulu, dari konteks klik (pop-up tidak diblokir)
    if (useClaude) {
        try {
            await ensureAuthForClaude();
        } catch (err) {
            pushError(chat, friendlyError(err));
            setStatus('siap', false);
            return;
        }
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
    setStatus(useClaude ? 'Claude berpikir…' : 'berpikir…', true);

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

    try {
        const onChunk = (partial) => {
            bubble.textContent = partial;
            bubble.appendChild(cursor);
            scrollBottom();
            setStatus(useClaude ? 'Claude streaming…' : 'streaming…', true);
        };

        const full = useClaude
            ? await streamClaude(history, onChunk, currentAbort.signal, model)
            : await streamPollinations(history, onChunk, currentAbort.signal, model);

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

function pushError(chat, msg) {
    chat.messages.push({ role: 'assistant', content: 'Error: ' + msg, error: true });
    save();
    renderMessages();
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
        if (isSignedIn()) {
            setStatus('Claude sudah aktif', false);
            return;
        }
        await puter.auth.signIn();
        loginBtnLabel();
        setStatus('Claude aktif — pilih model Claude di sidebar', false);
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
for (const m of MODELS) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    els.modelSelect.appendChild(opt);
}
els.modelSelect.value = 'openai-fast';

load();
renderHistory();
renderMessages();
loginBtnLabel();
