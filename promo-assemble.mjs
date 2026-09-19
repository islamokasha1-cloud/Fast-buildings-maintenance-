// الفيلمُ الكامل: قائمةُ مقاطعَ تُوصَل بذوبانٍ تحت فراشٍ موسيقيٍّ واحد.
//
// يجمع مخرَجَي أداتين قائمتين بلا نسخِ منطقِ أيٍّ منهما:
//   • `remotion/` — تركيبةٌ كاملة (`PlatformIntro` · `AiFacilities`) أو مدى إطاراتٍ من
//     تركيبة (ختامُ `CompanyAnnouncement` ١٣٨١–١٦٢٠)، بلا موسيقى ليُفرَش تحت الفيلم فراشٌ متّصل.
//   • `promo-video.mjs --no-bookends [--topic X]` — جولةُ الشاشات بلا بطاقتَي افتتاحٍ وختام.
// كلُّ وصلةٍ ذوبانٌ (xfade) لا قطعٌ حادّ، والموسيقى مؤلَّفةٌ بطول الفيلم بسكربت
// الإعلان نفسِه (`make-music.py`) — فلا تنتهي قبله ولا تُقطَع في منتصفها.
//
// كان التجميعُ ثلاثيةً ثابتة (افتتاحية + جولة + ختام)؛ صار **قائمةَ مقاطع** (`FILMS`)
// يختارها `--film` — فالفيلمُ الأصليّ (`platform`) يبقى كما هو حرفياً، وفيلمُ
// «الذكاء الاصطناعي» (`ai`) قائمةٌ أخرى بالمحرّك نفسِه: تركيبةٌ عامّة ثم جولةُ فصول
// الذكاء الاصطناعي ثم الختامُ نفسُه.
//
//   node promo-assemble.mjs              → dist-video/promo-film.mp4 (+ نسخة مشاركة 1080p)
//   node promo-assemble.mjs --film ai    → dist-video/ai-facilities-film.mp4
//   node promo-assemble.mjs --skip-body  → أعِد التجميع دون إعادة تسجيل الجولة
//   node promo-assemble.mjs --4k         → 3840×2160 (المشاهدُ بـ--scale=2 والجولةُ 4K)
//
// المتطلّبات: playwright-core · ffmpeg-static · numpy (للموسيقى) · remotion/node_modules

import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const OUT = path.join(REPO, 'dist-video');
const PARTS = path.join(OUT, 'parts');
const RM = path.join(REPO, 'remotion');
const SKIP_BODY = process.argv.includes('--skip-body');
// 4K: الجولةُ تُلتقط بنافذةٍ 3840×2160 (تكبير CSS ×2)، ومشهدا Remotion يُرندَران
// بـ`--scale=2` — كلاهما 4K أصليّ لا تكبيرَ صورة، وإلا اختلف مقاسا مدخلَي الذوبان.
const FOURK = process.argv.includes('--4k') || process.env.PROMO_4K === '1';

const FPS = 30;
const XF = 0.7;                                   // مدّةُ الذوبان عند كلّ وصلة (ثانية)
// الختامُ (الشعار والتواصل) صالحٌ لكلّ الأفلام، فيُقتطع من الإعلان بلا تكرار.
// **أرقامُ إطاراته مرتبطةٌ بترتيب مشاهد `src/CompanyAnnouncement.tsx`** — حدِّثها إن تغيّر.
const OUTRO = { kind: 'remotion', comp: 'CompanyAnnouncement', from: 1380, to: 1619, label: 'الختام' };
// اللقطاتُ المولَّدة لمشاهد `AiFacilities`: يكتبها `higgsfield-shots.mjs` في
// `remotion/public/ai/manifest.json` — وإن غابت رُندرت المشاهدُ برسومها المتجهية.
const AI_MANIFEST = path.join(RM, 'public', 'ai', 'manifest.json');
const aiProps = () => {
  try { const m = JSON.parse(fs.readFileSync(AI_MANIFEST, 'utf8')); return { clips: m.clips || {} }; } catch { return {}; }
};
// كلُّ مقطعٍ إمّا `remotion` (تركيبةٌ كاملة، أو مدى `from`–`to`) أو `tour` (جولةُ شاشاتٍ بموضوعٍ اختياريّ).
const FILMS = {
  // الافتتاحيةُ تركيبةٌ مستقلّةٌ (`PlatformIntro`) لا مشهدٌ من الإعلان: هذا عرضٌ موضوعُه
  // المنصةُ وحدَها، والإعلانُ عن الشركة وقطاعاتها الثلاثة — فلا يُكتَب فيه ما لا يعرضه.
  platform: { name: 'promo-film', segments: [
    { kind: 'remotion', comp: 'PlatformIntro', label: 'الافتتاح' },
    { kind: 'tour', label: 'الجولة' },
    OUTRO
  ] },
  ai: { name: 'ai-facilities-film', segments: [
    { kind: 'remotion', comp: 'AiFacilities', label: 'الجزء العامّ — الذكاء الاصطناعي في إدارة المرافق', props: aiProps },
    { kind: 'tour', topic: 'ai', label: 'جولة الذكاء الاصطناعي في المنصة' },
    OUTRO
  ] }
};
const FILM = (() => { const i = process.argv.indexOf('--film'); return i > 0 ? String(process.argv[i + 1] || '').trim() : 'platform'; })();

const L = (...a) => console.log(...a);
const die = (m) => { console.error('\n❌ ' + m + '\n'); process.exit(1); };

let FF;
try { FF = require('ffmpeg-static'); } catch { }
if (!FF || !fs.existsSync(FF)) die('ffmpeg-static غير مثبّت — npm install --no-save ffmpeg-static');
if (!fs.existsSync(path.join(RM, 'node_modules'))) die('تبعيات Remotion غير مثبّتة — cd remotion && npm install');
if (!FILMS[FILM]) die('فيلمٌ غيرُ معروف: ' + FILM + ' — المتاح: ' + Object.keys(FILMS).join(', '));
const SEGMENTS = FILMS[FILM].segments;

fs.mkdirSync(PARTS, { recursive: true });

const run = (cmd, args, opts) => spawnSync(cmd, args, Object.assign({ stdio: 'inherit' }, opts || {}));
const ff = (args) => spawnSync(FF, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });

// مدّةُ ملفٍّ بالثواني — من ترويسة ffmpeg نفسِها (ffmpeg-static لا يشحن ffprobe).
function dur(file) {
  const r = spawnSync(FF, ['-i', file], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(r.stderr || '');
  if (!m) die('تعذّرت قراءة مدّة ' + file);
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
}
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;

L('\n══════════════════════════════════════════════════════');
L(`  تجميعُ الفيلم «${FILM}» — ${SEGMENTS.map(s => s.label).join(' · ')}`);
L('══════════════════════════════════════════════════════');

/* ═════════ ١) المقاطع بالترتيب: مشاهدُ Remotion وجولاتُ الشاشات ═════════ */
// `musicVolume: 0` — الموسيقى تُفرَش لاحقاً على الفيلم كلِّه دفعةً واحدة.
function renderRemotion(r, out) {
  const range = r.from === undefined ? '' : ` (${r.from}–${r.to})`;
  L(`\n▸ رندر مشهد «${r.label}»${range}…`);
  const args = ['remotion', 'render', r.comp, out, '--log=error'];
  if (FOURK) args.push('--scale=2');
  if (r.from !== undefined) args.push(`--frames=${r.from}-${r.to}`);
  // موسيقى الإعلان تُسكَت هنا لتُفرَش لاحقاً على الفيلم كلِّه؛ والتركيباتُ المستقلّةُ
  // لا صوتَ فيها أصلاً فلا يضرّها المرور. `props` دالّةٌ تُقيَّم وقتَ الرندر (اللقطاتُ المولَّدة).
  args.push('--props', JSON.stringify(Object.assign({ musicVolume: 0 }, r.props ? r.props() : {})));
  const res = run('npx', args, { cwd: RM });
  if (res.status !== 0 || !fs.existsSync(out)) die(`فشل رندر مشهد ${r.label}`);
  L(`  ✅ ${out}  ·  ${dur(out).toFixed(2)} ث`);
}
function recordTour(t) {
  // `promo-video.mjs` يسمّي مخرَجَه بالموضوع — فلا تُدهَس جولةٌ بأخرى.
  const body = path.join(OUT, 'promo-body' + (t.topic ? '-' + t.topic : '') + '.mp4');
  if (SKIP_BODY) {
    if (!fs.existsSync(body)) die(`لا يوجد ${path.basename(body)} — شغّل بلا --skip-body`);
    L(`\n▸ تخطّي التسجيل — أُعيد استخدام ${body}`);
  } else {
    L(`\n▸ تسجيل «${t.label}» (بلا بطاقتَي افتتاحٍ وختام)…`);
    // الجسمُ وسيطٌ يُعاد ترميزُه عند الوصل — فيُحفَظ شبهَ عديمِ الفقد كيلا يتراكم جيلان.
    const args = ['promo-video.mjs', '--no-bookends', ...(t.topic ? ['--topic', t.topic] : []), ...(FOURK ? ['--4k'] : [])];
    const res = run(process.execPath, args, { cwd: REPO, env: Object.assign({}, process.env, { PROMO_CRF: process.env.PROMO_BODY_CRF || '12' }) });
    if (res.status !== 0 || !fs.existsSync(body)) die('فشل تسجيل الجولة');
  }
  L(`  ✅ الجولة: ${fmt(dur(body))}`);
  return body;
}
const parts = SEGMENTS.map((seg, i) => {
  if (seg.kind === 'tour') return recordTour(seg);
  const out = path.join(PARTS, `${String(i).padStart(2, '0')}-${seg.comp}${seg.from !== undefined ? '-' + seg.from : ''}.mp4`);
  renderRemotion(seg, out);
  return out;
});

/* ═════════ ٢) الموسيقى بطول الفيلم ═════════ */
const durs = parts.map(dur);
const total = durs.reduce((a, b) => a + b, 0) - (parts.length - 1) * XF;   // كلُّ ذوبانٍ يبتلع XF من الطول

const music = path.join(PARTS, 'music.mp3');
L(`\n▸ تأليف الموسيقى بطول ${fmt(total)}…`);
const mres = run('python3', ['scripts/make-music.py'], {
  cwd: RM, env: Object.assign({}, process.env, {
    MUSIC_DURATION: String(Math.ceil(total)), MUSIC_OUT: music, FFMPEG_BIN: FF
  })
});
const haveMusic = mres.status === 0 && fs.existsSync(music);
if (!haveMusic) L('  ⚠️  تعذّر تأليف الموسيقى (numpy؟) — يُجمَّع الفيلم صامتاً');

/* ═════════ ٣) الوصل بذوبانٍ + فرشُ الموسيقى ═════════ */
const film = path.join(OUT, FILMS[FILM].name + (FOURK ? '-4k' : '') + '.mp4');
L('\n▸ الوصل والترميز…');

// سلسلةُ ذوبانات: كلُّ مقطعٍ يذوب في الذي يليه. إزاحةُ الوصلة k = مجموعُ ما قبلها ناقص k×XF.
const v = parts.map((_, i) => `[${i}:v]fps=${FPS},format=yuv420p,setsar=1[s${i}]`);
let acc = 's0', off = 0;
for (let i = 1; i < parts.length; i++) {
  off += durs[i - 1] - XF;
  const outLbl = i === parts.length - 1 ? 'v' : `x${i}`;
  v.push(`[${acc}][s${i}]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[${outLbl}]`);
  acc = outLbl;
}
if (parts.length === 1) v.push(`[s0]null[v]`);
const args = ['-y'];
for (const p of parts) args.push('-i', p);
if (haveMusic) args.push('-i', music);
// تلاشٍ لطيفٌ في أوّل الموسيقى وآخرِها كي لا تبدأ أو تنقطع فجأة.
const fadeOutAt = Math.max(0, total - 3);
args.push('-filter_complex', haveMusic
  // `volume=0.55` كان يخفضها إلى ~‏−٢٠ ديسيبل: مسموعةٌ في السكون، تختفي عملياً على
  // سمّاعة هاتف. `loudnorm` يضبطها على معيار الويب (−١٦ LUFS) فتبقى حاضرةً بثباتٍ
  // من أوّل الفيلم إلى آخره.
  // `loudnorm` يرفع تردّدَ العيّنات داخلياً إلى ١٩٢ ك.هرتز ويُخرج ٩٦ ك.هرتز — وAAC على
  // ٩٦ ك.هرتز لا تفكّه كثيرٌ من مشغّلات الهواتف (واتساب · iOS) فيُعرَض الفيلمُ **بلا صوتٍ
  // أو بصوتٍ يتقطّع** بينما يبدو سليماً على الحاسوب. `aresample=48000` يعيده إلى المعيار.
  ? v.join(';') + `;[${parts.length}:a]afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aud]`
  : v.join(';'));
args.push('-map', '[v]');
if (haveMusic) args.push('-map', '[aud]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-preset', FOURK ? 'medium' : 'slow',
  '-crf', String(process.env.PROMO_FILM_CRF || (FOURK ? 17 : 15)), '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', film);

const enc = ff(args);
if (enc.status !== 0 || !fs.existsSync(film)) {
  L(String(enc.stderr || '').split('\n').slice(-12).join('\n'));
  die('فشل الوصل');
}

/* ═════════ ٤) نسخةُ المشاركة — تُصنَع فقط إن تجاوز الأصلُ السقف ═════════ */
// بعد أن صار الالتقاطُ نظيفاً، صار الأصلُ (CRF 18) أصغرَ من السقف أصلاً: المشاهدُ
// الساكنةُ تكاد لا تكلّف بتّاً. وفرضُ معدّلِ بتٍّ عليها يُنتج ملفاً **أكبرَ وأدنى
// جودةً** من الأصل — فلا تُصنع النسخةُ إلا عند الحاجة الفعلية إليها.
const CAP_MB = Number(process.env.PROMO_MAX_MB || 28);
const hd = path.join(OUT, FILMS[FILM].name + '-hd.mp4');
fs.rmSync(hd, { force: true });
const filmMB = fs.statSync(film).size / 1048576;
if (filmMB > CAP_MB && !FOURK) {
  const secs = dur(film);
  const abr = 96;
  const vbr = Math.max(600, Math.floor((CAP_MB * 8192) / secs) - abr);   // كيلوبت/ث
  const plog = path.join(PARTS, 'x264');
  L(`\n▸ نسخةُ المشاركة 1080p — سقف ${CAP_MB} م.ب (${vbr} ك.ب/ث، مروران)…`);
  const common = ['-c:v', 'libx264', '-preset', 'veryslow', '-b:v', `${vbr}k`,
    '-pix_fmt', 'yuv420p', '-passlogfile', plog];
  ff(['-y', '-i', film, ...common, '-pass', '1', '-an', '-f', 'mp4', '/dev/null']);
  ff(['-y', '-i', film, ...common, '-pass', '2',
    '-c:a', 'aac', '-b:a', `${abr}k`, '-movflags', '+faststart', hd]);
  for (const f of fs.readdirSync(PARTS)) if (f.startsWith('x264')) fs.rmSync(path.join(PARTS, f), { force: true });
}

const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
L('\n══════════════════════════════════════════════════════');
L(`  ✅ الفيلم (أصليّ): ${film}`);
L(`     ${fmt(dur(film))}  ·  ${FOURK ? '3840×2160' : '1920×1080'}  ·  ${mb(film)} م.ب  ·  ${haveMusic ? 'بموسيقى' : 'صامت'}`);
if (fs.existsSync(hd)) L(`  ✅ نسخةُ المشاركة: ${hd}  ·  ${mb(hd)} م.ب  ·  1920×1080`);
else if (FOURK) L(`     (وضع 4K: لا نسخةَ مضغوطة — الحجمُ مقصودٌ هنا)`);
else L(`     (الأصلُ دون سقف ${CAP_MB} م.ب — فهو نفسُه نسخةُ المشاركة، بلا إعادة ترميز)`);
L(`     البنية: ${SEGMENTS.map((s, i) => `${s.label} ${fmt(durs[i])}`).join(' + ')} (ذوبان ${XF}ث ×${parts.length - 1})`);
L('══════════════════════════════════════════════════════\n');
