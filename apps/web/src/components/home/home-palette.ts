export const homePalette = {
  shell: 'bg-background text-foreground',
  nav: 'border-border bg-background/90 text-foreground supports-backdrop-filter:bg-background/75',
  footer: 'border-border bg-background/85 text-muted-foreground',
  surface:
    'rounded-2xl border border-border/80 bg-card/90 shadow-[0_10px_26px_-22px_rgba(15,23,42,0.25)] dark:shadow-[0_10px_22px_-20px_rgba(0,0,0,0.55)]',
  title: 'text-foreground',
  muted: 'text-muted-foreground'
} as const;
