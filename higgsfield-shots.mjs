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
//   node higgsfield-shots.mjs              → يولّد ما ينقص من اللقطات
//   node higgsfield-shots.mjs --force      → يعيد توليدها كلَّها
//   node higgsfield-shots.mjs --only camera,robots
//   node higgsfield-shots.mjs --dry-run    → يطبع الطلبات ولا يرسل شيئاً
//
// شكلُ النداء (مسارُ النموذج · حقولُ الجسم · مسارُ الاستعلام) من التوثيق العامّ وقتَ
// الكتابة، وقابلٌ للتجاوز بمتغيّرات البيئة دون تعديل السكربت — فإن تغيّرت الواجهة
// فاضبط: HF_API_BASE · HF_MODEL_PATH · HF_STATUS_PATH · HF_RESOLUTION.

import fs from 'fs';
import path from 'path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT_DIR = path.join(REPO, 'remotion', 'public', 'ai');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry-run');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? String(process.argv[i + 1] || '').split(',').map(s => s.trim()).filter(Boolean) : null; })();

const BASE = (process.env.HF_API_BASE || 'https://api.higgsfield.ai').replace(/\/+$/, '');
const MODEL = process.env.HF_MODEL_PATH || 'bytedance/seedance-2.0/text-to-video';
const STATUS = process.env.HF_STATUS_PATH || '/requests/{id}/status';
const RESOLUTION = process.env.HF_RESOLUTION || '1080p';
const KEY = process.env.HIGGSFIELD_API_KEY || '';
const POLL_MS = Number(process.env.HF_POLL_MS || 8000);
const TIMEOUT_MS = Number(process.env.HF_TIMEOUT_MS || 15 * 60 * 1000);

// أسلوبٌ مشترك يُلحَق بكلّ وصف — فتخرج اللقطاتُ من عائلةٍ بصريةٍ واحدة.
const STYLE = 'Cinematic corporate documentary footage, modern Saudi government office building, clean architecture, '
  + 'soft cool daylight with subtle teal and navy tones, shallow depth of field, slow smooth camera movement, '
  + 'photorealistic, 4K quality, no text, no logos, no subtitles, no watermarks, no close-up faces.';

// المفتاحُ = اسمُ المشهد في `AiFacilities` (خاصيّة `clips`). المدّةُ بطول المشهد تقريباً.
export const SHOTS = [
  { key: 'problem', seconds: 10,
    prompt: 'A facilities operations desk seen from above: stacks of printed maintenance tickets, photos of building faults, supplier quotations and monthly reports piling up beside a monitor, papers accumulating in time-lapse, slow top-down push-in.' },
  { key: 'building', seconds: 12,
    prompt: 'Slow dolly along a modern office building floor at dusk, ceiling lights switching off floor by floor as rooms empty, small wireless sensors with tiny green LEDs on walls and ceiling, HVAC vents, a tablet on a desk showing abstract dashboard glow.' },
  { key: 'camera', seconds: 11,
    prompt: 'Security camera perspective of a bright office corridor with polished floor, a small liquid spill on the floor, subtle surveillance vignette, static camera with slight digital zoom, calm and clean, no people in frame.' },
  { key: 'robots', seconds: 11,
    prompt: 'A compact autonomous floor-cleaning robot gliding through an empty office corridor at night, floor reflections, and in a second beat a small inspection drone hovering along a building facade at golden hour, smooth tracking shots.' },
  { key: 'predictive', seconds: 11,
    prompt: 'Industrial water pump room in a building basement, a vibration sensor mounted on a pump with a blinking LED, slow orbit around the pump, clean pipes, subtle steam, technical documentary lighting.' },
];

const L = (...a) => console.log(...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const headers = () => Object.assign({ 'content-type': 'application/json', accept: 'application/json' }, KEY ? { authorization: 'Key ' + KEY } : {});

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
  const body = { prompt: `${shot.prompt} ${STYLE}`, duration: shot.seconds, aspect_ratio: '16:9', resolution: RESOLUTION };
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
for (const shot of SHOTS) {
  if (ONLY && !ONLY.includes(shot.key)) continue;
  const file = path.join(OUT_DIR, shot.key + '.mp4');
  const rel = 'ai/' + shot.key + '.mp4';
  if (!FORCE && fs.existsSync(file) && fs.statSync(file).size > 100000) {
    L(`\n▸ ${shot.key}: موجودةٌ — تُتخطّى (--force لإعادتها)`);
    manifest.clips[shot.key] = rel; continue;
  }
  L(`\n▸ ${shot.key} (${shot.seconds}ث)…`);
  try {
    const url = await generate(shot);
    if (!url) continue;
    const size = await download(url, file);
    manifest.clips[shot.key] = rel;
    L(`  ✅ ${rel}  ·  ${(size / 1048576).toFixed(1)} م.ب`);
  } catch (e) {
    failed++;
    L(`  ❌ ${shot.key}: ${e.message}`);
  }
  if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), clips: manifest.clips }, null, 2));
}
if (!DRY) L(`\n  السجلّ: ${MANIFEST} — ${Object.keys(manifest.clips).length} لقطة`);
L(failed ? `  ⚠️  ${failed} لقطة لم تُولَّد — المشاهدُ الناقصة تُرندَر برسومها المتجهية` : '  ✨ اكتمل');
L('══════════════════════════════════════════════════════\n');
process.exit(0);
