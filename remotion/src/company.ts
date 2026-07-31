// حقائق الشركة المستخدمة في الإعلان
// سنة التأسيس مذكورة على شعار الشركة نفسه: "since 1983"
export const FOUNDED_YEAR = 1983;

/** عدد سنوات الخبرة محسوباً من سنة التأسيس */
export const experienceYears = (): number =>
  new Date().getFullYear() - FOUNDED_YEAR;
