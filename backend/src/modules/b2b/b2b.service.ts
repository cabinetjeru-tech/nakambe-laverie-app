import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class B2bService {
  constructor(private prisma: PrismaService) {}

  // ---- Contrats ----
  createContract(dto: any) {
    return this.prisma.contract.create({ data: { ...dto, startDate: new Date(dto.startDate) } });
  }

  findContracts(clientId?: string) {
    return this.prisma.contract.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true },
      orderBy: { startDate: 'desc' },
    });
  }

  /** Contrats dont l'échéance approche (30 jours) — pour alerte admin. */
  async findExpiringContracts() {
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    return this.prisma.contract.findMany({
      where: { status: 'ACTIF', endDate: { lte: in30Days, gte: new Date() } },
      include: { client: true },
    });
  }

  async updateContract(id: string, dto: any) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contrat introuvable.');
    return this.prisma.contract.update({ where: { id }, data: dto });
  }

  // ---- Abonnements ----
  createSubscription(dto: any) {
    return this.prisma.subscription.create({ data: dto });
  }

  findSubscriptions(clientId?: string) {
    return this.prisma.subscription.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true },
      orderBy: { startDate: 'desc' },
    });
  }

  async updateSubscription(id: string, dto: any) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('Abonnement introuvable.');
    return this.prisma.subscription.update({ where: { id }, data: dto });
  }
}
