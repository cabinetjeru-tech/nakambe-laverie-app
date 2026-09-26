import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateEmployeeDto) {
    if (dto.role === RoleName.CLIENT) {
      throw new BadRequestException('Utilisez /auth/register-client pour créer un compte client.');
    }
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Un utilisateur existe déjà avec ce numéro de téléphone.');

    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException(`Rôle ${dto.role} introuvable.`);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        passwordHash,
        roleId: role.id,
        branchId: dto.branchId,
        employee: {
          create: {
            branchId: dto.branchId,
            position: dto.position,
            hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
            salary: dto.salary,
          },
        },
      },
      include: { employee: true, role: true },
    });
  }

  findAll() {
    return this.prisma.user.findMany({
      where: { employee: { isNot: null } },
      include: { employee: true, role: true, branch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { employee: true, role: true, branch: true },
    });
    if (!user || !user.employee) throw new NotFoundException('Employé introuvable.');
    return user;
  }

  async update(
    id: string,
    dto: Partial<Pick<CreateEmployeeDto, 'position' | 'salary' | 'branchId'>> & { status?: string; fullName?: string },
  ) {
    await this.findOne(id);
    const [, employee] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { fullName: dto.fullName },
      }),
      this.prisma.employee.update({
        where: { userId: id },
        data: {
          position: dto.position,
          salary: dto.salary,
          branchId: dto.branchId,
          status: dto.status,
        },
      }),
    ]);
    return employee;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.prisma.employee.update({ where: { userId: id }, data: { status: 'INACTIF' } });
    return { success: true };
  }
}
