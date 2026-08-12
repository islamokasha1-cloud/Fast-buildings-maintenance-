# فيديو تعريف المنصة — ملفات جاهزة

فرعٌ للملفات الثقيلة فقط. **لا يُدمَج في `main`** — وجودُه هنا لتحميل الفيديو من
واجهة GitHub، لأن رفعَ أصولِ الإصدارات (Releases) غير متاحٍ من جلسة التوليد.

| الملف | الدقة | المدة | الحجم |
|---|---|---|---|
| `promo-film-4k.mp4` | 3840×2160 | ٢:٣٩ | ~٤٠ م.ب |
| `promo-film-1080-from4k.mp4` | 1920×1080 (مسحوبة من أصل 4K) | ٢:٣٩ | ~١٥ م.ب |

يُعاد توليدُهما في أي وقتٍ من الفرع الرئيسي:

```bash
npm install --no-save playwright-core ffmpeg-static
cd remotion && npm install && cd ..
node promo-assemble.mjs --4k     # → dist-video/promo-film-4k.mp4
node promo-assemble.mjs          # → dist-video/promo-film.mp4 (1080p)
```

بعد تنزيل الملفات يمكن حذفُ هذا الفرع بلا أثر:
`git push origin --delete media/promo-4k`
