import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnlinePaymentStatus, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { LigdicashService } from './ligdicash.service';
import { CinetpayService } from './cinetpay.service';
import { PaymentGateway } from './payment-gateway.interface';

function mapOperatorToPaymentMethod(operatorName?: string): PaymentMethod {
  const op = (operatorName ?? '').toLowerCase();
  if (op.includes('moov')) return PaymentMethod.MOOV_MONEY;
  return PaymentMethod.ORANGE_MONEY;
}

/** Un statut est considéré payé uniquement s'il contient explicitement un terme de succès. */
function isPaidStatus(status: string): boolean {
  return status.includes('complet') || status.includes('success') || status.includes('succe');
}

function isFailedStatus(status: string): boolean {
  return status.includes('fail') || status.includes('echec') || status.includes('éch') || status.includes('cancel') || status.includes('annul');
}

@Injectable()
export class OnlinePaymentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private ligdicash: LigdicashService,
    private cinetpay: CinetpayService,
    private paymentsService: PaymentsService,
  ) {}

  /** Fournisseur actuellement actif pour de NOUVEAUX paiements (CINETPAY par défaut). */
  private get activeProviderName(): string {
    return (this.config.get<string>('ONLINE_PAYMENT_PROVIDER') ?? 'CINETPAY').toUpperCase();
  }

  /** Une transaction déjà créée doit toujours être vérifiée auprès du fournisseur qui l'a créée. */
  private gatewayFor(providerName: string): PaymentGateway {
    return providerName.toUpperCase() === 'LIGDICASH' ? this.ligdicash : this.cinetpay;
  }

  private urls(type: 'quote' | 'invoice', id: string) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? '';
    const backendUrl = (this.config.get<string>('BACKEND_PUBLIC_URL') ?? '').replace(/\/$/, '');
    return {
      returnUrl: `${frontendUrl}/paiement/retour?type=${type}&id=${id}`,
      cancelUrl: `${frontendUrl}/paiement/annule?type=${type}&id=${id}`,
      callbackUrl: `${backendUrl}/api/online-payments/callback`,
    };
  }

  async initiateForQuote(quoteId: string, requestingClientId?: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId }, include: { client: true, items: true } });
    if (!quote) throw new NotFoundException('Devis introuvable.');
    if (requestingClientId && quote.clientId !== requestingClientId) {
      throw new BadRequestException("Ce devis n'appartient pas à ce client.");
    }
    const amount = Number(quote.total);
    if (amount <= 0) throw new BadRequestException('Montant du devis invalide.');

    const { returnUrl, cancelUrl, callbackUrl } = this.urls('quote', quote.id);
    const [firstname, ...rest] = quote.client.fullName.split(' ');
    const provider = this.activeProviderName;

    const checkout = await this.gatewayFor(provider).createCheckout({
      amount,
      description: `Devis ${quote.quoteNumber} — NAKAMBÉ LAVERIE EXPRES ET DIGITALE`,
      items: quote.items.map((i) => ({
        name: i.label,
        quantity: i.quantity,
        unit_price: Number(i.unitPrice),
        total_price: Number(i.total),
      })),
      externalId: `DEVIS-${quote.quoteNumber}-${Date.now()}`,
      customerFirstname: firstname || quote.client.fullName,
      customerLastname: rest.join(' ') || '-',
      customerEmail: quote.client.email ?? undefined,
      returnUrl,
      cancelUrl,
      callbackUrl,
      customData: { quoteId: quote.id },
    });

    const transaction = await this.prisma.onlinePaymentTransaction.create({
      data: {
        token: checkout.token,
        provider,
        clientId: quote.clientId,
        quoteId: quote.id,
        amount,
        rawResponse: checkout.raw as any,
      },
    });

    return { paymentUrl: checkout.paymentUrl, transactionId: transaction.id };
  }

  async initiateForInvoice(invoiceId: string, requestingClientId?: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { client: true } });
    if (!invoice) throw new NotFoundException('Facture introuvable.');
    if (requestingClientId && invoice.clientId !== requestingClientId) {
      throw new BadRequestException("Cette facture n'appartient pas à ce client.");
    }
    const amount = Number(invoice.total) - Number(invoice.amountPaid);
    if (amount <= 0) throw new BadRequestException('Cette facture est déjà réglée.');

    const { returnUrl, cancelUrl, callbackUrl } = this.urls('invoice', invoice.id);
    const [firstname, ...rest] = invoice.client.fullName.split(' ');
    const provider = this.activeProviderName;

    const checkout = await this.gatewayFor(provider).createCheckout({
      amount,
      description: `Facture ${invoice.invoiceNumber} — NAKAMBÉ LAVERIE EXPRES ET DIGITALE`,
      items: [{ name: `Solde facture ${invoice.invoiceNumber}`, quantity: 1, unit_price: amount, total_price: amount }],
      externalId: `FACTURE-${invoice.invoiceNumber}-${Date.now()}`,
      customerFirstname: firstname || invoice.client.fullName,
      customerLastname: rest.join(' ') || '-',
      customerEmail: invoice.client.email ?? undefined,
      returnUrl,
      cancelUrl,
      callbackUrl,
      customData: { invoiceId: invoice.id },
    });

    const transaction = await this.prisma.onlinePaymentTransaction.create({
      data: {
        token: checkout.token,
        provider,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        amount,
        rawResponse: checkout.raw as any,
      },
    });

    return { paymentUrl: checkout.paymentUrl, transactionId: transaction.id };
  }

  /** Revérifie une transaction auprès de LigdiCash (jamais sur la seule foi d'un webhook) et enregistre le paiement si confirmé. */
  async syncTransaction(token: string) {
    const transaction = await this.prisma.onlinePaymentTransaction.findUnique({ where: { token } });
    if (!transaction) throw new NotFoundException('Transaction introuvable.');

    if (transaction.status === OnlinePaymentStatus.CONFIRME) return transaction;

    const result = await this.gatewayFor(transaction.provider).confirmTransaction(token);

    if (isPaidStatus(result.status)) {
      // Verrou optimiste sur paymentId=null : évite un double enregistrement de paiement
      // si le webhook LigdiCash et une vérification manuelle arrivent en même temps.
      const claim = await this.prisma.onlinePaymentTransaction.updateMany({
        where: { token, paymentId: null },
        data: { status: OnlinePaymentStatus.CONFIRME, operatorName: result.operatorName, rawResponse: result.raw as any },
      });

      if (claim.count === 1) {
        const payment = await this.paymentsService.create(
          {
            clientId: transaction.clientId,
            invoiceId: transaction.invoiceId ?? undefined,
            amount: Number(transaction.amount),
            method: mapOperatorToPaymentMethod(result.operatorName),
            transactionRef: result.transactionId ?? token,
          },
          undefined,
        );
        await this.prisma.onlinePaymentTransaction.update({ where: { token }, data: { paymentId: payment.id } });
      }

      return this.prisma.onlinePaymentTransaction.findUniqueOrThrow({ where: { token } });
    }

    if (isFailedStatus(result.status)) {
      return this.prisma.onlinePaymentTransaction.update({
        where: { token },
        data: { status: OnlinePaymentStatus.ECHEC, rawResponse: result.raw as any, operatorName: result.operatorName },
      });
    }

    return this.prisma.onlinePaymentTransaction.update({
      where: { token },
      data: { rawResponse: result.raw as any },
    });
  }

  async latestStatusForQuote(quoteId: string) {
    const transaction = await this.prisma.onlinePaymentTransaction.findFirst({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
    });
    if (!transaction) return null;
    if (transaction.status === OnlinePaymentStatus.EN_ATTENTE) {
      return this.syncTransaction(transaction.token);
    }
    return transaction;
  }

  async latestStatusForInvoice(invoiceId: string) {
    const transaction = await this.prisma.onlinePaymentTransaction.findFirst({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
    if (!transaction) return null;
    if (transaction.status === OnlinePaymentStatus.EN_ATTENTE) {
      return this.syncTransaction(transaction.token);
    }
    return transaction;
  }
}
