import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type LabelHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...rest }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gatemark-primary focus:outline-none focus:ring-1 focus:ring-gatemark-primary disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      {...rest}
    />
  )
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...rest }, ref) => (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-gatemark-primary focus:outline-none focus:ring-1 focus:ring-gatemark-primary ${className}`}
      {...rest}
    />
  )
);
Textarea.displayName = "Textarea";

export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={`mb-1.5 block text-xs font-medium text-slate-600 ${className}`} {...rest} />
  );
}

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = "", children, ...rest }, ref) => (
  <select
    ref={ref}
    className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-gatemark-primary focus:outline-none focus:ring-1 focus:ring-gatemark-primary ${className}`}
    {...rest}
  >
    {children}
  </select>
));
Select.displayName = "Select";
