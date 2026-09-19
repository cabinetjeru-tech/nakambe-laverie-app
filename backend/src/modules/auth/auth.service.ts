import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { RoleName } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterClientDto } from './dto/register-client.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private numbering: NumberingService,
  ) {}

  private async issueTokens(user: {
    id: string;
    role: { name: RoleName };
    branchId: string | null;
    client?: { id: string } | null;
  }) {
    const payload = {
      sub: user.id,
      role: user.role.name,
      branchId: user.branchId,
      clientId: user.client?.id ?? null,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshTokenRaw = crypto.randomBytes(48).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    const expiresInDays = 7;
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken: refreshTokenRaw };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { role: true, client: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user);
    return {
      ...tokens,
      user: this.toPublicUser(user),
    };
  }

  async registerClient(dto: RegisterClientDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec ce numéro de téléphone.');
    }

    const clientRole = await this.prisma.role.findUnique({ where: { name: RoleName.CLIENT } });
    if (!clientRole) {
      throw new Error('Le rôle CLIENT est introuvable. Avez-vous exécuté le seed ?');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const clientNumber = await this.numbering.nextClientNumber();

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        roleId: clientRole.id,
        client: {
          create: {
            clientNumber,
            fullName: dto.fullName,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            district: dto.district,
          },
        },
      },
      include: { role: true, client: true },
    });

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(refreshTokenRaw: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revoked: false },
      include: { user: { include: { role: true, client: true } } },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée, merci de vous reconnecter.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    const tokens = await this.issueTokens(stored.user);
    return { ...tokens, user: this.toPublicUser(stored.user) };
  }

  async logout(refreshTokenRaw: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, client: true, branch: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.toPublicUser(user);
  }

  private toPublicUser(user: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    role: { name: RoleName };
    branchId: string | null;
    client?: { id: string } | null;
  }) {
    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role.name,
      branchId: user.branchId,
      clientId: user.client?.id ?? null,
    };
  }
}
