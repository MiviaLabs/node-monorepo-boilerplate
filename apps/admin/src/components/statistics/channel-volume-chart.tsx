'use client';

import React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '~/components/ui/chart';

const chartConfig = {
  volume: {
    label: 'Message volume',
    color: 'hsl(var(--chart-1))'
  }
} satisfies ChartConfig;

export function ChannelVolumeChart({ data }: { data: Array<{ label: string; value: number }> }) {
  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      <BarChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} tickMargin={10} width={36} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" fill="var(--color-volume)" radius={[8, 8, 0, 0]} barSize={36} />
      </BarChart>
    </ChartContainer>
  );
}
