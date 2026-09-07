'use client';

import React from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '~/components/ui/chart';

const chartData: Array<{ week: string; reviews: number; resolved: number }> = [
  { week: 'Feb 10', reviews: 12, resolved: 18 },
  { week: 'Feb 17', reviews: 16, resolved: 21 },
  { week: 'Feb 24', reviews: 11, resolved: 19 },
  { week: 'Mar 3', reviews: 14, resolved: 23 },
  { week: 'Mar 10', reviews: 9, resolved: 20 }
];

const chartConfig = {
  reviews: {
    label: 'Pending reviews',
    color: 'hsl(var(--chart-5))'
  },
  resolved: {
    label: 'Resolved actions',
    color: 'hsl(var(--chart-2))'
  }
} satisfies ChartConfig;

export function OperationalTrendsChart() {
  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickMargin={10} width={36} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="resolved" fill="var(--color-resolved)" radius={[10, 10, 0, 0]} barSize={32} />
        <Line
          type="monotone"
          dataKey="reviews"
          stroke="var(--color-reviews)"
          strokeWidth={2.5}
          dot={{ r: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
