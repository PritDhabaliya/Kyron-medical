"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "h-10 w-full rounded-full border border-white/20 bg-white/10 px-4 text-white placeholder:text-white/60 backdrop-blur-xl shadow-2xl outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

