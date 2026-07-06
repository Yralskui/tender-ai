import { looksLikeProductName, isPlaceholderPositionName } from "../src/lib/tzSanitizer";

const cell =
  "Фартук гигиенический, одноразового использования (является медицинским изделием) описание Нестерильный";
const med = cell.match(/^([А-Яа-яЁё][^.(]{8,180}?)\s*\(является медицинским изделием\)/i);
console.log("match", med?.[1]);
const name = med?.[1]?.trim() || "";
console.log("looksLike", looksLikeProductName(name), "placeholder", isPlaceholderPositionName(name));
