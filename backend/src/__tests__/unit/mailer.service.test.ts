import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn();
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));

import { config } from "../../config.js";
import { sendInviteEmail, __resetMailerForTests } from "../../services/mailer.service.js";

const sampleInput = {
  to: "invitee@example.com",
  orgName: "Acme",
  inviterName: "Alice Admin",
  role: "member",
  acceptUrl: "https://taskflow.example/accept-invite?token=tfinv_abc",
  expiresAt: new Date("2026-05-01T00:00:00Z"),
};

describe("mailer.service sendInviteEmail", () => {
  const originalHost = config.smtpHost;
  const originalUser = config.smtpUser;
  const originalPass = config.smtpPass;
  const originalFrom = config.smtpFrom;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendMailMock.mockReset();
    createTransportMock.mockClear();
    __resetMailerForTests();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    config.smtpHost = originalHost;
    config.smtpUser = originalUser;
    config.smtpPass = originalPass;
    config.smtpFrom = originalFrom;
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("when SMTP is not configured", () => {
    beforeEach(() => {
      config.smtpHost = "";
      config.smtpUser = "";
      config.smtpPass = "";
    });

    it("logs the rendered email and resolves without sending", async () => {
      await expect(sendInviteEmail(sampleInput)).resolves.toBeUndefined();
      expect(sendMailMock).not.toHaveBeenCalled();
      expect(createTransportMock).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("invitee@example.com");
      expect(logged).toContain("Acme");
      expect(logged).toContain("tfinv_abc");
    });
  });

  describe("when SMTP is configured", () => {
    beforeEach(() => {
      config.smtpHost = "smtp.mailgun.org";
      config.smtpPort = 587;
      config.smtpUser = "taskflow@mg.informup.org";
      config.smtpPass = "secret";
      config.smtpFrom = "TaskFlow <taskflow@informup.org>";
    });

    it("sends a mail with the expected envelope and body fields", async () => {
      sendMailMock.mockResolvedValue({ messageId: "abc" });
      await sendInviteEmail(sampleInput);

      expect(createTransportMock).toHaveBeenCalledTimes(1);
      const transportOpts = createTransportMock.mock.calls[0][0];
      expect(transportOpts).toMatchObject({
        host: "smtp.mailgun.org",
        port: 587,
        auth: { user: "taskflow@mg.informup.org", pass: "secret" },
      });

      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const payload = sendMailMock.mock.calls[0][0];
      expect(payload.from).toBe("TaskFlow <taskflow@informup.org>");
      expect(payload.to).toBe("invitee@example.com");
      expect(typeof payload.subject).toBe("string");
      expect(payload.subject).toContain("Acme");
      expect(payload.html).toContain(sampleInput.acceptUrl);
      expect(payload.html).toContain("Alice Admin");
      expect(payload.html).toContain("member");
      expect(payload.text).toContain(sampleInput.acceptUrl);
    });

    it("uses secure=true on port 465", async () => {
      config.smtpPort = 465;
      sendMailMock.mockResolvedValue({ messageId: "x" });
      await sendInviteEmail(sampleInput);
      const transportOpts = createTransportMock.mock.calls[0][0];
      expect(transportOpts.secure).toBe(true);
    });

    it("uses secure=false on port 587", async () => {
      sendMailMock.mockResolvedValue({ messageId: "x" });
      await sendInviteEmail(sampleInput);
      const transportOpts = createTransportMock.mock.calls[0][0];
      expect(transportOpts.secure).toBe(false);
    });

    it("swallows send errors and logs them instead of throwing", async () => {
      sendMailMock.mockRejectedValue(new Error("smtp boom"));
      await expect(sendInviteEmail(sampleInput)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });

    it("reuses a single transporter across calls", async () => {
      sendMailMock.mockResolvedValue({ messageId: "x" });
      await sendInviteEmail(sampleInput);
      await sendInviteEmail({ ...sampleInput, to: "other@example.com" });
      expect(createTransportMock).toHaveBeenCalledTimes(1);
      expect(sendMailMock).toHaveBeenCalledTimes(2);
    });
  });
});
