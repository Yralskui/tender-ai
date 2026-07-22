import { prisma } from "../src/lib/prisma";

const EXTERNAL_ID = "0372100049626001575";

const realNames: Record<string, string> = {
  "1": "Простыни одноразового использования в рулоне (нестерильная 50 см х 50 м) (Пеленка (простыня) бумажная",
  "2": "Простыни одноразового использования СМС в рулоне",
  "3": "Простыня впитывающая Простыня впитывающая КОБХ-009 (бумажным покрытием (нестерильная 70 х 200 см)",
  "4": "Простыня одноразового использования белая",
  "5": "Простыня СМС одноразового использования",
  "6": "Салфетка на гинекологическое кресло",
  "7": "Салфетка одноразового использования",
};

const volumes: Record<string, { quantity: number; unit: string }> = {
  "1": { quantity: 990, unit: "рул." },
  "2": { quantity: 1092, unit: "рул." },
  "3": { quantity: 564, unit: "упак" },
  "4": { quantity: 1121, unit: "упак" },
  "5": { quantity: 345, unit: "упак" },
  "6": { quantity: 285, unit: "упак" },
  "7": { quantity: 140, unit: "упак" },
};

// Характеристики, ранее привязанные к заглушкам «Позиция N (поз. N)» — переносим
// под реальные названия, попутно чиня склеенные пробелы из исходного текста.
const characteristics: Record<string, string[]> = {
  "1": [
    "Простыни целлюлозные: не менее чем в два слоя",
    "Размер материала в рулоне: не менее 50 см х 50 м и не более 55 см х 55 м",
  ],
  "2": [
    "Размер материала в рулоне: 70 см х 200 м и не более 75 см х 200 м",
    "Плотность материала: не менее 20 г/м2",
  ],
  "3": [
    "Общая плотность материала: не менее 55 г/м2",
    "Плотность целлюлозной основы: не менее 30 г/м2",
  ],
  "4": [
    "Размер простыни: 70-75х100-120 см",
    "Состав простыни: вискоза не менее 75%, полиэфир не менее 24%",
  ],
  "5": ["Размер простыни: менее 80х105 и более 70х98 см"],
  "6": ["Второй слой непрозрачная пленка высокого давления толщиной: 35-40 мкм"],
  "7": [
    "Плотность материала: не менее 17 и не более 20 г/м2",
    "Размер салфетки: не менее 70х80 и не более 73х83 см",
  ],
};

// Строки без привязки к позиции (конфликтуют по значениям с чем-то из characteristics
// выше — не подставляем без источника, чтобы не приписать не туда) — оставляем как
// общий контекст ТЗ, не привязывая к конкретной позиции.
const unattributedSpecs = [
  "Перфорация с равным шагом: >= 37 и <= 40",
  "Диаметр внешний втулки: >= 29 и <= 32",
  "Толщина стенок втулки: >= 4 и <= 6",
  "Перфорация материала через: 2",
  "Цвет: синий или зеленый",
  "Плотность п/э плёнки: не менее 25 г/м2",
  "Размер: не менее 70х200 и не более 75х210 см",
  "Размер салфетки (альтернативное значение): не менее 35х45 и не более 45х45 см",
];

async function main() {
  const tender = await prisma.tender.findFirst({ where: { externalId: EXTERNAL_ID } });
  if (!tender) {
    console.error("not found");
    return;
  }
  const reqs = JSON.parse(tender.requirements || "{}");

  const productSpecs: string[] = [];
  const tzVolumes: Array<{ name: string; ktruCode: string; quantity: number; unit: string; position: string }> = [];
  const tzProducts: string[] = [];

  for (const pos of ["1", "2", "3", "4", "5", "6", "7"]) {
    const name = realNames[pos];
    const vol = volumes[pos];
    productSpecs.push(`Позиция ТЗ №: ${pos}`);
    productSpecs.push(`Позиция ТЗ: ${name}`);
    productSpecs.push(`Объём закупки: ${vol.quantity} ${vol.unit} — ${name}`);
    for (const ch of characteristics[pos] || []) {
      const [field, ...rest] = ch.split(":");
      productSpecs.push(`${name} — ${field.trim()}:${rest.join(":")}`);
    }
    tzVolumes.push({ name, ktruCode: "", quantity: vol.quantity, unit: vol.unit, position: pos });
    tzProducts.push(name);
  }

  productSpecs.push(...unattributedSpecs);

  await prisma.tender.update({
    where: { id: tender.id },
    data: {
      requirements: JSON.stringify({
        ...reqs,
        productSpecs,
        tzProducts,
        tzVolumes,
        tzReparsedAt: new Date().toISOString(),
      }),
    },
  });

  console.log("updated. specs:", productSpecs.length, "volumes:", tzVolumes.length);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
