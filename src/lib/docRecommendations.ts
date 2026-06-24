/**
 * Какие документы нужны компании — зависит от ОКВЭД.
 * Торговля не нуждается в МЧС. IT не нуждается в СРО.
 */

export interface DocRecommendation {
  value: string;
  label: string;
  desc: string;
  color: string;
  priority: "required" | "important" | "optional";
  reason: string;
}

// Универсальные для производителей / подрядчиков (не торговые поставщики)
const UNIVERSAL_CONTRACTOR: DocRecommendation[] = [
  {
    value: "egrul",
    label: "Выписка ЕГРЮЛ",
    desc: "Подтверждение реквизитов — желательна при крупных тендерах",
    color: "#10b981",
    priority: "important",
    reason: "Заказчик может запросить при подаче заявки",
  },
  {
    value: "balance",
    label: "Бухгалтерский баланс",
    desc: "Подтверждение оборота — или укажите оборот в профиле",
    color: "#06b6d4",
    priority: "important",
    reason: "Нужен для тендеров с требованием к финансовым показателям",
  },
];

// Для поставщиков — ЕГРЮЛ и баланс не в приоритете, оборот из профиля
const UNIVERSAL_SUPPLIER: DocRecommendation[] = [
  {
    value: "egrul",
    label: "Выписка ЕГРЮЛ",
    desc: "Может понадобиться при подаче заявки — для анализа в TenderAI не обязательна",
    color: "#64748b",
    priority: "optional",
    reason: "Поставщикам важнее РУ, сертификаты и реестр контрактов",
  },
];

/** Торговая / поставочная компания (не завод, не подрядчик) */
export function isTradeSupplier(okvedCodes: string[]): boolean {
  if (okvedCodes.length === 0) return true;
  const SUPPLIER_SECTIONS = ["46", "47", "32", "21"];
  return okvedCodes.some((c) => SUPPLIER_SECTIONS.includes(c.split(".")[0]));
}

// По категориям ОКВЭД
const BY_OKVED: Record<string, DocRecommendation[]> = {
  // IT и разработка
  "62": [
    {
      value: "license_fstec",
      label: "Лицензия ФСТЭК",
      desc: "Техническая защита конфиденциальной информации — нужна в гос. IT-тендерах",
      color: "#8b5cf6",
      priority: "important",
      reason: "Большинство IT-тендеров для госструктур требуют ФСТЭК",
    },
    {
      value: "license_fsb",
      label: "Лицензия ФСБ",
      desc: "Нужна если занимаетесь шифрованием, VPN, криптографией",
      color: "#3b82f6",
      priority: "optional",
      reason: "Требуется для тендеров на защищённые каналы связи и СКЗИ",
    },
    {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта в госзакупках — критично для крупных IT-тендеров",
      color: "#f97316",
      priority: "important",
      reason: "Тендеры от 5 млн ₽ требуют опыт аналогичных работ",
    },
  ],

  // IT-оборудование, электроника
  "26": [
    {
      value: "certificate",
      label: "Сертификат на продукцию",
      desc: "Декларация соответствия ГОСТ на поставляемое оборудование",
      color: "#ec4899",
      priority: "required",
      reason: "Требуется для подтверждения характеристик оборудования",
    },
    {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта поставок",
      color: "#f97316",
      priority: "important",
      reason: "Нужен для тендеров с требованием опыта",
    },
  ],

  // Безопасность, охрана
  "80": [
    {
      value: "license_fsb",
      label: "Лицензия ФСБ",
      desc: "Деятельность в области защиты информации и монтаж СКУД",
      color: "#3b82f6",
      priority: "required",
      reason: "Большинство тендеров на безопасность требуют ФСБ",
    },
    {
      value: "license_fstec",
      label: "Лицензия ФСТЭК",
      desc: "Техническая защита информации",
      color: "#8b5cf6",
      priority: "important",
      reason: "Нужна для тендеров на защиту конфиденциальных данных",
    },
    {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта охраны и монтажа систем безопасности",
      color: "#f97316",
      priority: "important",
      reason: "Требуется для объектов с пропускным режимом",
    },
  ],

  // Строительство
  "41": [
    {
      value: "license_sro",
      label: "Допуск СРО",
      desc: "Без СРО нельзя участвовать в строительных тендерах от 3 млн ₽",
      color: "#10b981",
      priority: "required",
      reason: "Обязателен для строительных работ",
    },
    {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта строительных работ",
      color: "#f97316",
      priority: "important",
      reason: "Требуется для крупных объектов",
    },
  ],
  "43": [
    {
      value: "license_sro",
      label: "Допуск СРО",
      desc: "Монтажные, электротехнические, сантехнические работы",
      color: "#10b981",
      priority: "required",
      reason: "Обязателен для специализированных строительных работ",
    },
    {
      value: "license_mchs",
      label: "Лицензия МЧС",
      desc: "Нужна только если занимаетесь монтажом пожарной сигнализации",
      color: "#f59e0b",
      priority: "optional",
      reason: "Только для пожарных систем и оповещения",
    },
  ],

  // Торговля
  "47": [
    {
      value: "certificate",
      label: "Сертификат на продукцию",
      desc: "Декларация соответствия ГОСТ на поставляемые товары",
      color: "#ec4899",
      priority: "required",
      reason: "Заказчик проверяет соответствие характеристик товара ТЗ",
    },
    {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта поставок аналогичной продукции",
      color: "#f97316",
      priority: "important",
      reason: "Подтверждает что вы уже поставляли товары государству",
    },
  ],
  "46": [
    {
      value: "certificate",
      label: "Сертификат на продукцию",
      desc: "Декларация соответствия на оптовые товары",
      color: "#ec4899",
      priority: "required",
      reason: "Обязателен при поставках товаров госзаказчику",
    },
    {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта оптовых поставок",
      color: "#f97316",
      priority: "important",
      reason: "Требуется в большинстве тендеров на поставку",
    },
  ],

  // Медицина
  "32": [
    {
      value: "medical_ru",
      label: "Регистрационное удостоверение (РУ)",
      desc: "РУ Росздравнадзора с приложением — перечень всех медизделий поставщика",
      color: "#ec4899",
      priority: "required",
      reason: "Для медтендеров нужен РУ с каталогом изделий, а не сертификат на 1 товар",
    },
    {
      value: "certificate",
      label: "Сертификаты / декларации ГОСТ",
      desc: "Дополнительно к РУ — на отдельные позиции при необходимости",
      color: "#a855f7",
      priority: "optional",
      reason: "РУ важнее — сертификат покрывает только одну позицию",
    },
  ],
  "86": [
    {
      value: "license_fstec",
      label: "Лицензия на медицинскую деятельность",
      desc: "Обязательна для медицинских учреждений",
      color: "#8b5cf6",
      priority: "required",
      reason: "Обязательное лицензирование медицинской деятельности",
    },
  ],

  // Образование
  "85": [
    {
      value: "license_fstec",
      label: "Лицензия на образовательную деятельность",
      desc: "Обязательна для тендеров на обучение и курсы",
      color: "#8b5cf6",
      priority: "required",
      reason: "Без лицензии нельзя проводить обучение по госконтракту",
    },
  ],

  // Мебель и производство
  "31": [
    {
      value: "certificate",
      label: "Сертификат соответствия ГОСТ",
      desc: "Подтверждение качества мебели — ГОСТ 16371",
      color: "#ec4899",
      priority: "required",
      reason: "Обязателен для поставки мебели государственным заказчикам",
    },
  ],
};

export function getDocRecommendations(okvedCodes: string[]): DocRecommendation[] {
  const recommendations = new Map<string, DocRecommendation>();

  const universal = isTradeSupplier(okvedCodes) ? UNIVERSAL_SUPPLIER : UNIVERSAL_CONTRACTOR;
  for (const doc of universal) {
    recommendations.set(doc.value, doc);
  }

  // По ОКВЭД
  for (const code of okvedCodes) {
    // Берём первые 2 цифры (раздел)
    const section = code.split(".")[0];

    const matches = BY_OKVED[section] || BY_OKVED[code] || [];
    for (const doc of matches) {
      if (!recommendations.has(doc.value)) {
        recommendations.set(doc.value, doc);
      }
    }
  }

  // Контракты ЕИС нужны почти всем
  if (!recommendations.has("contracts")) {
    recommendations.set("contracts", {
      value: "contracts",
      label: "Реестр контрактов ЕИС",
      desc: "Подтверждение опыта госконтрактов — критично для крупных тендеров",
      color: "#f97316",
      priority: "important",
      reason: "Тендеры от 3 млн ₽ требуют подтверждённый опыт",
    });
  }

  return Array.from(recommendations.values()).sort((a, b) => {
    const order = { required: 0, important: 1, optional: 2 };
    return order[a.priority] - order[b.priority];
  });
}

/**
 * Проверяет соответствует ли загруженный документ профилю компании
 * Возвращает предупреждение если документ выглядит нерелевантным
 */
export function validateDocForProfile(
  docType: string,
  docName: string,
  okvedCodes: string[]
): string | null {
  const okvedSections = okvedCodes.map((c) => c.split(".")[0]);

  // Торговля загружает лицензию МЧС — предупреждение
  if (docType === "license_mchs" && okvedSections.some((s) => ["46", "47"].includes(s))) {
    return "Лицензия МЧС обычно нужна строительным компаниям. Торговым компаниям она как правило не требуется. Проверьте что загружаете нужный документ.";
  }

  // IT компания загружает СРО
  if (docType === "license_sro" && okvedSections.some((s) => ["62", "63"].includes(s))) {
    return "Допуск СРО нужен строительным компаниям. IT-компаниям он обычно не требуется. Возможно вы хотели загрузить лицензию ФСТЭК?";
  }

  // Медицинская лицензия для IT — предупреждение
  if (docType === "certificate" && okvedSections.some((s) => ["62", "63"].includes(s))) {
    // Допустимо — IT может поставлять сертифицированное ПО
    return null;
  }

  // Пробуем определить по названию файла
  const nameLower = docName.toLowerCase();

  // Нашли спортивный документ
  if (
    nameLower.includes("русада") ||
    nameLower.includes("rusada") ||
    nameLower.includes("спорт") ||
    nameLower.includes("допинг") ||
    nameLower.includes("антидопинг")
  ) {
    return "⚠️ Кажется, это спортивный документ (РУСАДА/антидопинг). Для тендеров нужны документы компании — лицензии, сертификаты соответствия ГОСТ, выписки. Пожалуйста, загрузите подходящий документ.";
  }

  // Личный документ вместо корпоративного
  if (
    nameLower.includes("паспорт") ||
    nameLower.includes("снилс") ||
    nameLower.includes("инн физ") ||
    nameLower.includes("диплом")
  ) {
    return "⚠️ Похоже, это личный документ. Для тендеров нужны документы юридического лица — лицензии, выписки, балансы.";
  }

  return null;
}
