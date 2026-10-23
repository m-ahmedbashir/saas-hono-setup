import { describe, it, expect, vi, afterEach } from "vitest";
import type { OutgoingEmail } from "./types";

const email: OutgoingEmail = {
  to: "someone@example.com",
  subject: "Reset your password",
  html: "<p>secret-token-link</p>",
  text: "secret-token-link",
};

// Each test gets a fresh module, so a sender registered by one can't leak into the next.
async function freshRegistry() {
  vi.resetModules();
  return import("./registry");
}

afterEach(() => vi.restoreAllMocks());

describe("sendEmail", () => {
  it("resolves, with a warning, when no sender is registered", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await freshRegistry();

    await expect(sendEmail(email)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it("hands the email to the registered sender", async () => {
    const { registerEmailSender, sendEmail } = await freshRegistry();
    const sent: OutgoingEmail[] = [];
    registerEmailSender({ send: async (e) => void sent.push(e) });

    await sendEmail(email);
    expect(sent).toEqual([email]);
  });

  it("never rejects when the sender fails, and doesn't log the email's contents", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registerEmailSender, sendEmail } = await freshRegistry();
    registerEmailSender({
      send: async () => {
        throw new Error("provider down");
      },
    });

    await expect(sendEmail(email)).resolves.toBeUndefined();
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("provider down");
    expect(logged).not.toContain("secret-token-link");
    expect(logged).not.toContain(email.to);
  });
});
