import React from 'react';
import './Button.scss';
import { Icon } from 'react-feather';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
  icon?: Icon;
  key?: string | number;
  iconPosition?: 'start' | 'end';
  iconColor?: 'red' | 'green' | 'grey' | 'blue' | 'purple' | 'white';
  iconFill?: boolean;
  buttonStyle?: 'regular' | 'action' | 'alert' | 'flush' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'ghost';
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
  
  classList.push(`button-style-${buttonStyle}`);
  
  classList.push(`button-size-${size}`);
  
  classList.push(`button-variant-${variant}`);
  
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