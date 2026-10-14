import { route, authenticated, jsonResponse } from "@/server/http/auth-handler";
import { readJson } from "@/server/http/body";
import {
  memberPortal,
  requestCorrection,
  correctionSchema,
} from "@/server/domains/member-portal";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return route(request, async () => {
    const { principal } = await authenticated(request, "members:directory");
    return jsonResponse(await memberPortal(principal));
  });
}
export function POST(request: Request) {
  return route(request, async (ctx) => {
    const { principal } = await authenticated(request, "members:correct");
    return jsonResponse(
      await requestCorrection(
        principal,
        await readJson(request, correctionSchema),
        ctx,
      ),
      201,
    );
  });
}
