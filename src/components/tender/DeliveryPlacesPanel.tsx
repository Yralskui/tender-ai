"use client";

import { MapPin, Truck } from "lucide-react";
import { buildDeliveryDestinations } from "@/lib/tenderPresentation";

export interface DeliveryPlacesPanelProps {
  requirements: Record<string, unknown>;
}

export default function DeliveryPlacesPanel({ requirements }: DeliveryPlacesPanelProps) {
  const destinations = buildDeliveryDestinations(requirements);
  if (destinations.length === 0) return null;

  return (
    <section id="delivery-places" className="rounded-2xl border border-slate-200 p-5 app-card">
      <div className="flex items-start gap-3 mb-3">
        <Truck size={18} className="text-slate-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 text-sm">
            Место поставки {destinations.length > 1 ? `(${destinations.length} адреса)` : ""}
          </h3>
          <p className="text-sm text-slate-600 mt-1 leading-relaxed">
            {destinations.length > 1
              ? "Заказчик требует поставку в несколько адресов — посчитайте доставку по каждому отдельно."
              : "Куда везти товар по контракту."}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {destinations.map((dest, i) => (
          <div key={`${i}-${dest.address.slice(0, 30)}`} className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-slate-800 leading-snug">{dest.address}</p>
            </div>
            {dest.items.length > 0 && (
              <ul className="mt-1.5 ml-5 space-y-0.5 text-xs text-slate-600">
                {dest.items.map((item, j) => (
                  <li key={j}>
                    {item.name ? `${item.name} — ` : ""}
                    {item.quantity ? `${item.quantity.toLocaleString("ru-RU")} ${item.unit || "шт"}` : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
