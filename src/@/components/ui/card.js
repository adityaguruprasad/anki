import React from 'react';

function cx(...classNames) {
  return classNames.filter(Boolean).join(' ');
}

export const Card = React.forwardRef(({ className = '', ...props }, ref) => (
  <div
    ref={ref}
    className={cx('rounded border border-gray-200 bg-white shadow-sm', className)}
    {...props}
  />
));

Card.displayName = 'Card';

export const CardContent = React.forwardRef(({ className = '', ...props }, ref) => (
  <div ref={ref} className={className} {...props} />
));

CardContent.displayName = 'CardContent';
