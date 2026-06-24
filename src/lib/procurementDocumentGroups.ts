/** Группа документа для UI (как в Контур.Закупки). Без серверных зависимостей. */
export type ProcurementDocumentGroup = "tz" | "nmck" | "contract" | "notice" | "other";

export function classifyProcurementDocument(name: string | null | undefined): ProcurementDocumentGroup {
  const n = String(name ?? "").toLowerCase();
  if (!n) return "other";
  if (/техническ.*задани|описание\s+объекта|описание\s+предмета|характеристик|\bтз\b|объект\s+закупки/i.test(n)) {
    return "tz";
  }
  if (/нмцк|обоснован/i.test(n)) return "nmck";
  if (/проект\s+контракта|договор|контракт/i.test(n)) return "contract";
  if (/извещени|уведомлен/i.test(n)) return "notice";
  return "other";
}

export const DOCUMENT_GROUP_LABELS: Record<ProcurementDocumentGroup, string> = {
  tz: "Техническое задание / ООЗ",
  nmck: "Обоснование НМЦК",
  contract: "Проект контракта",
  notice: "Извещение",
  other: "Прочие документы",
};
