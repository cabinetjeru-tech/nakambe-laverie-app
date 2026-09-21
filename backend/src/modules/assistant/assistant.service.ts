import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatMessageDto } from './dto/chat.dto';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 500;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const FALLBACK_REPLY =
  "Notre assistant automatique n'est pas encore disponible. Pour toute question, contactez-nous directement sur WhatsApp (bouton en bas de l'écran) ou par téléphone.";

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private requestLog = new Map<string, number[]>();

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  private checkRateLimit(ip: string) {
    const now = Date.now();
    const timestamps = (this.requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      throw new HttpException('Trop de messages envoyés. Réessayez dans quelques minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    timestamps.push(now);
    this.requestLog.set(ip, timestamps);
  }

  private async buildSystemPrompt(): Promise<string> {
    const companyName = this.config.get<string>('COMPANY_NAME') ?? 'NOUVELLE LAVERIE AFRICAINE';
    const address = this.config.get<string>('COMPANY_ADDRESS') ?? 'Tenkodogo, Burkina Faso';
    const phone1 = this.config.get<string>('COMPANY_PHONE_1') ?? '';
    const phone2 = this.config.get<string>('COMPANY_PHONE_2') ?? '';

    const categories = await this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      include: { services: { where: { isActive: true }, orderBy: { name: 'asc' } } },
    });

    const catalogText = categories
      .map((cat) => {
        const lines = cat.services
          .slice(0, 12)
          .map((s) => `  - ${s.name} : ${Math.round(Number(s.price)).toLocaleString('fr-FR')} FCFA / ${s.unit}`)
          .join('\n');
        return `${cat.name} (${cat.domain}) :\n${lines}`;
      })
      .join('\n\n');

    return `Tu t'appelles Kady. Tu fais partie de l'équipe de ${companyName}, un service de laverie, pressing, lavage auto/moto et nettoyage professionnel à Tenkodogo, Burkina Faso. Tu échanges avec les clients de façon naturelle, chaleureuse et directe, comme le ferait une conseillère clientèle de l'entreprise.

INFORMATIONS DE L'ENTREPRISE :
- Adresse : ${address}
- Téléphone / WhatsApp : ${phone1}${phone2 ? ` ou ${phone2}` : ''}
- Horaires : Lundi - Samedi, 7h30 à 19h00, fermé le dimanche
- Modes de paiement acceptés : Espèces, Orange Money, Moov Money, Chèque (le paiement Mobile Money en ligne directement sur le site arrive bientôt)

CATALOGUE ACTUEL DES SERVICES ET TARIFS :
${catalogText || "Catalogue en cours de mise à jour."}

COMMENT ÇA MARCHE (à expliquer si on te le demande) :
1. Le client fait une demande sur le site (bouton "Nouvelle demande") en choisissant le service, la date et l'adresse.
2. L'équipe collecte à domicile ou reçoit l'article au siège.
3. Le client peut suivre chaque étape du traitement en temps réel depuis son espace client.
4. Livraison et paiement (avant ou après la prestation, au choix du client).

TON RÔLE ET TES LIMITES (très important) :
- Réponds en français, de façon chaleureuse, brève et utile, surtout en dehors des heures d'ouverture quand personne n'est disponible pour répondre.
- Tu peux répondre aux questions sur les services, les tarifs indiqués ci-dessus, les horaires, l'adresse et le fonctionnement général.
- Tu NE PEUX PAS créer, modifier ou annuler une commande, ni consulter le statut d'une commande précise, ni traiter un paiement — dis toujours au client d'utiliser le bouton "Nouvelle demande" du site, ou de consulter "Mes commandes" dans son espace client une fois connecté.
- Si la question sort de ce cadre, ou si le client semble mécontent, insiste, ou a besoin d'une réponse urgente/humaine, oriente-le clairement vers le bouton WhatsApp ou les numéros de téléphone ci-dessus.
- N'invente jamais un tarif ou un service qui n'est pas dans la liste ci-dessus. Si tu ne sais pas, dis-le simplement et propose le contact WhatsApp.
- Reste toujours poli et concis (quelques phrases maximum). Ne dis pas spontanément que tu es un programme ou une intelligence artificielle — comporte-toi simplement comme Kady. Mais si un client te demande directement et explicitement si tu es un robot, un programme ou une IA, réponds-lui honnêtement que oui, sans détour ni mensonge : l'honnêteté prime toujours sur le naturel de la conversation.`;
  }

  async chat(messages: ChatMessageDto[], ip: string): Promise<{ reply: string }> {
    this.checkRateLimit(ip);

    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { reply: FALLBACK_REPLY };
    }

    const system = await this.buildSystemPrompt();

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
    } catch (err) {
      this.logger.error(`Impossible de joindre l'API Anthropic : ${(err as Error).message}`);
      throw new BadGatewayException("L'assistant est momentanément indisponible. Réessayez dans un instant.");
    }

    const rawText = await response.text();
    if (!response.ok) {
      this.logger.error(`Erreur API Anthropic — HTTP ${response.status} — ${rawText.slice(0, 500)}`);
      throw new BadGatewayException("L'assistant est momentanément indisponible. Réessayez dans un instant.");
    }

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new BadGatewayException("Réponse inattendue de l'assistant. Réessayez dans un instant.");
    }

    const reply = data?.content?.find((block: any) => block.type === 'text')?.text;
    if (!reply) {
      throw new BadGatewayException("Réponse inattendue de l'assistant. Réessayez dans un instant.");
    }

    return { reply };
  }
}
