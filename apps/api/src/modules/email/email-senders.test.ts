import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OutgoingEmail } from "@repo/core";

const resendSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

const { ResendEmailSender } = await import("./resend-email.sender");
const { ConsoleEmailSender } = await import("./console-email.sender");
const { selectEmailSender } = await import("./select-email-sender");

const email: OutgoingEmail = {
  to: "ada@example.com",
  subject: "Reset your password",
  html: "<p>https://portal.example/auth/reset-password?token=abc</p>",
  text: "https://portal.example/auth/reset-password?token=abc",
};

beforeEach(() => {
  resendSend.mockReset();
  vi.restoreAllMocks();
});

describe("ResendEmailSender", () => {
  it("sends from the configured address with both html and text parts", async () => {
    resendSend.mockResolvedValue({ data: { id: "em_1" }, error: null });
    await new ResendEmailSender("re_key", "App <no-reply@example.com>").send(email);

    expect(resendSend).toHaveBeenCalledWith({
      from: "App <no-reply@example.com>",
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  });

  // Resend reports API failures (bad key, quota, invalid sender) in its return value
  // instead of throwing; the adapter must turn that into a rejection or failures vanish.
  it("rejects when Resend returns an error instead of throwing", async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { name: "invalid_api_key", message: "API key is invalid", statusCode: 403 },
    });
    await expect(new ResendEmailSender("re_bad", "a@example.com").send(email)).rejects.toThrow(
      /invalid_api_key/,
    );
  });
});

describe("ConsoleEmailSender", () => {
  it("logs the recipient, subject and text body, so dev links can be followed", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await new ConsoleEmailSender().send(email);
    const logged = log.mock.calls.flat().join("\n");
    expect(logged).toContain(email.to);
    expect(logged).toContain(email.subject);
    expect(logged).toContain(email.text);
  });
});

describe("selectEmailSender", () => {
  it("uses Resend when an API key and sender address are set", () => {
    const sender = selectEmailSender({
      NODE_ENV: "production",
      RESEND_API_KEY: "re_key",
      EMAIL_FROM: "a@example.com",
    });
    expect(sender).toBeInstanceOf(ResendEmailSender);
  });

  it("falls back to the console sender outside production", () => {
    expect(selectEmailSender({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleEmailSender);
    expect(selectEmailSender({ NODE_ENV: "test" })).toBeInstanceOf(ConsoleEmailSender);
  });

  // The console sender prints one-time links; in production they'd land in the log store.
  it("registers no sender in production without a key, rather than logging links", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(selectEmailSender({ NODE_ENV: "production" })).toBeNull();
  });

  it("refuses a Resend key without a sender address", () => {
    expect(() => selectEmailSender({ NODE_ENV: "production", RESEND_API_KEY: "re_key" })).toThrow(
      /EMAIL_FROM/,
    );
  });
});
