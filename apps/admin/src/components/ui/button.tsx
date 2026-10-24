import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[#007AFF] text-white shadow-sm hover:bg-[#0066D6] active:scale-[0.98]",
        outline: "border border-line bg-white text-foreground hover:bg-[#F5F5F7] active:scale-[0.98]",
        ghost: "text-muted hover:bg-[#F5F5F7] hover:text-foreground active:scale-[0.98]",
        destructive: "bg-[#FF3B30] text-white hover:bg-[#E0352B] active:scale-[0.98]",
      },
      size: {
        default: "px-4",
        sm: "min-h-9 rounded-lg px-3 text-xs",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
