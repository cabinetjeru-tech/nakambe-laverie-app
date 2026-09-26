'use client';

import { forwardRef, InputHTMLAttributes } from 'react';

/** Saisie d'un numéro burkinabè : indicatif +226 affiché, 8 chiffres groupés par deux. */
export const PhoneInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }>(
  function PhoneInput({ value, onChange, ...rest }, ref) {
    return (
      <div className="flex rounded-xl border border-slate-300 bg-white focus-within:border-brand-light focus-within:ring-2 focus-within:ring-brand-light/30">
        <span className="flex items-center border-r border-slate-200 px-3 text-[15px] font-medium text-slate-600">🇧🇫 +226</span>
        <input
          ref={ref}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="70 12 34 56"
          value={value}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').replace(/^226/, '').slice(0, 8);
            onChange(digits.replace(/(\d{2})(?=\d)/g, '$1 '));
          }}
          className="min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2.5 text-[15px] tracking-wide focus:outline-none"
          {...rest}
        />
      </div>
    );
  },
);
