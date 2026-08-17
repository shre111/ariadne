import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-none border-2 border-foreground px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]',
  {
    variants: {
      variant: {
        default: 'bg-card text-foreground',
        live: 'bg-live text-primary-foreground',
        hold: 'bg-hold text-white',
        ok: 'bg-ok text-white',
        fault: 'bg-fault text-white',
        muted: 'bg-card text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
