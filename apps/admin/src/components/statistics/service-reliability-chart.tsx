'use client';

import React from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '~/components/ui/chart';

const chartConfig = {
  Published: { label: 'Published', color: 'hsl(var(--chart-2))' },
  Pending: { label: 'Pending', color: 'hsl(var(--chart-4))' },
  Failed: { label: 'Failed', color: 'hsl(var(--chart-5))' },
  Processing: { label: 'Processing', color: 'hsl(var(--chart-1))' }
} satisfies ChartConfig;

export function ServiceReliabilityChart({
  data
}: {
  data: Array<{ status: string; value: number; fill: string }>;
}) {
  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <ChartLegend content={<ChartLegendContent nameKey="status" />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="status"
          innerRadius={54}
          outerRadius={78}
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
