/**
 * Денормализованные флаги Tender — синхрон с JSON requirements.
 */

export function flagsFromRequirementsJson(requirementsJson: string): {
  importedFromEis: boolean;
  tzEnrichmentPending: boolean;
} {
  try {
    const r = JSON.parse(requirementsJson) as Record<string, unknown>;
    return flagsFromRequirements(r);
  } catch {
    return { importedFromEis: false, tzEnrichmentPending: false };
  }
}

export function flagsFromRequirements(req: Record<string, unknown>): {
  importedFromEis: boolean;
  tzEnrichmentPending: boolean;
} {
  return {
    importedFromEis: req.importedFromEis === true && req.isDemo !== true,
    tzEnrichmentPending: req.tzEnrichmentPending === true,
  };
}

/** Поля Tender при записи requirements JSON */
export function tenderRowFromRequirements(requirements: Record<string, unknown>) {
  const flags = flagsFromRequirements(requirements);
  return {
    requirements: JSON.stringify(requirements),
    importedFromEis: flags.importedFromEis,
    tzEnrichmentPending: flags.tzEnrichmentPending,
  };
}
