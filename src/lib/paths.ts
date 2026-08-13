export function withBase(path: string) {
  const base = import.meta.env.BASE_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base === '/' ? normalizedPath : `${base.replace(/\/$/, '')}${normalizedPath}`;
}

export function articlePath(series: string, slug: string) {
  return withBase(`/${series}/${slug}/`);
}
