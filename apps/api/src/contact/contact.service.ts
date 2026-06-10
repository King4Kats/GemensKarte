/**
 * Service "contact" : c'est lui qui fabrique et envoie les emails de notification
 * quand quelqu'un remplit un formulaire (référencement ou déférencement).
 * Il utilise nodemailer (librairie d'envoi d'email) via un serveur SMTP
 * (le serveur de courrier sortant, type Gmail). Si la configuration SMTP est
 * absente, il n'envoie rien et se contente d'afficher l'email dans la console.
 */
import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

// Adresse qui reçoit les notifications. On la lit dans la config (variable
// d'environnement) ; si elle n'est pas définie, on utilise une adresse par défaut.
const DEST = process.env.CONTACT_EMAIL ?? "flavienauvray44@gmail.com";

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  // Le "transporter" est l'objet nodemailer qui sait envoyer un mail.
  // Il reste à null tant que le SMTP n'est pas configuré.
  private transporter: nodemailer.Transporter | null = null;

  // Au démarrage, on prépare la connexion email SI les identifiants SMTP existent.
  // Sinon, on prévient dans les logs que les emails sont désactivés.
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

  // Envoie un email (sujet + contenu HTML) à l'adresse de destination.
  // Méthode interne réutilisée par recenser() et deferencer().
  async send(subject: string, html: string): Promise<void> {
    // Pas de SMTP configuré : on simule en affichant juste le texte dans la console.
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

  // Construit un email récapitulatif d'une demande de référencement
  // (association à ajouter) puis l'envoie à l'admin du site.
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

  // Même principe que recenser(), mais pour une demande de retrait
  // (déférencement) : on prévient l'admin avec la raison invoquée.
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
