import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export const userRoom = (userId: string) => `user:${userId}`;
/** Statut et position : diffusés aussi au suivi public par lien, donc sans données personnelles sensibles. */
export const orderRoom = (orderId: string) => `order:${orderId}`;
/** Messages du chat : réservés aux participants et à l'équipe. */
export const chatRoom = (orderId: string) => `chat:${orderId}`;
export const STAFF_ROOM = 'staff';
export const merchantRoom = (merchantId: string) => `merchant:${merchantId}`;

/** Événements émis vers les applications. */
export type RealtimeEvent =
  | 'order.updated'
  | 'driver.location'
  | 'offer.new'
  | 'offer.closed'
  | 'chat.message'
  | 'notification'
  | 'merchant.order';

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  attach(server: Server) {
    this.server = server;
  }

  toUser(userId: string, event: RealtimeEvent, payload: unknown) {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  toOrder(orderId: string, event: RealtimeEvent, payload: unknown) {
    this.server?.to(orderRoom(orderId)).emit(event, payload);
  }

  toChat(orderId: string, event: RealtimeEvent, payload: unknown) {
    this.server?.to(chatRoom(orderId)).emit(event, payload);
  }

  toMerchant(merchantId: string, event: RealtimeEvent, payload: unknown) {
    this.server?.to(merchantRoom(merchantId)).emit(event, payload);
  }

  toStaff(event: RealtimeEvent, payload: unknown) {
    this.server?.to(STAFF_ROOM).emit(event, payload);
  }
}
