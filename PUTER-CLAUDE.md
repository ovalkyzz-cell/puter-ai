# Catatan API — Puter.js Claude (dari tutorial pengguna)

Pahami & ingat pola ini. Sumber: tutorial resmi Puter (Nariman Jelveh / Reynaldi Chernando, 10 Nov 2026).

## Muat library
```html
<script src="https://js.puter.com/v2/"></script>
```
npm: `import { puter } from '@heyputer/puter.js'`

## Pola 1 — Non-streaming (WAJIB format ini)
```js
puter.ai.chat("prompt", { model: 'claude-sonnet-5-5' })
    .then(response => {
        puter.print(response.message.content[0].text);
    });
```
- Argumen ke-2 object = `options` (boolean = `testMode`).
- Jawaban: **`response.message.content[0].text`** — `content` = array of blocks (native Anthropic), BUKAN string.
- Tanpa `normalize`. Jika `normalize: true` → `content` jadi string, akses berubah.
- Block pertama bisa bukan teks (thinking) → cari block `type === 'text'`.

## Pola 2 — Streaming real-time
```js
const response = await puter.ai.chat("prompt", { model: 'claude-sonnet-5-5', stream: true });
for await (const part of response) {
    puter.print(part?.text);   // chunk → part.text (langsung), BUKAN content[0].text
}
```
- `stream: true` → async iterable, wajib `for await`, tidak boleh `.then()`.
- Chunk awal bisa kosong → filter `if (part?.text)`.

## Pola 3 — Ganti model (hanya string)
```js
{ model: "claude-haiku-5-5" }   // cepat/murah
{ model: "claude-sonnet-5-5" }  // seimbang (default tutorial)
{ model: "claude-opus-5-5" }    // berat
{ model: "claude-opus-5-fast" } // Opus 5 mode cepat (~2.5x speed)
{ model: "claude-fable-5-2" }   // flagship reasoning, contoh puzzle logika + stream
```

## Daftar model Claude (17) — tulisan harus persis
```
claude-fable-5-2, claude-fable-5-1, claude-fable-5
claude-opus-5-5, claude-opus-5, claude-opus-5-fast,
claude-opus-4.8-fast, claude-opus-4-8, claude-opus-4-7,
claude-opus-4-6, claude-opus-4-5
claude-sonnet-5-5, claude-sonnet-5, claude-sonnet-4-6, claude-sonnet-4-5
claude-haiku-5-5, claude-haiku-4-5
```
Catatan: `4.8` pakai TITIK, `4-8` pakai STRIP — jangan tertukar.

## Konsep User-Pays
- Developer TIDAK bayar / tidak butuh API key Anthropic.
- **User WAJIB login Puter** — biaya dipotong dari kuota akun Puter user.
- Login = pop-up puter.com + Cloudflare → otomasi/headless terblokir.
- $5 kredit Anthropic & "kunci gratis GitHub" = bukan jalur ini.

## Jebakan
1. Dua format: non-stream `message.content[0].text` · stream `part?.text`.
2. `stream:true` tidak bisa `.then()`.
3. `puter.print(response)` (tanpa ekstrak) = cetak objek mentah, bukan jawaban.
4. Contoh resmi tidak filter chunk kosong / block non-teks — kode produksi harus filter.

## Perbandingan dengan Pollinations (app utama saat ini)
| | Puter Claude | Pollinations |
|---|---|---|
| Login | wajib | tidak |
| Non-stream | `message.content[0].text` | `choices[0].message.content` (string) |
| Stream | `part?.text` | `choices[0].delta.content` |
| Model | 17 Claude | openai-fast saja |

Status: dipahami & dicatat untuk referensi integrasi mendatang.
