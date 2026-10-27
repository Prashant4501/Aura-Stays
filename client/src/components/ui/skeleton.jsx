import React from 'react';
import { cn } from '../../lib/utils';

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-muted/60 dark:bg-muted/30', className)}
      {...props}
    />
  );
}

export { Skeleton };
