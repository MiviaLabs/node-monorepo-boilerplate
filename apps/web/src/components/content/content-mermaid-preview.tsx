'use client';

import { AlertTriangle, LoaderCircle } from 'lucide-react';
import mermaid from 'mermaid';
import { useEffect, useId, useMemo, useState } from 'react';

import { cn } from '~/lib/utils';

let mermaidInitialized = false;

const enum MermaidPreviewMode {
  Inline = 'inline',
  Overlay = 'overlay'
}

export { MermaidPreviewMode };

function ensureMermaidInitialized() {
  if (mermaidInitialized) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'neutral',
    flowchart: {
      useMaxWidth: false
    }
  });
  mermaidInitialized = true;
}

export function isMermaidLanguage(language: string | null | undefined) {
  return (language ?? '').trim().toLowerCase() === 'mermaid';
}

export function ContentMermaidPreview({
  className,
  code,
  mode = MermaidPreviewMode.Inline,
  scale = 1
}: {
  className?: string;
  code: string;
  mode?: MermaidPreviewMode;
  scale?: number;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const renderId = useId();
  const normalizedCode = useMemo(() => code.trim(), [code]);
  const intrinsicSize = useMemo(() => {
    if (!svg || typeof DOMParser === 'undefined') {
      return null;
    }

    try {
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const svgElement = parsed.querySelector('svg');

      if (!svgElement) {
        return null;
      }

      const viewBox = svgElement.getAttribute('viewBox');

      if (viewBox) {
        const [, , width, height] = viewBox
          .split(/[\s,]+/)
          .map((value) => Number.parseFloat(value));

        if (Number.isFinite(width) && Number.isFinite(height)) {
          return { width, height };
        }
      }

      const width = Number.parseFloat(svgElement.getAttribute('width') ?? '');
      const height = Number.parseFloat(svgElement.getAttribute('height') ?? '');

      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
      }

      return null;
    } catch {
      return null;
    }
  }, [svg]);
  const overlayWidth = intrinsicSize?.width;
  const overlayHeight = intrinsicSize?.height;

  useEffect(() => {
    if (!normalizedCode) {
      setSvg(null);
      setError(null);
      setIsRendering(false);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        ensureMermaidInitialized();
        setIsRendering(true);
        setError(null);

        const { svg: nextSvg } = await mermaid.render(
          `content-mermaid-${renderId.replace(/:/g, '-')}`,
          normalizedCode
        );

        if (!cancelled) {
          setSvg(nextSvg);
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg(null);
          setError(
            renderError instanceof Error ? renderError.message : 'Failed to render diagram.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [normalizedCode, renderId]);

  if (!normalizedCode) {
    return (
      <div
        className={cn(
          'flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/15 px-6 text-sm text-muted-foreground',
          className
        )}
      >
        Add Mermaid source to render a diagram preview.
      </div>
    );
  }

  if (isRendering && !svg && !error) {
    return (
      <div
        className={cn(
          'flex min-h-[200px] items-center justify-center rounded-2xl border border-border/70 bg-muted/15 text-muted-foreground',
          className
        )}
      >
        <LoaderCircle className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          'flex min-h-[200px] items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive',
          className
        )}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-medium">Diagram preview failed</div>
          <div className="mt-1 whitespace-pre-wrap wrap-break-word text-destructive/85">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        mode === MermaidPreviewMode.Overlay
          ? 'rounded-2xl border border-border/70 bg-white/90 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
          : 'overflow-auto rounded-2xl border border-border/70 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
        className
      )}
    >
      {svg ? (
        mode === MermaidPreviewMode.Overlay ? (
          <div
            className="flex items-start justify-start"
            style={{
              width: overlayWidth ? `${overlayWidth * scale}px` : 'fit-content',
              height: overlayHeight ? `${overlayHeight * scale}px` : 'fit-content'
            }}
          >
            <div
              className="[&_svg]:block [&_svg]:h-full [&_svg]:max-w-none [&_svg]:overflow-visible [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        ) : (
          <div
            className="origin-top"
            style={{
              transform: scale === 1 ? undefined : `scale(${scale})`,
              width: scale === 1 ? undefined : 'fit-content'
            }}
          >
            <div
              className={cn(
                '[&_svg]:mx-auto [&_svg]:h-auto',
                scale === 1 ? '[&_svg]:max-w-full' : '[&_svg]:max-w-none'
              )}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        )
      ) : null}
    </div>
  );
}
