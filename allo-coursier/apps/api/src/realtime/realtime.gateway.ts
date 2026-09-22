import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthUser } from '../common/auth-user';
import { hasPermissions } from '../common/guards/permissions.guard';
import { PERMISSIONS } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { chatRoom, orderRoom, RealtimeService, STAFF_ROOM, userRoom } from './realtime.service';

interface SocketData {
  user?: AuthUser;
}

/**
 * Canal temps réel (Socket.IO) : suivi GPS, statuts de commande, offres de mission, chat, notifications.
 * Socket.IO bascule automatiquement en « long polling » quand le WebSocket passe mal (réseaux faibles).
 * Les applications envoient leurs actions par l'API REST ; ce canal ne sert qu'à recevoir.
 */
@WebSocketGateway({ path: '/api/v1/socket.io', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    server.use((socket, next) => {
      const token = (socket.handshake.auth?.token as string | undefined) ?? undefined;
      if (!token) return next(); // connexion anonyme : uniquement le suivi public par lien
      try {
        const payload = this.jwt.verify<{ sub: string; roles: string[]; perms: string[]; cities?: string[] | null }>(token, {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
        (socket.data as SocketData).user = { id: payload.sub, roles: payload.roles ?? [], permissions: payload.perms ?? [], cityIds: payload.cities ?? null };
        next();
      } catch {
        next(new Error('Session expirée'));
      }
    });
  }

  handleConnection(socket: Socket) {
    const user = (socket.data as SocketData).user;
    if (!user) return;
    socket.join(userRoom(user.id));
    if (hasPermissions(user, [PERMISSIONS.ORDERS_READ.code])) socket.join(STAFF_ROOM);
  }

  /** Suivre une commande : le client, le livreur affecté ou l'équipe. */
  @SubscribeMessage('order:subscribe')
  async subscribeOrder(@ConnectedSocket() socket: Socket, @MessageBody() body: { orderId?: string }) {
    const user = (socket.data as SocketData).user;
    if (!user || typeof body?.orderId !== 'string') return { ok: false };
    const order = await this.prisma.order
      .findUnique({ where: { id: body.orderId }, select: { id: true, clientId: true, driverId: true, cityId: true } })
      .catch(() => null);
    const isStaff =
      hasPermissions(user, [PERMISSIONS.ORDERS_READ.code]) && (!user.cityIds || (!!order && user.cityIds.includes(order.cityId)));
    if (!order || !(isStaff || order.clientId === user.id || order.driverId === user.id)) return { ok: false };
    await socket.join([orderRoom(order.id), chatRoom(order.id)]);
    return { ok: true };
  }

  @SubscribeMessage('order:unsubscribe')
  async unsubscribeOrder(@ConnectedSocket() socket: Socket, @MessageBody() body: { orderId?: string }) {
    if (typeof body?.orderId !== 'string') return { ok: false };
    await socket.leave(orderRoom(body.orderId));
    await socket.leave(chatRoom(body.orderId));
    return { ok: true };
  }

  /** Suivi public par lien (destinataire sans compte) : statut et position uniquement. */
  @SubscribeMessage('track:subscribe')
  async subscribeTracking(@ConnectedSocket() socket: Socket, @MessageBody() body: { token?: string }) {
    if (typeof body?.token !== 'string' || body.token.length < 16) return { ok: false };
    const order = await this.prisma.order.findUnique({ where: { trackingToken: body.token }, select: { id: true } });
    if (!order) return { ok: false };
    await socket.join(orderRoom(order.id));
    return { ok: true, orderId: order.id };
  }
}
