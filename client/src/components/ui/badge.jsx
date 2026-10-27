import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary/10 text-primary hover:bg-primary/20',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive/10 text-destructive',
        outline: 'text-foreground',
        success:
          'border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        warning:
          'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400',
        info:
          'border-transparent bg-sky-500/10 text-sky-600 dark:text-sky-400',
        gold:
          'border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
