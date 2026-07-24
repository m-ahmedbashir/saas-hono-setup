import type { Context } from "hono";
import { success } from "../../lib/response";
import { deleteAccount } from "./account.service";

export async function deleteAccountHandler(c: Context) {
  const userContext = c.get("userContext");
  await deleteAccount(userContext.user.id);

  return success(c, { deleted: true });
}
