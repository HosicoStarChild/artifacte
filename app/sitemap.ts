import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://artifacte.io';
  const now = new Date();

  const staticPages = [
    { url: base, priority: 1.0 },
    { url: `${base}/auctions/categories/tcg-cards`, priority: 0.9 },
    { url: `${base}/auctions/categories/sports-cards`, priority: 0.9 },
    { url: `${base}/auctions/categories/sealed`, priority: 0.9 },
    { url: `${base}/auctions/categories/merchandise`, priority: 0.8 },
    { url: `${base}/auctions/categories/spirits`, priority: 0.8 },
    { url: `${base}/digital-art`, priority: 0.8 },
    { url: `${base}/portfolio`, priority: 0.6 },
    { url: `${base}/agents/register`, priority: 0.5 },
  ];

  return staticPages.map(({ url, priority }) => ({
    url,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority,
  }));
}
