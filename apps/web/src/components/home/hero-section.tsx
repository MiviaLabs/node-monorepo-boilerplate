import Image from 'next/image';

import { homePalette } from './home-palette';
import { HomeSurface } from './home-primitives';
import BorderBeam from '../magicui/BorderBeam';
import DotPattern from '../magicui/DotPattern';
import Marquee from '../magicui/Marquee';

const enum RegionCode {
  SaudiArabia = 'sa',
  EuropeanUnion = 'eu',
  UnitedStates = 'us'
}

function RegionFlag({ code }: { code: RegionCode }) {
  if (code === 'sa') {
    return (
      <svg viewBox="0 0 18 12" className="h-3.5 w-5 rounded-[2px]" aria-hidden="true">
        <rect width="18" height="12" fill="#0b9f3b" />
        <rect x="3" y="5.5" width="12" height="1" rx="0.5" fill="#ffffff" />
      </svg>
    );
  }

  if (code === 'eu') {
    return (
      <svg viewBox="0 0 18 12" className="h-3.5 w-5 rounded-[2px]" aria-hidden="true">
        <rect width="18" height="12" fill="#1c3f95" />
        <circle cx="9" cy="3.2" r="0.45" fill="#f7c948" />
        <circle cx="11.3" cy="3.9" r="0.45" fill="#f7c948" />
        <circle cx="12.2" cy="6" r="0.45" fill="#f7c948" />
        <circle cx="11.3" cy="8.1" r="0.45" fill="#f7c948" />
        <circle cx="9" cy="8.8" r="0.45" fill="#f7c948" />
        <circle cx="6.7" cy="8.1" r="0.45" fill="#f7c948" />
        <circle cx="5.8" cy="6" r="0.45" fill="#f7c948" />
        <circle cx="6.7" cy="3.9" r="0.45" fill="#f7c948" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 18 12" className="h-3.5 w-5 rounded-[2px]" aria-hidden="true">
      <rect width="18" height="12" fill="#ffffff" />
      <rect y="0" width="18" height="1.2" fill="#c62828" />
      <rect y="2.4" width="18" height="1.2" fill="#c62828" />
      <rect y="4.8" width="18" height="1.2" fill="#c62828" />
      <rect y="7.2" width="18" height="1.2" fill="#c62828" />
      <rect y="9.6" width="18" height="1.2" fill="#c62828" />
      <rect width="7.6" height="6.6" fill="#1e3a8a" />
    </svg>
  );
}

export function HeroSection() {
  const complianceBadges = ['PDPL Ready', 'GDPR Aligned', 'SOC 2 Friendly'] as const;
  const regionalFlags = [
    { code: RegionCode.SaudiArabia, label: 'Saudi Arabia', short: 'SA' },
    { code: RegionCode.EuropeanUnion, label: 'European Union', short: 'EU' },
    { code: RegionCode.UnitedStates, label: 'United States', short: 'US' }
  ] as const;

  return (
    <HomeSurface className="relative flex flex-col items-center justify-center overflow-hidden border-border/70 bg-background/95 p-9 md:p-12 lg:p-16">
      <DotPattern
        className="mask-[radial-gradient(300px_circle_at_center,white,transparent)]"
        width={20}
        height={20}
        cx={1}
        cy={1}
        cr={1}
      />
      <BorderBeam size={250} duration={12} delay={9} />

      <div className="relative z-10 flex flex-col items-center space-y-5 text-center">
        <p className="inline-flex rounded-full border border-border/80 bg-background/80 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground backdrop-blur-sm">
          Enterprise Starter
        </p>
        <h1
          className={`max-w-3xl text-3xl font-semibold tracking-tight ${homePalette.title} md:text-4xl lg:text-[3.1rem]`}
        >
          Build tenant-aware products with calm clarity and production confidence
        </h1>
        <p className={`max-w-2xl text-sm leading-7 ${homePalette.muted} md:text-base`}>
          Real authentication, tenant isolation, RBAC, and typed API contracts are ready from day
          one. Start with operational clarity, then extend for your domain.
        </p>

        <div className="w-full max-w-[500px] overflow-hidden">
          <Marquee pauseOnHover className="[--duration:20s]">
            {complianceBadges.map((badge) => (
              <span
                key={badge}
                className="inline-flex rounded-full border border-border/70 bg-background/80 px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-foreground/80"
              >
                {badge}
              </span>
            ))}
            {regionalFlags.map((item) => (
              <span
                key={item.label}
                aria-label={item.label}
                title={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-1 text-[11px] font-medium uppercase tracking-wide text-foreground/80"
              >
                <RegionFlag code={item.code} />
                <span>{item.short}</span>
              </span>
            ))}
          </Marquee>
        </div>

        <div className="w-full max-w-6xl pt-2">
          <div className="relative overflow-hidden rounded-xl border border-border/70 bg-background/70 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.45)]">
            <Image
              src="/img/homepage_hero.webp"
              alt="Platform architecture illustration showing modular systems connected by data flows."
              width={1680}
              height={720}
              priority
              className="h-auto w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-background/10 via-transparent to-transparent" />
          </div>
        </div>
      </div>
    </HomeSurface>
  );
}
