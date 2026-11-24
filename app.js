const SYSTEM_PROMPT = "You are a helpful assistant. Answer clearly and concisely. Reply in the user's language.";
const POLLINATIONS_URL = "https://text.pollinations.ai/openai";

// Tier free: Pollinations tanpa login. Tier mistral: tampil di daftar saja — tanpa Puter/login/balance.
const MODELS = [
    { id: "openai-fast", label: "openai-fast", tier: "free", hint: "GPT-OSS · cepat" },
    { id: "openai", label: "openai", tier: "free", hint: "alias openai-fast" },

    { id: "mistralai/mistral-large-4", label: "Mistral Large 4", tier: "mistral", hint: "complex tasks" },
    { id: "mistralai/mistral-medium-2604", label: "Mistral Medium 3.5", tier: "mistral", hint: "agentic coding · 128B" },
    { id: "mistralai/mistral-small-2603", label: "Mistral Small 2603", tier: "mistral", hint: "balanced" },
    { id: "mistralai/ministral-14b-2512", label: "Ministral 14B", tier: "mistral", hint: "edge" },
    { id: "mistralai/mistral-medium-3.1", label: "Mistral Medium 3.1", tier: "mistral", hint: "balanced" },
    { id: "mistralai/voxtral-small-24b-2507", label: "Voxtral 24B", tier: "mistral", hint: "voice" },
    { id: "mistralai/mistral-small-3.2-24b-instruct", label: "Mistral Small 3.2", tier: "mistral", hint: "24B instruct" },
    { id: "mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1", tier: "mistral", hint: "24B instruct" },
    { id: "mistralai/mistral-saba", label: "Mistral Saba", tier: "mistral", hint: "multilingual" },
    { id: "mistralai/mistral-large-2512", label: "Mistral Large 2512", tier: "mistral", hint: "flagship" },
    { id: "mistralai/ministral-3b", label: "Ministral 3B", tier: "mistral", hint: "light" },
    { id: "mistralai/ministral-8b", label: "Ministral 8B", tier: "mistral", hint: "light" },
    { id: "mistralai/ministral-3b-2512", label: "Ministral 3B 2512", tier: "mistral", hint: "light" },
    { id: "mistralai/ministral-8b-2512", label: "Ministral 8B 2512", tier: "mistral", hint: "light" },
    { id: "mistralai/pixtral-12b", label: "Pixtral 12B", tier: "mistral", hint: "vision" },
    { id: "mistralai/mistral-large-2407", label: "Mistral Large 2407", tier: "mistral", hint: "classic large" },
    { id: "mistralai/codestral-2508", label: "Codestral 2508", tier: "mistral", hint: "code specialist" },
    { id: "mistralai/mistral-7b-instruct-v0.3", label: "Mistral 7B v0.3", tier: "mistral", hint: "fast" },
    { id: "mistralai/mixtral-8x22b-instruct", label: "Mixtral 8x22B", tier: "mistral", hint: "MoE" },
    { id: "mistralai/mistral-7b-instruct-v0.2", label: "Mistral 7B v0.2", tier: "mistral", hint: "fast" },
    { id: "mistralai/mistral-tiny", label: "Mistral Tiny", tier: "mistral", hint: "tercepat" },
    { id: "mistralai/mistral-7b-instruct", label: "Mistral 7B Instruct", tier: "mistral", hint: "classic" },
];

const els = {
    messages: document.getElementById('messages'),
    welcome: document.getElementById('welcome'),
    composer: document.getElementById('composer'),
    input: document.getElementById('input'),
    sendBtn: document.getElementById('sendBtn'),
    abortBtn: document.getElementById('abortBtn'),
    modelMenu: document.getElementById('modelMenu'),
    modelTrigger: document.getElementById('modelTrigger'),
    modelPanel: document.getElementById('modelPanel'),
    mDot: document.getElementById('mDot'),
    mName: document.getElementById('mName'),
    mBadge: document.getElementById('mBadge'),
    history: document.getElementById('history'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatTitle: document.getElementById('chatTitle'),
    status: document.getElementById('status'),
};

let chats = [];
let activeId = null;
let busy = false;
let currentAbort = null;
let selectedModelId = 'openai-fast';

function load() {
    try {
        chats = JSON.parse(localStorage.getItem('nexus-chats') || '[]');
    } catch { chats = []; }
    if (!chats.length) createChat(false);
    activeId = chats[0].id;
}

function save() {
    localStorage.setItem('nexus-chats', JSON.stringify(chats));
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

    if (role === 'assistant' && !isError && content) {
        const speak = document.createElement('button');
        speak.type = 'button';
        speak.className = 'btn-speak';
        speak.title = 'Dengarkan';
        speak.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg> Dengarkan';
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

function friendlyError(err) {
    const msg = err?.message || err?.error || String(err);
    if (err?.name === 'AbortError') return 'Dihentikan.';
    if (String(msg).includes('popup_blocked')) return 'Pop-up diblokir browser. Izinkan pop-up lalu coba lagi.';
    if (String(msg).includes('402') || String(msg).includes('FREE_LIMIT')) return 'Rate limit gratis — tunggu ±45 detik lalu kirim lagi.';
    if (String(msg).includes('Failed to fetch') || String(msg).includes('NetworkError')) return 'Jaringan gagal — cek koneksi.';
    return msg;
}

function modelMeta(id) {
    return MODELS.find(m => m.id === id) || MODELS[0];
}

function isPuterModel(id) {
    return modelMeta(id).tier !== 'free';
}

function selectedModel() {
    return selectedModelId || 'openai-fast';
}

// ===== Model menu (dropdown kustom) =====
function renderModelMenu() {
    const panel = els.modelPanel;
    panel.innerHTML = '';

    const groups = [
        { key: 'free', title: 'Gratis · tanpa login', icon: '⚡' },
        { key: 'mistral', title: 'Mistral · daftar model', icon: '◆' },
    ];

    for (const g of groups) {
        const head = document.createElement('div');
        head.className = 'm-group m-group-' + g.key;
        head.innerHTML = '<span class="m-group-ic">' + g.icon + '</span>' + g.title;
        panel.appendChild(head);

        for (const m of MODELS.filter(x => x.tier === g.key)) {
            const opt = document.createElement('button');
            opt.type = 'button';
            opt.className = 'm-opt' + (m.id === selectedModelId ? ' active' : '');
            opt.setAttribute('role', 'option');
            opt.dataset.id = m.id;
            opt.innerHTML =
                '<span class="m-dot ' + (m.tier === 'free' ? 'is-free' : 'is-mistral') + '"></span>' +
                '<span class="m-opt-main"><span class="m-opt-label"></span><span class="m-opt-hint"></span></span>' +
                (m.tier === 'free' ? '<span class="m-tag free">free</span>' : '<span class="m-tag mistral">mistral</span>');
            opt.querySelector('.m-opt-label').textContent = m.label;
            opt.querySelector('.m-opt-hint').textContent = m.hint;
            opt.onclick = () => pickModel(m.id);
            panel.appendChild(opt);
        }
    }
}

function syncModelTrigger() {
    const m = modelMeta(selectedModelId);
    els.mName.textContent = m.label;
    els.mBadge.textContent = m.tier === 'free' ? 'free' : 'mistral';
    els.mBadge.className = 'm-badge ' + (m.tier === 'free' ? 'is-free' : 'is-mistral');
    els.mDot.className = 'm-dot ' + (m.tier === 'free' ? 'is-free' : 'is-mistral');
    els.modelTrigger.title = m.id;
}

function pickModel(id) {
    selectedModelId = id;
    syncModelTrigger();
    closeModelMenu();
    renderModelMenu();
    const m = modelMeta(id);
    if (m.tier === 'free') {
        setStatus('model: ' + m.label + ' · gratis', false);
    } else {
        setStatus('model: ' + m.label + ' · pilih free untuk balas instan', false);
    }
}

function openModelMenu() {
    els.modelPanel.hidden = false;
    els.modelTrigger.setAttribute('aria-expanded', 'true');
    els.modelMenu.classList.add('open');
    renderModelMenu();
}

function closeModelMenu() {
    els.modelPanel.hidden = true;
    els.modelTrigger.setAttribute('aria-expanded', 'false');
    els.modelMenu.classList.remove('open');
}

// ===== Smooth typewriter: ketikan AI pelan-pelan, halus =====
class SmoothTyper {
    constructor(bubble, cursor) {
        this.bubble = bubble;
        this.cursor = cursor;
        this.target = '';
        this.shown = 0;
        this.timer = null;
        this.done = false;
        this.chunks = 0;
    }

    push(partial) {
        this.target = partial;
        this.chunks++;
        if (!this.timer) this._tick();
    }

    async _tick() {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        while (this.shown < this.target.length && !this.done) {
            const remaining = this.target.length - this.shown;
            // pelan-pelan: 1–3 karakter per langkah, jeda adaptif
            const step = remaining > 80 ? 3 : remaining > 30 ? 2 : 1;
            const delay = remaining > 200 ? 12 : remaining > 60 ? 22 : 34;
            this.shown = Math.min(this.target.length, this.shown + step);
            this.bubble.textContent = this.target.slice(0, this.shown);
            if (this.cursor && this.cursor.parentNode === this.bubble) {
                this.bubble.appendChild(this.cursor);
            } else if (this.cursor) {
                this.bubble.appendChild(this.cursor);
            }
            scrollBottom();
            await sleep(delay);
        }
        this.timer = null;
    }

    async finish(finalText) {
        this.target = finalText;
        // kejar sampai habis
        while (this.shown < this.target.length) {
            await this._tick();
        }
        this.done = true;
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        // pastikan tampil penuh
        this.bubble.textContent = finalText;
        if (this.cursor && this.cursor.parentNode) this.cursor.remove();
        return finalText;
    }

    abortShown() {
        this.done = true;
        return this.target.slice(0, this.shown);
    }
}

// Backend gratis Pollinations — tanpa login, streaming
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

async function send(text) {
    if (busy) return;
    const chat = activeChat();
    const model = selectedModel();
    const puterMode = isPuterModel(model);

    // Mistral hanya tampil di daftar — jangan buka Puter/login (anti pop-up balance)
    if (puterMode) {
        chat.messages.push({ role: 'user', content: text });
        if (chat.messages.length === 1) {
            chat.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
        }
        const note = 'Model "' + modelMeta(model).label + '" hanya tampil di daftar. Pilih openai-fast / openai untuk chat gratis instan — tanpa login, tanpa biaya.';
        chat.messages.push({ role: 'assistant', content: note, error: false });
        save();
        renderHistory();
        renderMessages();
        setStatus('pilih model free', false);
        els.input.focus();
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

    // indikator berpikir
    const thinking = document.createElement('span');
    thinking.className = 'thinking';
    thinking.innerHTML = '<i></i><i></i><i></i>';
    bubble.appendChild(thinking);
    bubbleWrap.append(avatar, bubble);
    els.messages.appendChild(bubbleWrap);
    scrollBottom();

    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    const typer = new SmoothTyper(bubble, cursor);
    let gotFirst = false;

    currentAbort = new AbortController();

    try {
        const onChunk = (partial) => {
            if (!gotFirst) {
                gotFirst = true;
                thinking.remove();
                bubble.appendChild(cursor);
                setStatus('mengetik…', true);
            }
            typer.push(partial);
            setStatus('streaming…', true);
        };

        const full = await streamPollinations(history, onChunk, currentAbort.signal, model);

        if (!full) throw new Error('Respons kosong dari model');
        await typer.finish(full);
        chat.messages.push({ role: 'assistant', content: full });
        save();
        setStatus('siap', false);
    } catch (err) {
        const msg = friendlyError(err);
        typer.done = true;
        if (err?.name === 'AbortError') {
            const partial = typer.abortShown() || thinking.textContent;
            if (partial && partial !== '…') {
                bubble.textContent = partial;
                chat.messages.push({ role: 'assistant', content: partial });
                save();
            } else {
                bubbleWrap.remove();
            }
            setStatus('dihentikan', false);
        } else {
            thinking.remove();
            if (cursor.parentNode) cursor.remove();
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

// init model menu
syncModelTrigger();
renderModelMenu();

els.modelTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.modelPanel.hidden) openModelMenu();
    else closeModelMenu();
});

document.addEventListener('click', (e) => {
    if (!els.modelMenu.contains(e.target)) closeModelMenu();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModelMenu();
});

load();
renderHistory();
renderMessages();
setStatus('siap', false);
