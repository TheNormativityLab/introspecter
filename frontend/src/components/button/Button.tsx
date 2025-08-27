import React from 'react';
import './Button.scss';
import { Icon } from 'react-feather';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: Icon;
  key?: string | number;
  iconPosition?: 'start' | 'end';
  iconColor?: 'red' | 'green' | 'grey' | 'blue' | 'purple' | 'white' | 'black';
  iconFill?: boolean;
  buttonStyle?: 'regular' | 'action' | 'alert' | 'flush' | 'primary' | 'secondary' | 'red' | 'black';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'ghost';
  color?: 'red' | 'green' | 'blue' | 'purple' | 'orange' | 'yellow' | 'gray' | 'black' | 'white';
}

export function Button({
  label = 'Okay',
  icon = void 0,
  iconPosition = 'start',
  iconColor = void 0,
  iconFill = false,
  buttonStyle = 'regular',
  size = 'md',
  variant = 'solid',
  color = void 0,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  const StartIcon = iconPosition === 'start' ? icon : null;
  const EndIcon = iconPosition === 'end' ? icon : null;
  
  const classList = [];
  
  if (iconColor) {
    classList.push(`icon-${iconColor}`);
  }
  
  if (iconFill) {
    classList.push(`icon-fill`);
  }
  
  classList.push(`button-size-${size}`);
  
  classList.push(`button-variant-${variant}`);
  
  classList.push(`button-style-${buttonStyle}`);
  
  // Add color class specifically for solid variants (put after buttonStyle for higher specificity)
  if (color && variant === 'solid') {
    classList.push(`button-color-${color}`);
  }
  
  if (className) {
    classList.push(className);
  }
  
  const content = children || label;
  
  return (
    <button 
      data-component="Button" 
      className={classList.join(' ')} 
      {...rest}
    >
      {StartIcon && (
        <span className="icon icon-start">
          <StartIcon />
        </span>
      )}
      <span className="label">{content}</span>
      {EndIcon && (
        <span className="icon icon-end">
          <EndIcon />
        </span>
      )}
    </button>
  );
}