import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  /** Transaction interactive avec délais adaptés aux opérations financières. */
  tx<T>(fn: (tx: Tx) => Promise<T>, isolation?: Prisma.TransactionIsolationLevel): Promise<T> {
    return this.$transaction(fn, { maxWait: 10_000, timeout: 30_000, isolationLevel: isolation });
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
