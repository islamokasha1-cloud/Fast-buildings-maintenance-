// قائمة عملاء الشركة — تظهر في مشهد «عملاؤنا»
//
// لإضافة عميل:
//   1. ضع ملف اللوجو في:  public/clients/<اسم-الملف>.png
//   2. أضف سطراً هنا:      { name: "اسم العميل", logo: "clients/<اسم-الملف>.png" }
//
// حقل logo اختياري — إن لم يتوفر لوجو، تظهر أيقونة الجهة تلقائياً
// بدل صورة مفقودة، فيبقى المشهد مكتملاً.

export type Client = {
  /** اسم العميل كما يُعرض في الفيديو */
  name: string;
  /** مسار اللوجو داخل مجلد public (اختياري) */
  logo?: string;
  /** وصف مختصر أسفل الاسم (اختياري) */
  sector?: string;
};

export const clients: Client[] = [
  { name: "أمانة منطقة حائل", sector: "جهة حكومية", logo: "clients/hail-municipality.png" },
  { name: "جامعة الملك سعود", sector: "قطاع تعليمي", logo: "clients/ksu.png" },
  { name: "المؤسسة العامة للحبوب", sector: "جهة حكومية", logo: "clients/sago.png" },
  { name: "مصرف الراجحي", sector: "قطاع مصرفي", logo: "clients/alrajhi.png" },
  { name: "امنكو", sector: "قطاع خاص", logo: "clients/amnco.png" },
];
