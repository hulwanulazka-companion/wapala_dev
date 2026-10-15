import { authenticated, route, jsonResponse } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import {
  previewDataReset,
  resetData,
  resetSchema,
  resetSelection,
} from "@/server/domains/data-reset";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return route(request, async () => {
    const { principal } = await authenticated(request, "data:reset");
    return jsonResponse(
      await previewDataReset(
        principal,
        await readJson(request, resetSelection),
      ),
    );
  });
}
export function DELETE(request: Request) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "data:reset");
    return jsonResponse(
      await resetData(principal, await readJson(request, resetSchema), ctx),
    );
  });
}
