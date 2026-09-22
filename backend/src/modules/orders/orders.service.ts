import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuditLogService } from '../../common/audit-log.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AssignOrderDto } from './dto/update-order-status.dto';

/** Ordre canonique du workflow (§9 du cahier des charges), utilisé côté frontend pour l'affichage. */
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  OrderStatus.DEMANDE_RECUE,
  OrderStatus.RDV_CONFIRME,
  OrderStatus.COLLECTE_PROGRAMMEE,
  OrderStatus.COLLECTE_EFFECTUEE,
  OrderStatus.RECEPTIONNE,
  OrderStatus.TRI,
  OrderStatus.LAVAGE,
  OrderStatus.ESSORAGE,
  OrderStatus.SECHAGE,
  OrderStatus.REPASSAGE,
  OrderStatus.CONTROLE_QUALITE,
  OrderStatus.EMBALLAGE,
  OrderStatus.PRET,
  OrderStatus.LIVRAISON_PROGRAMMEE,
  OrderStatus.LIVRE,
  OrderStatus.TERMINE,
];

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private auditLog: AuditLogService,
  ) {}

  async create(dto: CreateOrderDto, requestingClientId: string | undefined, userId?: string) {
    const clientId = requestingClientId ?? dto.clientId;
    if (!clientId) throw new BadRequestException('clientId est requis.');

    // Les prix des services catalogués sont résolus côté serveur (jamais fournis par le client)
    // pour éviter toute manipulation des tarifs depuis le frontend.
    const resolvedItems = await Promise.all(
      dto.items.map(async (item) => {
        if (item.serviceId) {
          const service = await this.prisma.service.findUnique({ where: { id: item.serviceId } });
          if (!service) throw new BadRequestException(`Service ${item.serviceId} introuvable.`);
          const unitPrice = Number(service.price);
          return {
            serviceId: service.id,
            label: item.label || service.name,
            category: item.category,
            color: item.color,
            quantity: item.quantity,
            unitPrice,
            total: unitPrice * item.quantity,
            condition: item.condition,
            itemNumber: item.itemNumber,
          };
        }
        if (item.unitPrice === undefined) {
          throw new BadRequestException(
            `L'article "${item.label}" doit soit référencer un service du catalogue, soit indiquer un prix unitaire.`,
          );
        }
        return {
          serviceId: null,
          label: item.label,
          category: item.category,
          color: item.color,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.unitPrice * item.quantity,
          condition: item.condition,
          itemNumber: item.itemNumber,
        };
      }),
    );

    const subtotal = resolvedItems.reduce((sum, i) => sum + i.total, 0);
    const discount = dto.discount ?? 0;
    const travelFee = dto.travelFee ?? 0;
    const total = subtotal - discount + travelFee;

    const orderNumber = await this.numbering.nextOrderNumber();

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          clientId,
          appointmentId: dto.appointmentId,
          domain: dto.domain,
          deliveryMode: dto.deliveryMode ?? 'RETRAIT_SUR_PLACE',
          address: dto.address,
          zoneId: dto.zoneId,
          notes: dto.notes,
          defectsNote: dto.defectsNote,
          photoUrls: dto.photoUrls ?? [],
          subtotal,
          discount,
          travelFee,
          total,
          qrCode: orderNumber,
          items: { create: resolvedItems },
          statusHistory: {
            create: { status: OrderStatus.DEMANDE_RECUE, changedById: userId, comment: 'Commande créée' },
          },
        },
        include: { items: true, statusHistory: true, client: true },
      });

      if (dto.appointmentId) {
        await tx.appointment.update({
          where: { id: dto.appointmentId },
          data: { status: 'CONVERTI' },
        });
      }

      return created;
    });

    await this.auditLog.log({
      userId,
      action: 'ORDER_CREATE',
      entityType: 'Order',
      entityId: order.id,
      details: { orderNumber },
    });

    return order;
  }

  async findAll(filters: {
    status?: OrderStatus;
    clientId?: string;
    assignedAgentId?: string;
    driverId?: string;
    domain?: string;
  }) {
    const where: Prisma.OrderWhereInput = {};
    if (filters.status) where.status = filters.status;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.assignedAgentId) where.assignedAgentId = filters.assignedAgentId;
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.domain) where.domain = filters.domain as any;

    return this.prisma.order.findMany({
      where,
      include: { client: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        client: true,
        items: true,
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { fullName: true } } } },
        assignedAgent: { select: { id: true, fullName: true } },
        driver: { select: { id: true, fullName: true, phone: true } },
        vehicle: true,
        invoice: true,
        payments: true,
        appointment: { select: { gpsLat: true, gpsLng: true, gpsAccuracy: true, scheduledDate: true, mode: true } },
      },
    });
    if (!order) throw new NotFoundException('Commande introuvable.');
    return order;
  }

  /** Suivi public par numéro de commande — n'expose aucune donnée financière ni personnelle sensible. */
  async trackByNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: {
        orderNumber: true,
        status: true,
        domain: true,
        expectedReadyAt: true,
        createdAt: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { status: true, createdAt: true, comment: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Aucune commande trouvée avec ce numéro.');
    return order;
  }

  async updateStatus(id: string, status: OrderStatus, userId?: string, comment?: string) {
    const order = await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { status } }),
      this.prisma.orderStatusHistory.create({
        data: { orderId: id, status, changedById: userId, comment },
      }),
    ]);
    await this.auditLog.log({
      userId,
      action: 'ORDER_STATUS_CHANGE',
      entityType: 'Order',
      entityId: id,
      details: { from: order.status, to: status },
    });
    return this.findOne(id);
  }

  async assign(id: string, dto: AssignOrderDto, userId?: string) {
    await this.findOne(id);
    const order = await this.prisma.order.update({ where: { id }, data: dto });
    await this.auditLog.log({
      userId,
      action: 'ORDER_ASSIGN',
      entityType: 'Order',
      entityId: id,
      details: dto,
    });
    return order;
  }

  async registerPaymentAmount(orderId: string, amount: number) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { amountPaid: { increment: amount } },
    });
  }
}
