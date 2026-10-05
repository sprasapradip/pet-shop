import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { cache } from '../../lib/cache.js';
import { env } from '../../config/env.js';

export interface BusinessSettings {
  mobile: string;
  whatsapp: string;
  email: string;
  geoLat: number;
  geoLng: number;
  mapEmbedUrl: string;
  socialLinks: string[];
  googleRating: number;
  googleReviewCount: number;
  googleReviewUrl: string;
  vetName: string;
  vetRegistrationNo: string;
}

export interface DeliverySettings {
  ringRoadPaisa: number;
  valleyPaisa: number;
  outsideBasePaisa: number;
  outsidePerKgPaisa: number;
  freeAbovePaisa: number;
}

export interface SeoSettings {
  defaultTitle: string;
  defaultDescription: string;
  ogImage: string;
}

export interface HomeSettings {
  heroTitle: string;
  heroSubtitle: string;
  announcement: string;
}

export interface PaymentSettings {
  esewaEnabled: boolean;
  khaltiEnabled: boolean;
  codEnabled: boolean;
}

export interface AllSettings {
  business: BusinessSettings;
  delivery: DeliverySettings;
  seo: SeoSettings;
  home: HomeSettings;
  payments: PaymentSettings;
}

export const DEFAULT_SETTINGS: AllSettings = {
  business: {
    mobile: '',
    whatsapp: env.WHATSAPP_NUMBER,
    email: 'info@everestkennel.com.np',
    geoLat: 27.6976,
    geoLng: 85.2817,
    mapEmbedUrl: 'https://www.google.com/maps?q=Soaltee+Mode,+Kathmandu&output=embed',
    socialLinks: [],
    googleRating: 4.8,
    googleReviewCount: 0,
    googleReviewUrl: '',
    vetName: '',
    vetRegistrationNo: '',
  },
  delivery: {
    ringRoadPaisa: 10_000,
    valleyPaisa: 15_000,
    outsideBasePaisa: 25_000,
    outsidePerKgPaisa: 5_000,
    freeAbovePaisa: 500_000,
  },
  seo: {
    defaultTitle: 'The Everest Kennel | Pet Shop, Vet House Call & Dog Boarding in Kathmandu',
    defaultDescription:
      'Pet shop at Soaltee Mode, Kathmandu: puppies, dog food, accessories, vet house calls, vaccination, dog boarding, training and an animal care shelter.',
    ogImage: '/assets/img/og-default.jpg',
  },
  home: {
    heroTitle: 'Pet Shop, Vet House Call and Dog Boarding in Kathmandu',
    heroSubtitle:
      'Healthy puppies, quality pet food and accessories, vaccinations at your door and a safe kennel while you travel. Soaltee Mode, Kathmandu.',
    announcement: '',
  },
  payments: {
    esewaEnabled: true,
    khaltiEnabled: true,
    codEnabled: true,
  },
};

export type SettingsKey = keyof AllSettings;

export async function getSettings(): Promise<AllSettings> {
  return cache.remember('settings:all', async () => {
    const rows = await prisma.setting.findMany();
    const merged = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
    for (const row of rows) {
      if (row.key in merged && row.value && typeof row.value === 'object') {
        Object.assign(merged[row.key]!, row.value as Record<string, unknown>);
      }
    }
    return merged as unknown as AllSettings;
  });
}

export async function saveSettings<K extends SettingsKey>(key: K, value: AllSettings[K]) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as unknown as Prisma.InputJsonValue },
    update: { value: value as unknown as Prisma.InputJsonValue },
  });
  cache.forget('settings:');
}

export async function getBusinessHours() {
  return cache.remember('settings:hours', () => prisma.businessHour.findMany({ orderBy: { weekday: 'asc' } }));
}
