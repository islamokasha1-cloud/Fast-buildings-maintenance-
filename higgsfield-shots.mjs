// لقطاتٌ مولَّدةٌ لمشاهد «الذكاء الاصطناعي في إدارة المرافق» — من Higgsfield API.
//
// المشكلة: مشاهدُ الحلول (حسّاسات · كاميرات · روبوتات · صيانة تنبّؤية) لا صورَ حقيقيةً
// لها عند الشركة، والرسمُ المتجهيّ وحدَه يفي لكنه لا يُبهر. النموذجُ التوليديّ يعطي
// لقطةً سينمائيةً قصيرة، لكنه لا يكتب عربيةً سليمة ولا يعرف هويةَ الشركة — فتُستعمل
// اللقطةُ **خلفيةً داخل إطار المشهد** (src/AiFacilities.tsx) والنصُّ والكروتُ من عندنا.
//
// المبدأ: المفتاحُ لا يمرّ من هنا. يُحفَظ كـ«API credential» في بيئة Claude Code (أو أيّ
// وسيطٍ يحقن الترويسة)، والسكربتُ يرسل الطلبَ **بلا ترويسة Authorization** فيضيفها
// الوسيط. وإن وُجد `HIGGSFIELD_API_KEY` في البيئة أُرسل مباشرةً (تشغيلٌ محليّ).
// الغيابُ لا يُسقط شيئاً: الفيديو يُرندَر برسومه المتجهية، والسكربتُ يخرج بصفر.
//
// القرار: توصيفُ اللقطات ثابتٌ في `SHOTS` (إضاءةٌ واحدة · 16:9 · بلا نصٍّ ولا شعارات ·
// بلا وجوهٍ قريبة) كي تبدو من عائلةٍ واحدة. الناتجُ `remotion/public/ai/<key>.mp4` وسجلٌّ
// `manifest.json` يقرؤه `promo-assemble.mjs` ويمرّره خاصيّةَ `clips` للتركيبة.
//
//   NODE_USE_ENV_PROXY=1 node higgsfield-shots.mjs   → يولّد ما ينقص من اللقطات (--parallel: معاً)
//   (المتغيّرُ لازمٌ في بيئة Claude Code: `fetch` المدمج في Node يتجاهل HTTPS_PROXY فلا يمرّ
//    بالوسيط الذي يحقن المفتاح — فيردّ الخادمُ 401. محلياً مع HF_CREDENTIALS لا حاجةَ له.)
//   node higgsfield-shots.mjs --force      → يعيد توليدها كلَّها
//   node higgsfield-shots.mjs --only camera,robots
//   node higgsfield-shots.mjs --dry-run    → يطبع الطلبات ولا يرسل شيئاً
//
// شكلُ النداء مأخوذٌ من مصدر الحزمة الرسمية `@higgsfield/client` (v2، الإصدار 0.2.6):
// POST `{base}/{endpoint}` والجسمُ هو حقولُ الإدخال مباشرةً، ثم GET `/requests/{id}/status`
// حتى `completed` (وفيه `video.url`) أو `failed` / `nsfw` (رفضٌ رقابيّ، يُردّ الرصيد).
// الترويسة `Authorization: Key KEY_ID:KEY_SECRET` — وهي ما يحقنه وسيطُ الاعتماد.
//
// **الهويةُ داخل اللقطة لا فوقها (قرارُ المالك 19/09):** نقطةُ النهاية `reference-to-video`
// تقبل صوراً مرجعيةً (`image_urls`)، فيُمرَّر شعارُ الشركة (رابطٌ عامّ من المستودع) ويُطلب في
// الوصف رسمُه على السترة والروبوت ولافتة الجدار. جُرّب على `Seedance 2.5` بدقّة 720p فخرج
// الشعارُ صحيحَ الشكل والألوان. النصُّ الصغير على السترة يتموّج قليلاً — مقبولٌ ولا يُعاد.
// قابلٌ للتجاوز بمتغيّرات البيئة: HF_API_BASE · HF_MODEL_PATH · HF_STATUS_PATH · HF_RESOLUTION ·
// HF_LOGO_URL. `Seedance 2.0` يصل إلى 4K لكن بسعرٍ أعلى؛ 2.5 يقف عند 720p (كافيةٌ لشاشة
// 60 بوصة والعناوينُ تُرسم متجهياً في المونتاج). `--parallel` يرسل اللقطاتِ كلَّها معاً.

import fs from 'fs';
import path from 'path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT_DIR = path.join(REPO, 'remotion', 'public', 'ai');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry-run');
const PARALLEL = process.argv.includes('--parallel');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? String(process.argv[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : null; })();

const BASE = (process.env.HF_API_BASE || 'https://api.higgsfield.ai').replace(/\/+$/, '');
const MODEL = process.env.HF_MODEL_PATH || 'bytedance/seedance-2.5/reference-to-video';
const STATUS = process.env.HF_STATUS_PATH || '/requests/{id}/status';
const RESOLUTION = process.env.HF_RESOLUTION || '720p';
// الشعارُ مرجعاً — رابطٌ عامّ (المستودعُ عامّ) لأن النموذج لا يقبل الملفّات مباشرةً.
const LOGO_URL = process.env.HF_LOGO_URL || 'https://raw.githubusercontent.com/islamokasha1-cloud/Fast-buildings-maintenance-/main/remotion/public/logo.png';
// المفتاحُ بصيغة `KEY_ID:KEY_SECRET` — الاسمُ الرسميّ للمتغيّر HF_CREDENTIALS، ويُقبل الآخر.
const KEY = process.env.HF_CREDENTIALS || process.env.HIGGSFIELD_API_KEY || '';
const POLL_MS = Number(process.env.HF_POLL_MS || 8000);
const TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS || 15 * 60 * 1000);

// أسلوبٌ مشترك يُلحَق بكلّ وصف — فتخرج اللقطاتُ من عائلةٍ بصريةٍ واحدة.
const STYLE = 'Cinematic corporate film, modern Saudi office building, clean contemporary architecture, '
  + 'cool navy and teal tones with warm accents, slow smooth camera movement, shallow depth of field, '
  + 'photorealistic, 4K quality, no subtitles, no extra text, no watermarks, faces never in close-up.';
const LOGO = 'the exact company logo from the reference image';

// المفتاحُ = اسمُ اللقطة في السجلّ. المدّةُ بالثواني. الهويةُ مطلوبةٌ نصّاً في كلّ لقطة.
export const SHOTS = [
  { key: 'intro', seconds: 8,
    prompt: `Exterior of a modern office building at golden hour with a glass facade; ${LOGO} on a large illuminated sign above the main entrance; a small white inspection drone bearing the same logo lifts off from the entrance plaza and rises toward the facade; slow cinematic crane shot upward.` },
  { key: 'corridor', seconds: 8,
    prompt: `A facilities technician wearing a yellow high-visibility safety vest with ${LOGO} printed large on the back walks down a modern office corridor at night. Beside him rolls a compact white autonomous cleaning robot carrying the same logo on its side panel. On the corridor wall, an illuminated sign displays the same logo. As they pass, ceiling lights brighten smoothly ahead of them and dim behind them; a small ceiling security camera pivots to follow. Polished floor reflections, tracking shot from behind.` },
  { key: 'camera', seconds: 10,
    prompt: `High-angle security camera view of a bright office corridor with a polished floor. A small water spill appears on the floor; a thin glowing outline highlights the spill for a moment. Then a compact white autonomous cleaning robot bearing ${LOGO} on its side arrives and cleans it. Finally a technician in a yellow safety vest with the same logo on the back walks in and checks the clean spot. Static camera, calm and clean.` },
  { key: 'drone', seconds: 10,
    prompt: `A white inspection drone carrying ${LOGO} on its body flies slowly along the glass facade of a modern office building, then over the rooftop past large HVAC units; a soft thermal-style highlight briefly glows on one unit as the drone hovers over it. Smooth aerial tracking shot at golden hour.` },
  { key: 'predictive', seconds: 10,
    prompt: `Basement pump room of a modern building: clean pipes, industrial water pumps, a small vibration sensor with a blinking green LED mounted on a pump. A technician in a yellow high-visibility vest with ${LOGO} on the back checks a tablet showing a glowing line graph. Slow orbit around the pump, technical documentary lighting.` },
  { key: 'outro', seconds: 8,
    prompt: `Two facilities technicians in yellow high-visibility vests with ${LOGO} on the back stand in the lobby of a modern office building beside a white autonomous cleaning robot bearing the same logo; behind them a large wall sign displays the same logo. They look toward the building entrance, seen from behind. Slow cinematic push-in, soft daylight.` },
];

const L = (...a) => console.log(...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// `User-Agent` كما ترسله الحزمةُ الرسمية — الخادمُ يحجب طلباتِ المتصفّح.
const headers = () => Object.assign({ 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'higgsfield-server-js/2.0' }, KEY ? { authorization: 'Key ' + KEY } : {});

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { }
  if (!res.ok) throw new Error(`${method} ${url} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  return json ?? {};
}

// يقبل أشكالَ الردّ الشائعة: request_id/id · status_url/response_url · مسارَ الاستعلام المُعدّ.
function jobOf(r) {
  const id = r.request_id || r.id || (r.data && (r.data.request_id || r.data.id));
  const statusUrl = r.status_url || r.statusUrl || (id ? BASE + STATUS.replace('{id}', id) : null);
  const resultUrl = r.response_url || r.responseUrl || r.result_url || (id ? BASE + STATUS.replace('{id}', id).replace(/\/status$/, '') : null);
  return { id, statusUrl, resultUrl, raw: r };
}
function videoUrlOf(r) {
  const cands = [r.video && r.video.url, r.video_url, r.url, r.output && r.output.url,
    r.result && r.result.video && r.result.video.url, r.result && r.result.url,
    Array.isArray(r.videos) && r.videos[0] && r.videos[0].url,
    Array.isArray(r.outputs) && r.outputs[0] && (r.outputs[0].url || r.outputs[0]),
    r.data && r.data.video && r.data.video.url, r.data && r.data.url];
  return cands.find(u => typeof u === 'string' && /^https?:/.test(u)) || null;
}
const statusOf = (r) => String(r.status || (r.data && r.data.status) || '').toLowerCase();

async function generate(shot) {
  const body = { prompt: `${shot.prompt} ${STYLE}`, image_urls: [LOGO_URL], duration: shot.seconds, aspect_ratio: '16:9', resolution: RESOLUTION, generate_audio: false };
  if (DRY) { L(`  [dry-run] POST ${BASE}/${MODEL}\n  ${JSON.stringify(body, null, 2)}`); return null; }
  const sub = jobOf(await call('POST', `${BASE}/${MODEL}`, body));
  L(`  ⏳ أُرسل — المهمّة ${sub.id || '؟'}`);
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const st = await call('GET', sub.statusUrl);
    const s = statusOf(st);
    if (s !== last) { L(`     ${s || JSON.stringify(st).slice(0, 120)}`); last = s; }
    if (s === 'nsfw') throw new Error('رفضٌ رقابيّ (nsfw) — الرصيدُ يُردّ، عدّل الوصف: ' + JSON.stringify(st).slice(0, 300));
    if (/fail|error|cancel/.test(s)) throw new Error('فشل التوليد: ' + JSON.stringify(st).slice(0, 400));
    let url = videoUrlOf(st);
    if (!url && /complete|succe|done|ready/.test(s) && sub.resultUrl) url = videoUrlOf(await call('GET', sub.resultUrl));
    if (url) return url;
  }
  throw new Error('انتهت المهلة قبل اكتمال التوليد');
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`تنزيل ${url} → HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return fs.statSync(file).size;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let manifest = { clips: {} };
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { }
manifest.clips = manifest.clips || {};

L('\n══════════════════════════════════════════════════════');
L('  لقطاتُ Higgsfield لمشاهد الذكاء الاصطناعي في إدارة المرافق');
L(`  ${BASE}/${MODEL} · ${RESOLUTION} · المفتاح ${KEY ? 'من البيئة' : 'عبر وسيط الاعتماد'}`);
L('══════════════════════════════════════════════════════');

let failed = 0;
const saveManifest = () => { if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), clips: manifest.clips }, null, 2)); };
async function runShot(shot) {
  const file = path.join(OUT_DIR, shot.key + '.mp4');
  const rel = 'ai/' + shot.key + '.mp4';
  if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 100000) {
    L(`\n▸ ${shot.key}: موجودةٌ — تُتخطّى (--force لإعادتها)`);
    manifest.clips[shot.key] = rel; return;
  }
  L(`\n▸ ${shot.key} (${shot.seconds}ث)…`);
  try {
    const url = await generate(shot);
    if (!url) return;
    const size = await download(url, file);
    manifest.clips[shot.key] = rel;
    L(`  ✅ ${rel}  ·  ${(size / 1048576).toFixed(1)} م.ب`);
  } catch (e) {
    failed++;
    L(`  ❌ ${shot.key}: ${e.message}`);
  }
  saveManifest();
}
const wanted = SHOTS.filter(s => !ONLY || ONLY.includes(s.key));
if (PARALLEL) await Promise.all(wanted.map(runShot)); else for (const shot of wanted) await runShot(shot);
if (!DRY) L(`\n  السجلّ: ${MANIFEST} — ${Object.keys(manifest.clips).length} لقطة`);
L(failed ? `  ⚠️  ${failed} لقطة لم تُولَّد — المشاهدُ الناقصة تُرندَر برسومها المتجهية` : '  ✨ اكتمل');
L('══════════════════════════════════════════════════════\n');
process.exit(0);
