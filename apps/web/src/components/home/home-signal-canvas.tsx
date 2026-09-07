'use client';

import { useEffect, useRef } from 'react';

type NodePoint = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  orbit: number;
};

const NODE_COUNT = 18;
const CONNECTION_DISTANCE = 150;

export function HomeSignalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointer = { x: 0.5, y: 0.4 };
    let reducedMotion = mediaQuery.matches;
    let width = 0;
    let height = 0;
    let animationFrame = 0;

    const nodes: NodePoint[] = Array.from({ length: NODE_COUNT }, (_, index) => ({
      angle: (Math.PI * 2 * index) / NODE_COUNT,
      radius: 0.12 + (index % 6) * 0.055,
      speed: 0.00055 + (index % 5) * 0.00016,
      size: 1.2 + (index % 4) * 0.45,
      orbit: 0.6 + (index % 3) * 0.16
    }));

    const updateCanvasSize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;

      width = nextWidth;
      height = nextHeight;

      canvas.width = nextWidth * ratio;
      canvas.height = nextHeight * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();

      if (!bounds.width || !bounds.height) {
        return;
      }

      pointer.x = (event.clientX - bounds.left) / bounds.width;
      pointer.y = (event.clientY - bounds.top) / bounds.height;
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;

      window.cancelAnimationFrame(animationFrame);

      if (reducedMotion) {
        drawFrame(0);
        return;
      }

      animationFrame = window.requestAnimationFrame(drawFrame);
    };

    const drawFrame = (time: number) => {
      context.clearRect(0, 0, width, height);

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(125, 211, 252, 0.1)');
      gradient.addColorStop(0.45, 'rgba(196, 181, 253, 0.025)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0.1)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      context.lineWidth = 1;

      for (let x = 0; x <= width; x += 48) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }

      for (let y = 0; y <= height; y += 48) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const centerX = width * (0.48 + (pointer.x - 0.5) * 0.08);
      const centerY = height * (0.42 + (pointer.y - 0.5) * 0.1);
      const scale = Math.min(width, height);

      const positions = nodes.map((node) => {
        const tick = reducedMotion ? node.angle : time * node.speed + node.angle;
        const driftX = Math.cos(tick * node.orbit) * scale * node.radius;
        const driftY = Math.sin(tick) * scale * node.radius * 0.72;

        return {
          x: centerX + driftX,
          y: centerY + driftY,
          size: node.size
        };
      });

      context.lineWidth = 1;

      positions.forEach((point, index) => {
        for (let candidate = index + 1; candidate < positions.length; candidate += 1) {
          const other = positions[candidate];

          if (!other) {
            continue;
          }

          const distance = Math.hypot(point.x - other.x, point.y - other.y);

          if (distance > CONNECTION_DISTANCE) {
            continue;
          }

          const opacity = 0.12 * (1 - distance / CONNECTION_DISTANCE);
          context.strokeStyle = `rgba(96, 165, 250, ${opacity.toFixed(3)})`;
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(other.x, other.y);
          context.stroke();
        }
      });

      positions.forEach((point) => {
        const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, 9);
        glow.addColorStop(0, 'rgba(186, 230, 253, 0.6)');
        glow.addColorStop(0.45, 'rgba(96, 165, 250, 0.16)');
        glow.addColorStop(1, 'rgba(96, 165, 250, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, 9, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = 'rgba(226, 232, 240, 0.82)';
        context.beginPath();
        context.arc(point.x, point.y, point.size, 0, Math.PI * 2);
        context.fill();
      });

      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(drawFrame);
      }
    };

    updateCanvasSize();

    if (!reducedMotion) {
      animationFrame = window.requestAnimationFrame(drawFrame);
    } else {
      drawFrame(0);
    }

    window.addEventListener('resize', updateCanvasSize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    mediaQuery.addEventListener('change', handleMotionChange);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updateCanvasSize);
      window.removeEventListener('pointermove', handlePointerMove);
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full opacity-90"
    />
  );
}
