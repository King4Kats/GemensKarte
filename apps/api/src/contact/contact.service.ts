import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

const DEST = process.env.CONTACT_EMAIL ?? "flavienauvray44@gmail.com";

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: false,
        auth: { user, pass },
      });
      this.logger.log(`SMTP configuré → ${user}`);
    } else {
      this.logger.warn("SMTP_USER/SMTP_PASS non définis — emails désactivés (console only)");
    }
  }

  async send(subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[EMAIL SIMULÉ] Sujet: ${subject}\n${html.replace(/<[^>]+>/g, "")}`);
      return;
    }
    await this.transporter.sendMail({
      from: `"GemensKarte" <${process.env.SMTP_USER}>`,
      to: DEST,
      subject,
      html,
    });
    this.logger.log(`Email envoyé → ${DEST} : ${subject}`);
  }

  async recenser(data: {
    name: string; category: string; city: string; postalCode?: string;
    email: string; website?: string; description: string;
  }): Promise<void> {
    const html = `
      <h2>Nouvelle demande de référencement</h2>
      <table>
        <tr><td><b>Association</b></td><td>${data.name}</td></tr>
        <tr><td><b>Catégorie</b></td><td>${data.category}</td></tr>
        <tr><td><b>Ville</b></td><td>${data.city}${data.postalCode ? ` (${data.postalCode})` : ""}</td></tr>
        <tr><td><b>Email contact</b></td><td>${data.email}</td></tr>
        ${data.website ? `<tr><td><b>Site web</b></td><td>${data.website}</td></tr>` : ""}
        <tr><td><b>Description</b></td><td>${data.description}</td></tr>
      </table>
    `;
    await this.send(`[GemensKarte] Référencement — ${data.name}`, html);
  }

  async deferencer(data: {
    name: string; reason: string; message?: string; email?: string;
  }): Promise<void> {
    const html = `
      <h2>Demande de déférencement</h2>
      <table>
        <tr><td><b>Association</b></td><td>${data.name}</td></tr>
        <tr><td><b>Raison</b></td><td>${data.reason}</td></tr>
        ${data.message ? `<tr><td><b>Message</b></td><td>${data.message}</td></tr>` : ""}
        ${data.email ? `<tr><td><b>Email contact</b></td><td>${data.email}</td></tr>` : ""}
      </table>
    `;
    await this.send(`[GemensKarte] Déférencement — ${data.name}`, html);
  }
}
