const SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and concisely. Reply in the user's language.";
const API_URL = "https://text.pollinations.ai/openai";
const MODEL = "openai-fast";

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

async function streamChat(messages, onChunk, signal) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: els.modelSelect.value || MODEL,
            messages,
            stream: true,
        }),
        signal,
    });

    if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 200); } catch {}
        const err = new Error('API ' + res.status + (detail ? ': ' + detail : ''));
        err.status = res.status;
        throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if (data === '[DONE]') continue;
            let json;
            try { json = JSON.parse(data); } catch { continue; }
            if (json.error) {
                const e = new Error(json.error.message || 'stream error');
                e.status = json.error.code;
                throw e;
            }
            const chunk = json.choices?.[0]?.delta?.content || '';
            if (chunk) {
                full += chunk;
                onChunk(full);
            }
        }
    }

    return full;
}

function friendlyError(err) {
    const msg = err?.message || String(err);
    if (err?.name === 'AbortError') return 'Dihentikan.';
    if (err?.status === 402 || msg.includes('FREE_LIMIT') || msg.includes('429')) {
        return 'Batas gratis tercapai — tunggu ±45 detik lalu kirim lagi.';
    }
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        return 'Jaringan gagal — cek koneksi internet.';
    }
    return msg;
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

    try {
        const full = await streamChat(history, (partial) => {
            bubble.textContent = partial;
            bubble.appendChild(cursor);
            scrollBottom();
        }, currentAbort.signal);

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

load();
renderHistory();
renderMessages();
