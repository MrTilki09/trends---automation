import { describe, expect, it } from "vitest";
import { verificationMail } from "../lib/mail";

describe("verification email", () => {
  it("contains the link in text and HTML, escaped", () => {
    const link = "https://trends.example.com/verify?token=abc&x=<b>";
    const mail = verificationMail("me@example.com", link, "Trend Pool");
    expect(mail.to).toBe("me@example.com");
    expect(mail.subject).toContain("Trend Pool");
    expect(mail.text).toContain(link);
    expect(mail.html).toContain("token=abc&amp;x=&lt;b&gt;");
    expect(mail.html).not.toContain("<b>");
  });
});
