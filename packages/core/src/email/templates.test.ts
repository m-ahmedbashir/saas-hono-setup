import { describe, it, expect } from "vitest";
import { invitationEmail, resetPasswordEmail, verifyEmailEmail } from "./templates";

const URL = "https://portal.example/auth/reset-password?token=abc123";

describe("email templates", () => {
  it.each([
    ["reset password", resetPasswordEmail({ url: URL })],
    ["verify email", verifyEmailEmail({ url: URL })],
    [
      "invitation",
      invitationEmail({ url: URL, organizationName: "Acme", inviterName: "Ada", role: "member" }),
    ],
  ])("%s has a subject, an html part and a text part, each with the link", (_, email) => {
    expect(email.subject.length).toBeGreaterThan(0);
    expect(email.html).toContain(URL);
    expect(email.text).toContain(URL);
  });

  it("names the organization, inviter and role in an invitation", () => {
    const email = invitationEmail({
      url: URL,
      organizationName: "Acme",
      inviterName: "Ada",
      role: "admin",
    });
    expect(email.subject).toContain("Acme");
    expect(email.text).toContain("Ada");
    expect(email.text).toContain("admin");
  });

  it("escapes user-controlled names in the html, so an org name can't inject markup", () => {
    const email = invitationEmail({
      url: URL,
      organizationName: `<a href="https://evil.example">Click</a>`,
      inviterName: `Eve "<img src=x>"`,
      role: "member",
    });
    expect(email.html).not.toContain('<a href="https://evil.example">');
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("escapes the link inside its href attribute", () => {
    const email = resetPasswordEmail({ url: `https://portal.example/x?a=1&b="2"` });
    expect(email.html).toContain(`href="https://portal.example/x?a=1&amp;b=&quot;2&quot;"`);
  });
});
