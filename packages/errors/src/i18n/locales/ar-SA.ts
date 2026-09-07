/**
 * Arabic (ar-SA) locale translations
 *
 * Translations for Saudi Arabic with proper RTL support
 */

import type { ErrorTranslations } from '../i18n.types';

/**
 * Arabic error translations
 *
 * Note: Arabic is a right-to-left (RTL) language.
 * All translations are properly formatted for RTL display.
 */
export const arSA: ErrorTranslations = {
  // User errors (USER_001-010)
  USER_001: 'المستخدم بالمعرف {userId} غير موجود',
  USER_002: 'المستخدم بالبريد الإلكتروني {email} موجود بالفعل',
  USER_003: 'تنسيق البريد الإلكتروني غير صحيح: {email}',
  USER_004: 'كلمة المرور لا تستوفي متطلبات الأمان',
  USER_005: 'كلمات المرور غير متطابقة',
  USER_006: 'حساب المستخدم معطل',
  USER_007: 'حساب المستخدم موقوف: {reason}',
  USER_008: 'تنسيق رقم الهاتف غير صحيح: {phone}',
  USER_009: 'حجم صورة الملف الشخصي يتجاوز الحد الأقصى المسموح به {maxSize} ميجابايت',
  USER_010: 'لا يمكن حذف حسابك الخاص',

  // Authentication errors (AUTH_001-010)
  AUTH_001: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  AUTH_002: 'رمز المصادقة مفقود',
  AUTH_003: 'رمز المصادقة غير صالح أو منتهي الصلاحية',
  AUTH_004: 'أذونات غير كافية: مطلوب {requiredPermission}',
  AUTH_005: 'رمز المصادقة الثنائية غير صحيح',
  AUTH_006: 'محاولات تسجيل دخول فاشلة كثيرة. الحساب مغلق لمدة {lockoutMinutes} دقيقة',
  AUTH_007: 'رمز إعادة تعيين كلمة المرور غير صالح أو منتهي الصلاحية',
  AUTH_008: 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى',
  AUTH_009: 'تم رفض الوصول من الموقع: {country}',
  AUTH_010: 'تعيين دور غير صالح: لا يمكن للمستخدم أن يكون له الدور {role}',

  // Validation errors (VAL_001-009)
  VAL_001: 'فشل التحقق: {field} مطلوب',
  VAL_002: 'قيمة غير صالحة لـ {field}: متوقع {expectedType}',
  VAL_003: 'يجب أن تكون قيمة {field} بين {min} و {max}',
  VAL_004: 'يجب أن يكون نص {field} بين {minLength} و {maxLength} حرف',
  VAL_005: 'تنسيق UUID غير صالح: {value}',
  VAL_006: 'تنسيق التاريخ غير صالح: {date}. التنسيق المتوقع: {expectedFormat}',
  VAL_007: 'تنسيق URL غير صالح: {url}',
  VAL_008: 'يجب أن يكون التاريخ {field} في المستقبل',
  VAL_009: 'يجب أن يكون التاريخ {field} في الماضي',

  // Database errors (DB_001-010)
  DB_001: 'فشل الاتصال بقاعدة البيانات',
  DB_002: 'فقدان الاتصال بقاعدة البيانات',
  DB_003: 'السجل موجود بالفعل: {entity}',
  DB_004: 'السجل غير موجود في قاعدة البيانات',
  DB_005: 'فشل استعلام قاعدة البيانات',
  DB_006: 'انتهاك قيد المفتاح الخارجي',
  DB_007: 'فشل معاملة قاعدة البيانات',
  DB_008: 'عدد كبير جداً من اتصالات قاعدة البيانات',
  DB_009: 'معامل استعلام غير صالح: {parameter}',
  DB_010: 'انتهاك قيد التفرد',

  // Business errors (BIZ_001-008)
  BIZ_001: 'العملية غير مسموح بها: {reason}',
  BIZ_002: 'لا يمكن تعديل {entity} في الحالة {status}',
  BIZ_003: 'رصيد غير كافٍ: مطلوب {required}، متاح {available}',
  BIZ_004: 'المورد بالفعل {action}',
  BIZ_005: 'تم الوصول إلى الحد الأقصى من {limit} {entity}',
  BIZ_006: 'مطلوب اشتراك لهذه الميزة',
  BIZ_007: 'انتهت فترة التجربة المجانية',
  BIZ_008: 'انتقال سير عمل غير صالح من {currentStatus} إلى {newStatus}',

  // External service errors (EXT_001-007)
  EXT_001: 'فشل الاتصال بـ {service}',
  EXT_002: '{service} أرجع خطأ: {errorMessage}',
  EXT_003: 'انتهت مهلة طلب {service}',
  EXT_004: 'مفتاح API غير صالح لـ {service}',
  EXT_005: 'تم تجاوز حد المعدل لـ {service}. أعد المحاولة بعد {retryAfter} ثانية',
  EXT_006: '{service} غير متاح حالياً',
  EXT_007: 'فشل تسليم webhook: {reason}',

  // File errors (FILE_001-008)
  FILE_001: 'فشل رفع الملف: {reason}',
  FILE_002: 'نوع ملف غير صالح: {fileType}. الأنواع المسموحة: {allowedTypes}',
  FILE_003: 'حجم الملف {size} ميجابايت يتجاوز الحد الأقصى المسموح به {maxSize} ميجابايت',
  FILE_004: 'الملف غير موجود: {filename}',
  FILE_005: 'تم رفض الإذن للوصول إلى الملف: {filename}',
  FILE_006: 'خطأ في تخزين الملف: {reason}',
  FILE_007: 'الملف تالف أو غير صالح: {filename}',
  FILE_008: 'مساحة تخزين غير كافية',

  // System errors (SYS_001-010)
  SYS_001: 'خطأ في الخادم الداخلي',
  SYS_002: 'الخدمة غير متاحة مؤقتاً',
  SYS_003: 'خطأ في التكوين: {configKey}',
  SYS_004: 'الميزة {feature} غير مفعلة',
  SYS_005: 'تم تجاوز حد المعدل. حاول مرة أخرى خلال {retryAfter} ثانية',
  SYS_006: 'خطأ في خدمة التخزين المؤقت',
  SYS_007: 'فشل معالجة الوظيفة: {jobType}',
  SYS_008: 'خطأ في قائمة الرسائل',
  SYS_009: 'فشل إرسال البريد الإلكتروني',
  SYS_010: 'خطأ في الجدولة: {task}'
};
