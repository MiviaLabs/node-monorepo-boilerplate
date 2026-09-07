# Frontend standard

## Applies to

`apps/web` and `apps/admin`, both Next.js/React applications using TypeScript. The applications currently use TanStack Query, React Hook Form, Zod, Material UI and/or Radix UI, Redux Toolkit, and Vitest according to their package manifests.

## Required behavior

- Treat Server Components as the default in Next.js. Add `'use client'` only for browser APIs, local interaction, or client state, and keep the boundary as narrow as possible.
- Use the application’s existing data layer and API contracts. Do not fetch from internal services directly in a component or duplicate server state in Redux.
- Validate forms with the established React Hook Form plus Zod pattern and show actionable, accessible error states.
- Keep URL-visible filters, pagination, and shareable view state in the URL when the surrounding feature already follows that pattern.
- Reuse the local design-system components and tokens. Preserve keyboard access, labels, focus behavior, and responsive layouts.
- Handle loading, empty, error, unauthorized, and mutation-pending states explicitly. Avoid flashing protected content before authorization is known.
- Keep effects for synchronization with external systems; derive render state directly from props and query data.
- Use stable keys and preserve identity in sortable, tabular, and form collections.

## Do not

- Do not use `dangerouslySetInnerHTML` with untrusted content.
- Do not put tokens, secrets, or authorization decisions in browser code.
- Do not add a new UI library for a component that an existing library already supplies.
- Do not make a page client-rendered just to perform a server fetch.

## Verification

Run the owning Nx lint/test/build targets. Use Vitest for component and interaction behavior; use Playwright for critical navigation, authentication, protected-route, and end-to-end user flows.
