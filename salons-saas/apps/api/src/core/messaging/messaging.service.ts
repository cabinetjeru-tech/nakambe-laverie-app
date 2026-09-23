import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';

export interface OutgoingMessage {
  to: string;
  text: string;
  /** Code transmis, pour les pilotes de test uniquement. */
  code?: string;
  purpose: string;
}

/**
 * Envoi des codes et liens aux utilisateurs (SMS / WhatsApp).
 *
 * Aucun fournisseur n'est encore contractualisé (docs/01-ARCHITECTURE.md §11) :
 * - `console` : le message est écrit dans les journaux du serveur, d'où un administrateur
 *   peut le transmettre ; c'est le mode « réinitialisation par l'administration » ;
 * - `memory` : conservé en mémoire pour les tests automatisés.
 * Brancher un fournisseur = ajouter un pilote ici, sans toucher aux appelants.
 */
@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);
  private readonly outbox: OutgoingMessage[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(message: OutgoingMessage): Promise<void> {
    if (this.config.OTP_DRIVER === 'memory') {
      this.outbox.push(message);
      return;
    }
    this.logger.warn(`[${message.purpose}] message pour ${message.to} : ${message.text}`);
  }

  /** Tests uniquement : dernier message envoyé à ce destinataire. */
  lastMessageTo(to: string, purpose?: string): OutgoingMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to && (!purpose || m.purpose === purpose));
  }
}
