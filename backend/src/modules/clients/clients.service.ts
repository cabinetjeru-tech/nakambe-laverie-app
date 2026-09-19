import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { AuditLogService } from '../../common/audit-log.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private auditLog: AuditLogService,
  ) {}

  async create(dto: CreateClientDto, userId?: string) {
    const clientNumber = await this.numbering.nextClientNumber();
    const client = await this.prisma.client.create({
      data: { ...dto, clientNumber },
    });
    await this.auditLog.log({
      userId,
      action: 'CLIENT_CREATE',
      entityType: 'Client',
      entityId: client.id,
    });
    return client;
  }

  async findAll(search?: string, page = 1, pageSize = 20) {
    const where = search
      ? {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search } },
            { clientNumber: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 10 },
        appointments: { orderBy: { createdAt: 'desc' }, take: 10 },
        complaints: true,
        reviews: true,
        contracts: true,
        subscriptions: true,
      },
    });
    if (!client) throw new NotFoundException('Client introuvable.');

    const stats = await this.prisma.order.aggregate({
      where: { clientId: id, status: { not: 'ANNULE' } },
      _sum: { total: true },
      _count: true,
    });

    return {
      ...client,
      totalSpent: stats._sum.total ?? 0,
      ordersCount: stats._count,
    };
  }

  async update(id: string, dto: UpdateClientDto, userId?: string) {
    await this.findOne(id);
    const client = await this.prisma.client.update({ where: { id }, data: dto });
    await this.auditLog.log({
      userId,
      action: 'CLIENT_UPDATE',
      entityType: 'Client',
      entityId: id,
      details: dto,
    });
    return client;
  }

  async remove(id: string, userId?: string) {
    await this.findOne(id);
    await this.prisma.client.update({ where: { id }, data: { isActive: false } });
    await this.auditLog.log({
      userId,
      action: 'CLIENT_DEACTIVATE',
      entityType: 'Client',
      entityId: id,
    });
    return { success: true };
  }
}
