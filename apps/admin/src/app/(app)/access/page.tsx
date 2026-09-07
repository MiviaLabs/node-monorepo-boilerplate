import { redirect } from 'next/navigation';

import type { SearchParamsRecord } from '../memberships/_access-shared';

function buildRedirectHref(searchParams: SearchParamsRecord) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query.length > 0 ? `/memberships?${query}` : '/memberships';
}

export default async function LegacyAccessPage({
  searchParams
}: {
  searchParams?: Promise<SearchParamsRecord>;
}) {
  redirect(buildRedirectHref((await searchParams) ?? {}));
}
