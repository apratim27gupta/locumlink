import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import webpush from 'web-push';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushPayload = { title: string; body: string; url?: string };

type ExpoPushTicket =
  | { status: 'ok'; id?: string }
  | { status: 'error'; message?: string; details?: { error?: string } };

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);

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

  async saveExpoToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
  ) {
    const existing = await this.prisma.expoPushToken.findUnique({
      where: { token },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException();
    }

    await this.prisma.expoPushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
  }

  async deleteExpoToken(userId: string, token: string) {
    const result = await this.prisma.expoPushToken.deleteMany({
      where: { token, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Expo push token not found');
    }
  }

  async sendToUser(userId: string, payload: PushPayload) {
    await Promise.allSettled([
      this.sendWebPushToUser(userId, payload),
      this.sendExpoToUser(userId, payload),
    ]);
  }

  private async sendWebPushToUser(userId: string, payload: PushPayload) {
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

  async sendExpoToUser(userId: string, payload: PushPayload) {
    const tokens = await this.prisma.expoPushToken.findMany({
      where: { userId },
    });
    if (tokens.length === 0) return;

    const messages = tokens.map((row) => ({
      to: row.token,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url ?? '/' },
      sound: 'default' as const,
    }));

    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`Expo push HTTP ${res.status}: ${text}`);
        return;
      }

      const body = (await res.json()) as { data?: ExpoPushTicket[] };
      const tickets = body.data ?? [];

      await Promise.allSettled(
        tickets.map(async (ticket, index) => {
          if (ticket.status !== 'error') return;
          const token = tokens[index]?.token;
          if (!token) return;

          const errorCode = ticket.details?.error;
          this.logger.warn(
            `Expo push error for token ${token.slice(0, 20)}…: ${ticket.message ?? errorCode ?? 'unknown'}`,
          );

          if (errorCode === 'DeviceNotRegistered') {
            await this.prisma.expoPushToken.delete({ where: { token } });
          }
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Expo push request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
