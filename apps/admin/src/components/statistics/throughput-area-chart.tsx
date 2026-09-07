'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '~/components/ui/chart';

const chartConfig = {
  published: {
    label: 'Published deliveries',
    color: 'hsl(var(--chart-1))'
  },
  retries: {
    label: 'Retry attempts',
    color: 'hsl(var(--chart-2))'
  },
  deadLetters: {
    label: 'Dead-letter events',
    color: 'hsl(var(--chart-5))'
  }
} satisfies ChartConfig;

export function ThroughputAreaChart({
  data
}: {
  data: Array<{ label: string; published: number; retries: number; deadLetters: number }>;
}) {
  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickMargin={10} width={32} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="published"
          fill="var(--color-published)"
          fillOpacity={0.14}
          stroke="var(--color-published)"
          strokeWidth={2.5}
        />
        <Area
          type="monotone"
          dataKey="retries"
          fill="var(--color-retries)"
          fillOpacity={0.16}
          stroke="var(--color-retries)"
          strokeWidth={2.5}
        />
        <Area
          type="monotone"
          dataKey="deadLetters"
          fill="var(--color-deadLetters)"
          fillOpacity={0.08}
          stroke="var(--color-deadLetters)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
