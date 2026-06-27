import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import webpush from 'web-push';

@Injectable()
export class PushService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const email = process.env.VAPID_EMAIL?.trim();
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!email || !publicKey || !privateKey) return;
    webpush.setVapidDetails(email, publicKey, privateKey);
  }

  async saveSubscription(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: sub.endpoint },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException();
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    });
  }

  async deleteSubscription(userId: string, endpoint: string) {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Push subscription not found');
    }
  }

  async sendToUser(
    userId: string,
    payload: { title: string; body: string; url?: string },
  ) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err: any) {
          if (err.statusCode === 410) {
            await this.prisma.pushSubscription.delete({
              where: { endpoint: sub.endpoint },
            });
          }
        }
      }),
    );
  }
}
