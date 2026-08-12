// الفيلمُ الكامل: افتتاحيةُ إعلان Remotion ← جولةُ الشاشات الحقيقية ← ختامُ الإعلان.
//
// يجمع مخرَجَي أداتين قائمتين بلا نسخِ منطقِ أيٍّ منهما:
//   • `remotion/` — افتتاحيةُ `PlatformIntro` (تركيبةٌ خاصةٌ بهذا العرض) وختامُ
//     `CompanyAnnouncement` (١٣٨١–١٦٢٠)، بلا موسيقى ليُفرَش تحت الفيلم فراشٌ متّصل.
//   • `promo-video.mjs --no-bookends` — جولةُ الشاشات بلا بطاقتَي افتتاحٍ وختام.
// الوصلتان ذوبانٌ (xfade) لا قطعٌ حادّ، والموسيقى مؤلَّفةٌ بطول الفيلم بسكربت
// الإعلان نفسِه (`make-music.py`) — فلا تنتهي قبله ولا تُقطَع في منتصفها.
//
//   node promo-assemble.mjs              → dist-video/promo-film.mp4 (+ نسخة مشاركة 1080p)
//   node promo-assemble.mjs --skip-body  → أعِد التجميع دون إعادة تسجيل الجولة
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

const FPS = 30;
const XF = 0.7;                                   // مدّةُ الذوبان عند كلّ وصلة (ثانية)
// الافتتاحيةُ تركيبةٌ مستقلّةٌ (`PlatformIntro`) لا مشهدٌ من الإعلان: هذا عرضٌ موضوعُه
// المنصةُ وحدَها، والإعلانُ عن الشركة وقطاعاتها الثلاثة — فلا يُكتَب فيه ما لا يعرضه.
// أما الختامُ (الشعار والتواصل) فصالحٌ للاثنين، فيُقتطع من الإعلان بلا تكرار.
const INTRO = { comp: 'PlatformIntro', label: 'الافتتاح' };
const OUTRO = { comp: 'CompanyAnnouncement', from: 1380, to: 1619, label: 'الختام' };

const L = (...a) => console.log(...a);
const die = (m) => { console.error('\n❌ ' + m + '\n'); process.exit(1); };

let FF;
try { FF = require('ffmpeg-static'); } catch { }
if (!FF || !fs.existsSync(FF)) die('ffmpeg-static غير مثبّت — npm install --no-save ffmpeg-static');
if (!fs.existsSync(path.join(RM, 'node_modules'))) die('تبعيات Remotion غير مثبّتة — cd remotion && npm install');

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
L('  تجميعُ الفيلم — افتتاحيةُ Remotion · جولةُ الشاشات · الختام');
L('══════════════════════════════════════════════════════');

/* ═════════ ١) مشهدا الافتتاح والختام من إعلان Remotion ═════════ */
// `musicVolume: 0` — الموسيقى تُفرَش لاحقاً على الفيلم كلِّه دفعةً واحدة.
for (const [name, r] of [['intro', INTRO], ['outro', OUTRO]]) {
  const out = path.join(PARTS, `${name}.mp4`);
  const range = r.from === undefined ? '' : ` (${r.from}–${r.to})`;
  L(`\n▸ رندر مشهد «${r.label}»${range}…`);
  const args = ['remotion', 'render', r.comp, out, '--log=error'];
  if (r.from !== undefined) args.push(`--frames=${r.from}-${r.to}`);
  // موسيقى الإعلان تُسكَت هنا لتُفرَش لاحقاً على الفيلم كلِّه؛ والتركيبةُ المستقلّةُ
  // لا صوتَ فيها أصلاً فلا يضرّها المرور.
  args.push('--props', JSON.stringify({ musicVolume: 0 }));
  const res = run('npx', args, { cwd: RM });
  if (res.status !== 0 || !fs.existsSync(out)) die(`فشل رندر مشهد ${r.label}`);
  L(`  ✅ ${out}  ·  ${dur(out).toFixed(2)} ث`);
}

/* ═════════ ٢) جولةُ الشاشات ═════════ */
const body = path.join(OUT, 'promo-body.mp4');
if (SKIP_BODY) {
  if (!fs.existsSync(body)) die('لا يوجد promo-body.mp4 — شغّل بلا --skip-body');
  L(`\n▸ تخطّي التسجيل — أُعيد استخدام ${body}`);
} else {
  L('\n▸ تسجيل جولة الشاشات (بلا بطاقتَي افتتاحٍ وختام)…');
  // الجسمُ وسيطٌ يُعاد ترميزُه عند الوصل — فيُحفَظ شبهَ عديمِ الفقد كيلا يتراكم جيلان.
  const res = run(process.execPath, ['promo-video.mjs', '--no-bookends'],
    { cwd: REPO, env: Object.assign({}, process.env, { PROMO_CRF: process.env.PROMO_BODY_CRF || '12' }) });
  if (res.status !== 0 || !fs.existsSync(body)) die('فشل تسجيل الجولة');
}
L(`  ✅ الجولة: ${fmt(dur(body))}`);

/* ═════════ ٣) الموسيقى بطول الفيلم ═════════ */
const dIn = dur(path.join(PARTS, 'intro.mp4'));
const dBody = dur(body);
const dOut = dur(path.join(PARTS, 'outro.mp4'));
const total = dIn + dBody + dOut - 2 * XF;       // كلُّ ذوبانٍ يبتلع XF من الطول

const music = path.join(PARTS, 'music.mp3');
L(`\n▸ تأليف الموسيقى بطول ${fmt(total)}…`);
const mres = run('python3', ['scripts/make-music.py'], {
  cwd: RM, env: Object.assign({}, process.env, {
    MUSIC_DURATION: String(Math.ceil(total)), MUSIC_OUT: music, FFMPEG_BIN: FF
  })
});
const haveMusic = mres.status === 0 && fs.existsSync(music);
if (!haveMusic) L('  ⚠️  تعذّر تأليف الموسيقى (numpy؟) — يُجمَّع الفيلم صامتاً');

/* ═════════ ٤) الوصل بذوبانٍ + فرشُ الموسيقى ═════════ */
const film = path.join(OUT, 'promo-film.mp4');
L('\n▸ الوصل والترميز…');

// ذوبانان: الافتتاحُ في الجولة، ثم الناتجُ في الختام. الإزاحةُ = طولُ ما قبله ناقص XF.
const v = [
  `[0:v]fps=${FPS},format=yuv420p,setsar=1[a]`,
  `[1:v]fps=${FPS},format=yuv420p,setsar=1[b]`,
  `[2:v]fps=${FPS},format=yuv420p,setsar=1[c]`,
  `[a][b]xfade=transition=fade:duration=${XF}:offset=${(dIn - XF).toFixed(3)}[ab]`,
  `[ab][c]xfade=transition=fade:duration=${XF}:offset=${(dIn + dBody - 2 * XF).toFixed(3)}[v]`
];
const args = ['-y', '-i', path.join(PARTS, 'intro.mp4'), '-i', body, '-i', path.join(PARTS, 'outro.mp4')];
if (haveMusic) args.push('-i', music);
// تلاشٍ لطيفٌ في أوّل الموسيقى وآخرِها كي لا تبدأ أو تنقطع فجأة.
const fadeOutAt = Math.max(0, total - 3);
args.push('-filter_complex', haveMusic
  // `volume=0.55` كان يخفضها إلى ~‏−٢٠ ديسيبل: مسموعةٌ في السكون، تختفي عملياً على
  // سمّاعة هاتف. `loudnorm` يضبطها على معيار الويب (−١٦ LUFS) فتبقى حاضرةً بثباتٍ
  // من أوّل الفيلم إلى آخره.
  ? v.join(';') + `;[3:a]afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutAt.toFixed(2)}:d=3,loudnorm=I=-16:TP=-1.5:LRA=11[aud]`
  : v.join(';'));
args.push('-map', '[v]');
if (haveMusic) args.push('-map', '[aud]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', String(process.env.PROMO_FILM_CRF || 15), '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', film);

const enc = ff(args);
if (enc.status !== 0 || !fs.existsSync(film)) {
  L(String(enc.stderr || '').split('\n').slice(-12).join('\n'));
  die('فشل الوصل');
}

/* ═════════ ٥) نسخةُ المشاركة — تُصنَع فقط إن تجاوز الأصلُ السقف ═════════ */
// بعد أن صار الالتقاطُ نظيفاً، صار الأصلُ (CRF 18) أصغرَ من السقف أصلاً: المشاهدُ
// الساكنةُ تكاد لا تكلّف بتّاً. وفرضُ معدّلِ بتٍّ عليها يُنتج ملفاً **أكبرَ وأدنى
// جودةً** من الأصل — فلا تُصنع النسخةُ إلا عند الحاجة الفعلية إليها.
const CAP_MB = Number(process.env.PROMO_MAX_MB || 28);
const hd = path.join(OUT, 'promo-film-hd.mp4');
fs.rmSync(hd, { force: true });
const filmMB = fs.statSync(film).size / 1048576;
if (filmMB > CAP_MB) {
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
L(`     ${fmt(dur(film))}  ·  1920×1080  ·  ${mb(film)} م.ب  ·  ${haveMusic ? 'بموسيقى' : 'صامت'}`);
if (fs.existsSync(hd)) L(`  ✅ نسخةُ المشاركة: ${hd}  ·  ${mb(hd)} م.ب  ·  1920×1080`);
else L(`     (الأصلُ دون سقف ${CAP_MB} م.ب — فهو نفسُه نسخةُ المشاركة، بلا إعادة ترميز)`);
L(`     البنية: افتتاح ${dIn.toFixed(1)}ث + جولة ${fmt(dBody)} + ختام ${dOut.toFixed(1)}ث (ذوبان ${XF}ث ×٢)`);
L('══════════════════════════════════════════════════════\n');
