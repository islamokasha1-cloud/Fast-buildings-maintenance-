/* ═══════════════════════════════════════════════════════════════════════════
   نظام هيل — مُرمِّز QR  (qr-code.js)

   ── المشكلة ──
   الخطابُ الصادرُ يحمل باركود Code 128 برقمه، والرقمُ وحدَه لا يُثبت شيئاً: مَن
   يستلم الورقةَ لا يستطيع التحقّقَ من أنّ الشركةَ أصدرتها فعلاً. المطلوبُ رمزٌ
   يحمل **رابطَ تحقّق** تفتحه كاميرا الجوّال فتقول صفحةُ الشركة: صادرٌ برقم كذا
   بتاريخ كذا إلى جهة كذا وموقّعُه فلان. والرابطُ ~١٠٠ محرف، ولا يسعه Code 128.

   ── لماذا مُرمِّزٌ في المستودع لا مكتبةٌ من CDN ──
   المطبوعةُ تُبنى في **نافذةٍ جديدة** بـ`document.write` (وعلى iOS مستندُ `blob:`).
   ووسمُ <script> من CDN هناك سباقٌ مع أمر الطباعة: تُطبَع الورقةُ قبل أن يصل
   الملفُّ فيخرج الخطابُ **بلا رمزٍ ولا خطأٍ يُنذر** (علّةُ اختيار Code 128 المرسوم
   يدوياً في `doc-vault.js`). فالرمزُ يُرسَم SVG **نصّاً داخل الصفحة نفسِها** —
   يصل معها أو لا تصل هي. والمُرمِّزُ هنا وحدةٌ حسابيةٌ قائمةٌ بنفسها (نمطُ ISO/IEC
   18004: نمطُ البايت · تصحيح ريد-سولومون · الأقنعةُ الثمانية · الإصداراتُ ١–٤٠)
   يُعرَض على `window.qrCode` ويقرؤه مَن يحتاجه بالاسم وقتَ النداء.

   ── الصحّةُ تُثبَت بفكّ الترميز لا بالمطابقة ──
   جداولُ التصحيح (١٦٠ صفّاً) لا تُراجَع بالعين. فحارسُ `hail-tests.js` يرمّز نصّاً
   بكلّ إصدارٍ ومستوى ثمّ **يفكّه بمكتبة قراءةٍ مستقلّة** (`jsqr`) — صفٌّ خاطئٌ
   في الجدول يُنتج رمزاً لا يُقرأ فيسقط الفحص. وحارسٌ ثانٍ يطابق مجموعَ الجدول
   بعدد الوحدات الحرّة في المصفوفة: فالجدولُ والهندسةُ مصدران مستقلّان للرقم نفسِه.

   ── الواجهة ──
   `qrCode.encode(text, {ecl})` ⇐ `{version, size, ecl, mask, get(r,c)}`
   `qrCode.svg(text, {ecl, module, quiet, color})` ⇐ SVG نصّاً (بلا أبعادٍ ثابتة —
   يتحجّم بحاويته). ومستوى التصحيح الافتراضيّ `M` كما على المطبوعات الرسمية.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var MODULE_BUILD = "v18.9.3189";

/* ════════ حقلُ غالوا GF(256) — كثيرُ الحدود 0x11D ════════ */
var EXP = new Array(512), LOG = new Array(256);
(function(){
  var x = 1;
  for(var i = 0; i < 255; i++){ EXP[i] = x; LOG[x] = i; x <<= 1; if(x & 0x100) x ^= 0x11D; }
  for(var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
})();
function gmul(a, b){ return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }
/* مولّدُ ريد-سولومون بدرجة n: Π (x − α^i) — المعاملُ الأعلى أوّلاً */
function rsGenerator(n){
  var g = [1];
  for(var i = 0; i < n; i++){
    var ng = new Array(g.length + 1);
    for(var k = 0; k < ng.length; k++) ng[k] = 0;
    for(var j = 0; j < g.length; j++){ ng[j] ^= g[j]; ng[j + 1] ^= gmul(g[j], EXP[i]); }
    g = ng;
  }
  return g;
}
function rsEncode(data, n){
  var g = rsGenerator(n), res = new Array(n);
  for(var k = 0; k < n; k++) res[k] = 0;
  for(var i = 0; i < data.length; i++){
    var f = data[i] ^ res[0];
    res.shift(); res.push(0);
    if(f) for(var j = 0; j < n; j++) res[j] ^= gmul(g[j + 1], f);
  }
  return res;
}

/* ════════ الجداولُ القياسية (ISO/IEC 18004 — الجدول 9) ════════
   لكلّ إصدارٍ أربعةُ صفوفٍ بترتيب L · M · Q · H، وكلُّ صفّ:
   [رموزُ التصحيح لكلّ كتلة، كتلُ المجموعة ١، بياناتُها، كتلُ المجموعة ٢، بياناتُها] */
var EC_TABLE = [
  [[7,1,19,0,0],[10,1,16,0,0],[13,1,13,0,0],[17,1,9,0,0]],
  [[10,1,34,0,0],[16,1,28,0,0],[22,1,22,0,0],[28,1,16,0,0]],
  [[15,1,55,0,0],[26,1,44,0,0],[18,2,17,0,0],[22,2,13,0,0]],
  [[20,1,80,0,0],[18,2,32,0,0],[26,2,24,0,0],[16,4,9,0,0]],
  [[26,1,108,0,0],[24,2,43,0,0],[18,2,15,2,16],[22,2,11,2,12]],
  [[18,2,68,0,0],[16,4,27,0,0],[24,4,19,0,0],[28,4,15,0,0]],
  [[20,2,78,0,0],[18,4,31,0,0],[18,2,14,4,15],[26,4,13,1,14]],
  [[24,2,97,0,0],[22,2,38,2,39],[22,4,18,2,19],[26,4,14,2,15]],
  [[30,2,116,0,0],[22,3,36,2,37],[20,4,16,4,17],[24,4,12,4,13]],
  [[18,2,68,2,69],[26,4,43,1,44],[24,6,19,2,20],[28,6,15,2,16]],
  [[20,4,81,0,0],[30,1,50,4,51],[28,4,22,4,23],[24,3,12,8,13]],
  [[24,2,92,2,93],[22,6,36,2,37],[26,4,20,6,21],[28,7,14,4,15]],
  [[26,4,107,0,0],[22,8,37,1,38],[24,8,20,4,21],[22,12,11,4,12]],
  [[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
  [[22,5,87,1,88],[24,5,41,5,42],[30,5,24,7,25],[24,11,12,7,13]],
  [[24,5,98,1,99],[28,7,45,3,46],[24,15,19,2,20],[30,3,15,13,16]],
  [[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
  [[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
  [[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
  [[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]],
  [[28,4,116,4,117],[26,17,42,0,0],[28,17,22,6,23],[30,19,16,6,17]],
  [[28,2,111,7,112],[28,17,46,0,0],[30,7,24,16,25],[24,34,13,0,0]],
  [[30,4,121,5,122],[28,4,47,14,48],[30,11,24,14,25],[30,16,15,14,16]],
  [[30,6,117,4,118],[28,6,45,14,46],[30,11,24,16,25],[30,30,16,2,17]],
  [[26,8,106,4,107],[28,8,47,13,48],[30,7,24,22,25],[30,22,15,13,16]],
  [[28,10,114,2,115],[28,19,46,4,47],[28,28,22,6,23],[30,33,16,4,17]],
  [[30,8,122,4,123],[28,22,45,3,46],[30,8,23,26,24],[30,12,15,28,16]],
  [[30,3,117,10,118],[28,3,45,23,46],[30,4,24,31,25],[30,11,15,31,16]],
  [[30,7,116,7,117],[28,21,45,7,46],[30,1,23,37,24],[30,19,15,26,16]],
  [[30,5,115,10,116],[28,19,47,10,48],[30,15,24,25,25],[30,23,15,25,16]],
  [[30,13,115,3,116],[28,2,46,29,47],[30,42,24,1,25],[30,23,15,28,16]],
  [[30,17,115,0,0],[28,10,46,23,47],[30,10,24,35,25],[30,19,15,35,16]],
  [[30,17,115,1,116],[28,14,46,21,47],[30,29,24,19,25],[30,11,15,46,16]],
  [[30,13,115,6,116],[28,14,46,23,47],[30,44,24,7,25],[30,59,16,1,17]],
  [[30,12,121,7,122],[28,12,47,26,48],[30,39,24,14,25],[30,22,15,41,16]],
  [[30,6,121,14,122],[28,6,47,34,48],[30,46,24,10,25],[30,2,15,64,16]],
  [[30,17,122,4,123],[28,29,46,14,47],[30,49,24,10,25],[30,24,15,46,16]],
  [[30,4,122,18,123],[28,13,46,32,47],[30,48,24,14,25],[30,42,15,32,16]],
  [[30,20,117,4,118],[28,40,47,7,48],[30,43,24,22,25],[30,10,15,67,16]],
  [[30,19,118,6,119],[28,18,47,31,48],[30,34,24,34,25],[30,20,15,61,16]]
];
/* مراكزُ أنماط المحاذاة (الإصداران ١ بلا مراكز) */
var ALIGN = [
  [], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38], [6,24,42], [6,26,46], [6,28,50],
  [6,30,54], [6,32,58], [6,34,62], [6,26,46,66], [6,26,48,70], [6,26,50,74], [6,30,54,78],
  [6,30,56,82], [6,30,58,86], [6,34,62,90], [6,28,50,72,94], [6,26,50,74,98],
  [6,30,54,78,102], [6,28,54,80,106], [6,32,58,84,110], [6,30,58,86,114], [6,34,62,90,118],
  [6,26,50,74,98,122], [6,30,54,78,102,126], [6,26,52,78,104,130], [6,30,56,82,108,134],
  [6,34,60,86,112,138], [6,30,58,86,114,142], [6,34,62,90,118,146], [6,30,54,78,102,126,150],
  [6,24,50,76,102,128,154], [6,28,54,80,106,132,158], [6,32,58,84,110,136,162],
  [6,26,54,82,110,138,166], [6,30,58,86,114,142,170]
];
var ECL = { L:0, M:1, Q:2, H:3 };
var ECL_BITS = [1, 0, 3, 2];   // ترميزُ المستوى في معلومات التنسيق

function eclIndex(e){ var k = String(e || "M").toUpperCase(); return (k in ECL) ? ECL[k] : 1; }
function eclName(i){ return ["L","M","Q","H"][i]; }
function dataCapacity(version, ecl){ var r = EC_TABLE[version - 1][ecl]; return r[1]*r[2] + r[3]*r[4]; }
function totalCodewords(version, ecl){ var r = EC_TABLE[version - 1][ecl]; return dataCapacity(version, ecl) + (r[1] + r[3]) * r[0]; }
function countBits(version){ return version <= 9 ? 8 : 16; }
function sizeOf(version){ return 17 + 4 * version; }

/* ════════ النصّ ⇐ بايتات UTF-8 ════════ */
function utf8(str){
  var s = String(str == null ? "" : str), out = [];
  for(var i = 0; i < s.length; i++){
    var c = s.charCodeAt(i);
    if(c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length){
      var d = s.charCodeAt(i + 1);
      if(d >= 0xDC00 && d <= 0xDFFF){ c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
    }
    if(c < 0x80) out.push(c);
    else if(c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if(c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/* ════════ البيانات ⇐ رموزُ البيانات والتصحيح مُشابكةً ════════ */
function pickVersion(nBytes, ecl, minVersion){
  for(var v = Math.max(1, minVersion || 1); v <= 40; v++){
    if(4 + countBits(v) + 8 * nBytes <= dataCapacity(v, ecl) * 8) return v;
  }
  return 0;
}
function buildCodewords(bytes, version, ecl){
  var bits = [], i;
  var push = function(val, n){ for(var b = n - 1; b >= 0; b--) bits.push((val >> b) & 1); };
  push(4, 4);                              // نمطُ البايت
  push(bytes.length, countBits(version));
  for(i = 0; i < bytes.length; i++) push(bytes[i], 8);
  var cap = dataCapacity(version, ecl) * 8;
  push(0, Math.min(4, cap - bits.length)); // الخاتمة
  while(bits.length % 8) bits.push(0);
  var data = [];
  for(i = 0; i < bits.length; i += 8){
    var byte = 0; for(var b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    data.push(byte);
  }
  for(i = 0; data.length < cap / 8; i++) data.push(i % 2 ? 0x11 : 0xEC);

  var row = EC_TABLE[version - 1][ecl], ecN = row[0];
  var blocks = [], ecs = [], pos = 0, k;
  for(k = 0; k < row[1]; k++){ blocks.push(data.slice(pos, pos + row[2])); pos += row[2]; }
  for(k = 0; k < row[3]; k++){ blocks.push(data.slice(pos, pos + row[4])); pos += row[4]; }
  for(k = 0; k < blocks.length; k++) ecs.push(rsEncode(blocks[k], ecN));

  var out = [], maxD = Math.max(row[2], row[4]);
  for(i = 0; i < maxD; i++) for(k = 0; k < blocks.length; k++) if(i < blocks[k].length) out.push(blocks[k][i]);
  for(i = 0; i < ecN; i++) for(k = 0; k < ecs.length; k++) out.push(ecs[k][i]);
  return out;
}

/* ════════ المصفوفة ════════ */
function Matrix(size){
  this.size = size;
  this.m = new Array(size * size);   // 0/1
  this.f = new Array(size * size);   // وحدةٌ وظيفية (لا تُقنَّع ولا تحمل بيانات)
  for(var i = 0; i < size * size; i++){ this.m[i] = 0; this.f[i] = false; }
}
Matrix.prototype.get = function(r, c){ return this.m[r * this.size + c]; };
Matrix.prototype.set = function(r, c, v){ this.m[r * this.size + c] = v ? 1 : 0; };
Matrix.prototype.setF = function(r, c, v){ var i = r * this.size + c; this.m[i] = v ? 1 : 0; this.f[i] = true; };
Matrix.prototype.isF = function(r, c){ return this.f[r * this.size + c]; };

function drawFinder(mx, r0, c0){
  for(var r = -1; r <= 7; r++) for(var c = -1; c <= 7; c++){
    var rr = r0 + r, cc = c0 + c;
    if(rr < 0 || cc < 0 || rr >= mx.size || cc >= mx.size) continue;
    var d = Math.max(Math.abs(r - 3), Math.abs(c - 3));
    mx.setF(rr, cc, d !== 2 && d !== 4);
  }
}
function drawAlign(mx, r0, c0){
  for(var r = -2; r <= 2; r++) for(var c = -2; c <= 2; c++)
    mx.setF(r0 + r, c0 + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
}
function drawFunctions(mx, version){
  var n = mx.size, i;
  for(i = 0; i < n; i++){ mx.setF(6, i, i % 2 === 0); mx.setF(i, 6, i % 2 === 0); }
  drawFinder(mx, 0, 0); drawFinder(mx, 0, n - 7); drawFinder(mx, n - 7, 0);
  var al = ALIGN[version - 1], L = al.length;
  for(i = 0; i < L; i++) for(var j = 0; j < L; j++){
    if((i === 0 && j === 0) || (i === 0 && j === L - 1) || (i === L - 1 && j === 0)) continue;
    drawAlign(mx, al[i], al[j]);
  }
  drawFormat(mx, 0, 0);          // حجزُ الموضع — يُكتب فعلاً بعد اختيار القناع
  drawVersion(mx, version);
}
function bchFormat(ecl, mask){
  var data = (ECL_BITS[ecl] << 3) | mask, rem = data;
  for(var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function drawFormat(mx, ecl, mask){
  var bits = bchFormat(ecl, mask), n = mx.size, i;
  var bit = function(k){ return (bits >> k) & 1; };
  for(i = 0; i <= 5; i++) mx.setF(i, 8, bit(i));
  mx.setF(7, 8, bit(6)); mx.setF(8, 8, bit(7)); mx.setF(8, 7, bit(8));
  for(i = 9; i <= 14; i++) mx.setF(8, 14 - i, bit(i));
  for(i = 0; i <= 7; i++) mx.setF(8, n - 1 - i, bit(i));
  for(i = 8; i <= 14; i++) mx.setF(n - 15 + i, 8, bit(i));
  mx.setF(n - 8, 8, 1);   // الوحدةُ الداكنةُ الثابتة
}
function drawVersion(mx, version){
  if(version < 7) return;
  var rem = version;
  for(var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
  var bits = (version << 12) | rem, n = mx.size;
  for(var k = 0; k < 18; k++){
    var b = (bits >> k) & 1, a = n - 11 + (k % 3), c = Math.floor(k / 3);
    mx.setF(a, c, b); mx.setF(c, a, b);
  }
}
function placeData(mx, cw){
  var n = mx.size, i = 0, total = cw.length * 8;
  for(var right = n - 1; right >= 1; right -= 2){
    if(right === 6) right = 5;
    for(var vert = 0; vert < n; vert++){
      for(var j = 0; j < 2; j++){
        var c = right - j;
        var upward = ((right + 1) & 2) === 0;
        var r = upward ? n - 1 - vert : vert;
        if(!mx.isF(r, c) && i < total){
          mx.set(r, c, (cw[i >> 3] >> (7 - (i & 7))) & 1);
          i++;
        }
      }
    }
  }
}
function maskBit(k, r, c){
  switch(k){
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return (r * c) % 2 + (r * c) % 3 === 0;
    case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
    default: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
  }
}
function applyMask(mx, k){
  var n = mx.size;
  for(var r = 0; r < n; r++) for(var c = 0; c < n; c++)
    if(!mx.isF(r, c) && maskBit(k, r, c)) mx.set(r, c, !mx.get(r, c));
}
function penalty(mx){
  var n = mx.size, score = 0, r, c, run, prev, dark = 0;
  var finderRun = function(hist){ /* 1011101 مع أربعِ فاتحاتٍ على جانب */
    var core = hist[1] === hist[3] && hist[3] === hist[5] && hist[2] === hist[4]
            && hist[2] === hist[1] * 3 && hist[1] > 0;
    if(!core) return 0;
    return (hist[0] >= hist[1] * 4 ? 1 : 0) + (hist[6] >= hist[1] * 4 ? 1 : 0);
  };
  var scan = function(getter){
    var runs = [0,0,0,0,0,0,0], color = 0, len = 0, s = 0;
    var push = function(l){ runs.shift(); runs.push(l); };
    for(var i = 0; i < n; i++){
      var v = getter(i);
      if(v === color) len++;
      else {
        push(len); if(color === 0) s += 40 * finderRun(runs);
        color = v; len = 1;
      }
      if(len === 5) s += 3; else if(len > 5) s += 1;
    }
    push(len); if(color === 0) s += 40 * finderRun(runs);
    push(n); s += 40 * finderRun(runs);   // حافّةُ الرمز تُحسب فاتحةً
    return s;
  };
  for(r = 0; r < n; r++) score += scan(function(c){ return mx.get(r, c); });
  for(c = 0; c < n; c++) score += scan(function(r){ return mx.get(r, c); });
  for(r = 0; r < n - 1; r++) for(c = 0; c < n - 1; c++){
    var v = mx.get(r, c);
    if(v === mx.get(r, c + 1) && v === mx.get(r + 1, c) && v === mx.get(r + 1, c + 1)) score += 3;
  }
  for(r = 0; r < n; r++) for(c = 0; c < n; c++) dark += mx.get(r, c);
  var k = Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1;
  score += Math.max(0, k) * 10;
  return score;
}

/* ════════ الواجهة ════════ */
function encode(text, opt){
  var o = opt || {};
  var ecl = eclIndex(o.ecl);
  var bytes = utf8(text);
  var version = pickVersion(bytes.length, ecl, o.minVersion);
  if(!version) throw new Error("qr: النصّ أطول من سعة الإصدار 40");
  var cw = buildCodewords(bytes, version, ecl);
  var mx = new Matrix(sizeOf(version));
  drawFunctions(mx, version);
  placeData(mx, cw);
  var best = -1, bestScore = Infinity, k;
  var forced = (typeof o.mask === "number" && o.mask >= 0 && o.mask <= 7) ? o.mask : -1;
  for(k = 0; k < 8; k++){
    if(forced >= 0 && k !== forced) continue;
    applyMask(mx, k); drawFormat(mx, ecl, k);
    var s = penalty(mx);
    if(s < bestScore){ bestScore = s; best = k; }
    applyMask(mx, k);   // القناعُ XOR فتطبيقُه مرّتين يُزيله
  }
  applyMask(mx, best); drawFormat(mx, ecl, best);
  return {
    version: version, size: mx.size, ecl: eclName(ecl), mask: best,
    get: function(r, c){ return mx.get(r, c) === 1; },
    _isFunction: function(r, c){ return mx.isF(r, c); }
  };
}
function svg(text, opt){
  var o = opt || {};
  var q = encode(text, o);
  var quiet = (o.quiet == null) ? 4 : Number(o.quiet);
  var n = q.size, full = n + quiet * 2, d = [];
  for(var r = 0; r < n; r++) for(var c = 0; c < n; c++)
    if(q.get(r, c)) d.push("M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z");
  var px = o.module ? ' width="' + (full * Number(o.module)) + '" height="' + (full * Number(o.module)) + '"' : "";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + full + ' ' + full + '"'
    + px + ' shape-rendering="crispEdges" role="img" aria-label="QR">'
    + '<rect width="' + full + '" height="' + full + '" fill="' + (o.bg || "#fff") + '"/>'
    + '<path d="' + d.join("") + '" fill="' + (o.color || "#000") + '"/></svg>';
}
/* عدُّ الوحدات الحرّة في الهندسة وحدَها — يُقابَل بمجموع الجدول في الحارس */
function freeModules(version){
  var mx = new Matrix(sizeOf(version));
  drawFunctions(mx, version);
  var n = 0;
  for(var i = 0; i < mx.size * mx.size; i++) if(!mx.f[i]) n++;
  return n;
}

window.qrCode = {
  MODULE_BUILD: MODULE_BUILD, build: MODULE_BUILD,
  encode: encode, svg: svg, utf8: utf8,
  dataCapacity: dataCapacity, totalCodewords: totalCodewords, freeModules: freeModules,
  pickVersion: pickVersion, _rsEncode: rsEncode, _bchFormat: bchFormat
};
})();
