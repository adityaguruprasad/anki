import React from 'react';

function cx(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

export const Button = React.forwardRef(
  ({ className = '', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

Button.displayName = 'Button';
