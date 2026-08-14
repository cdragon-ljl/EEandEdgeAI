import type { CollectionEntry } from 'astro:content';
import { SERIES, type SeriesId } from './series';

export type Article = CollectionEntry<'articles'>;

export function sortArticles(articles: Article[]) {
  return [...articles].sort(
    (a, b) =>
      a.data.order - b.data.order ||
      a.data.pubDate.valueOf() - b.data.pubDate.valueOf() ||
      a.data.title.localeCompare(b.data.title, 'zh-CN'),
  );
}

export function bySeries(articles: Article[], series: SeriesId) {
  return sortArticles(articles.filter((article) => article.data.series === series && !article.data.draft));
}

export function slugFor(article: Article) {
  const [, ...parts] = article.id.split('/');
  return parts.join('/').replace(/\.md$/, '');
}

export function hrefFor(article: Article) {
  return `/${article.data.series}/${slugFor(article)}/`;
}

export function seriesMeta(series: SeriesId) {
  return SERIES[series];
}

export function isSeriesId(value: string): value is SeriesId {
  return value === 'cuda' || value === 'ee-system' || value === 'rknn' || value === 'zephyr' || value === 'bsp';
}
