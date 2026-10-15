import "server-only";
import { z } from "zod";

const historicalItem = z.object({
  equipmentId: z.uuid(),
  code: z.string(),
  name: z.string(),
  requested: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  reason: z.string(),
  outCondition: z.string(),
  returnCondition: z.string(),
});
export const archivedLoanItems = z.array(
  historicalItem.extend({ itemId: z.uuid() }).strict(),
);
type LiveItem = {
  id: string;
  equipmentId: string;
  equipment: { code: string; name: string };
  requested: number;
  approved: number;
  reason: string;
  outCondition: string;
  returnCondition: string;
};
export function snapshotLoanItems(items: LiveItem[]) {
  return items.map((item) => ({
    itemId: item.id,
    equipmentId: item.equipmentId,
    code: item.equipment.code,
    name: item.equipment.name,
    requested: item.requested,
    approved: item.approved,
    reason: item.reason,
    outCondition: item.outCondition,
    returnCondition: item.returnCondition,
  }));
}
// The DTO remains unchanged: every history/invoice consumer sees the same item
// fields whether its inventory master still exists or was permanently deleted.
export function loanItemsForHistory(row: {
  items: LiveItem[];
  archivedItems?: unknown;
}) {
  return [
    ...archivedLoanItems.parse(row.archivedItems ?? []),
    ...snapshotLoanItems(row.items),
  ].map(({ itemId: _itemId, ...item }) => {
    void _itemId;
    return item;
  });
}
