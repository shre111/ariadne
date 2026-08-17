import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-xs font-bold uppercase tracking-[0.04em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
  {
    variants: {
      variant: {
        default: 'border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_hsl(var(--hold))] hover:bg-primary/90',
        secondary: 'border-2 border-foreground bg-secondary text-secondary-foreground shadow-[3px_3px_0_hsl(var(--hold))] hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground active:translate-x-0 active:translate-y-0',
        outline: 'border-2 border-foreground bg-transparent text-foreground hover:bg-accent',
        danger: 'border-2 border-foreground bg-fault text-white shadow-[3px_3px_0_hsl(var(--foreground))] hover:bg-fault/90',
        approve: 'border-2 border-foreground bg-ok text-white shadow-[3px_3px_0_hsl(var(--foreground))] hover:bg-ok/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-11 px-6 text-sm',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
