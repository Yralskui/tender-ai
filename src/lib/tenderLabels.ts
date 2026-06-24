import { prisma } from "@/lib/prisma";

export const DEFAULT_TENDER_LABELS = [
  { name: "Интересно", color: "#2563eb", sortOrder: 0 },
  { name: "В работе", color: "#d97706", sortOrder: 1 },
  { name: "Участвуем", color: "#059669", sortOrder: 2 },
  { name: "Отказ", color: "#dc2626", sortOrder: 3 },
] as const;

export async function ensureDefaultTenderLabels(companyId: string) {
  const existing = await prisma.tenderLabel.count({ where: { companyId } });
  if (existing > 0) return;

  await prisma.tenderLabel.createMany({
    data: DEFAULT_TENDER_LABELS.map((l) => ({ ...l, companyId })),
  });
}

export async function listCompanyTenderLabels(companyId: string) {
  await ensureDefaultTenderLabels(companyId);
  return prisma.tenderLabel.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listTenderLabelAssignments(companyId: string, tenderId: string) {
  return prisma.tenderLabelAssignment.findMany({
    where: { companyId, tenderId },
    include: { label: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listTenderIdsByLabel(companyId: string, labelId: string): Promise<string[]> {
  const rows = await prisma.tenderLabelAssignment.findMany({
    where: { companyId, labelId },
    select: { tenderId: true },
  });
  return rows.map((r) => r.tenderId);
}

/** Все тендеры компании, у которых есть хотя бы одна метка */
export async function listAllTaggedTenderIds(companyId: string): Promise<string[]> {
  const rows = await prisma.tenderLabelAssignment.findMany({
    where: { companyId },
    select: { tenderId: true },
    distinct: ["tenderId"],
  });
  return rows.map((r) => r.tenderId);
}

export async function countAssignmentsByLabel(companyId: string): Promise<Map<string, number>> {
  const rows = await prisma.tenderLabelAssignment.groupBy({
    by: ["labelId"],
    where: { companyId },
    _count: { tenderId: true },
  });
  return new Map(rows.map((r) => [r.labelId, r._count.tenderId]));
}

export async function updateTenderLabel(
  companyId: string,
  labelId: string,
  data: { name?: string; color?: string }
) {
  const label = await prisma.tenderLabel.findFirst({ where: { id: labelId, companyId } });
  if (!label) throw new Error("label_not_found");

  return prisma.tenderLabel.update({
    where: { id: labelId },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.color !== undefined ? { color: data.color.trim() } : {}),
    },
  });
}

export async function deleteCompanyTenderLabel(companyId: string, labelId: string) {
  const label = await prisma.tenderLabel.findFirst({ where: { id: labelId, companyId } });
  if (!label) throw new Error("label_not_found");
  await prisma.tenderLabel.delete({ where: { id: labelId } });
}

export async function assignTenderLabel(companyId: string, tenderId: string, labelId: string) {
  const label = await prisma.tenderLabel.findFirst({ where: { id: labelId, companyId } });
  if (!label) throw new Error("label_not_found");

  return prisma.tenderLabelAssignment.upsert({
    where: {
      companyId_tenderId_labelId: { companyId, tenderId, labelId },
    },
    create: { companyId, tenderId, labelId },
    update: {},
    include: { label: true },
  });
}

export async function removeTenderLabel(companyId: string, tenderId: string, labelId: string) {
  await prisma.tenderLabelAssignment.deleteMany({
    where: { companyId, tenderId, labelId },
  });
}

export async function listTenderLabelAssignmentsForTenders(
  companyId: string,
  tenderIds: string[]
): Promise<Map<string, { names: string[]; colors: string[] }>> {
  const result = new Map<string, { names: string[]; colors: string[] }>();
  if (tenderIds.length === 0) return result;

  const rows = await prisma.tenderLabelAssignment.findMany({
    where: { companyId, tenderId: { in: tenderIds } },
    include: { label: true },
    orderBy: { createdAt: "asc" },
  });

  for (const row of rows) {
    const prev = result.get(row.tenderId) || { names: [], colors: [] };
    prev.names.push(row.label.name);
    prev.colors.push(row.label.color);
    result.set(row.tenderId, prev);
  }
  return result;
}
