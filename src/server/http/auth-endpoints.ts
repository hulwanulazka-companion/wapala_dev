import "server-only";
import { z } from "zod";
import { getDb } from "../db";
import { getConfig } from "../config";
import { DomainError } from "../errors";
import { setupRequired, bootstrap } from "../auth/bootstrap";
import { login } from "../auth/login";
import { changePassword, logout } from "../auth/sessions";
import { requestRecovery, completeRecovery } from "../auth/recovery";
import {
  createPreAuthToken,
  csrfForSession,
  validatePreAuthToken,
} from "../security/csrf";
import { takeThrottle } from "../security/throttle";
import { readJson } from "./body";
import {
  route,
  jsonResponse,
  cookieHeader,
  assertPreAuth,
  authenticated,
  readCookie,
  cookieName,
} from "./auth-handler";
const password = z.string().max(1024),
  email = z.string().trim().min(1).max(254),
  empty = z.object({}).strict();
export function authGet(request: Request, action: string) {
  return route(request, async () => {
    if (action === "context") {
      const existing = readCookie(request, cookieName("preauth"));
      let csrfToken: string;
      try {
        validatePreAuthToken(existing, existing);
        csrfToken = existing!;
      } catch {
        csrfToken = createPreAuthToken();
      }
      const response = jsonResponse({
        setupRequired: await setupRequired(),
        emailRecoveryEnabled: getConfig().emailMode !== "disabled",
        csrfToken,
      });
      response.headers.append(
        "Set-Cookie",
        cookieHeader("preauth", csrfToken, 900),
      );
      return response;
    }
    if (action === "me") {
      const { principal, token } = await authenticated(request);
      const user = await getDb().user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mustChangePassword: true,
        },
      });
      return jsonResponse({ user, csrfToken: csrfForSession(token) });
    }
    throw new DomainError("NOT_FOUND", 404);
  });
}
export function authPost(request: Request, action: string) {
  return route(request, async (ctx) => {
    if (["bootstrap", "login", "recovery", "reset"].includes(action))
      assertPreAuth(request);
    if (action === "bootstrap") {
      await takeThrottle("bootstrap:" + ctx.ipDigest, 5, 900000);
      const input = await readJson(
        request,
        z.object({ token: z.string().max(100), password }).strict(),
      );
      await bootstrap(input, ctx);
      return jsonResponse({ message: "Super User dibuat. Silakan login." });
    }
    if (action === "login") {
      const input = await readJson(
          request,
          z.object({ email, password }).strict(),
        ),
        result = await login(input, ctx);
      const response = jsonResponse({
        csrfToken: result.csrfToken,
        redirectTo: result.principal.mustChangePassword
          ? "/wapala/password"
          : "/admin/foundation",
      });
      response.headers.append(
        "Set-Cookie",
        cookieHeader("session", result.token, 30 * 86400),
      );
      response.headers.append("Set-Cookie", cookieHeader("preauth", "", 0));
      return response;
    }
    if (action === "recovery") {
      const input = await readJson(request, z.object({ email }).strict());
      await requestRecovery(input.email, ctx);
      return jsonResponse({
        message:
          "Jika akun dapat dipulihkan, petunjuk dikirim ke email pemulihannya.",
      });
    }
    if (action === "reset") {
      await takeThrottle("reset:" + ctx.ipDigest, 5, 900000);
      const input = await readJson(
        request,
        z
          .object({ token: z.string().max(100), newPassword: password })
          .strict(),
      );
      await completeRecovery(input, ctx);
      return jsonResponse({
        message: "Password diperbarui. Silakan login kembali.",
      });
    }
    if (action === "logout" || action === "password") {
      const { principal, token } = await authenticated(request);
      if (action === "logout") {
        await readJson(request, empty);
        await logout(token, ctx);
      } else {
        await takeThrottle("password:" + principal.userId, 5, 900000);
        const input = await readJson(
          request,
          z
            .object({ currentPassword: password, newPassword: password })
            .strict(),
        );
        await changePassword(principal, input, ctx);
      }
      const response = jsonResponse({ redirectTo: "/wapala" });
      response.headers.append("Set-Cookie", cookieHeader("session", "", 0));
      return response;
    }
    throw new DomainError("NOT_FOUND", 404);
  });
}
