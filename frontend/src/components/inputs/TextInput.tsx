import React from 'react';

interface TextInputProps {
  title: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  'aria-describedby'?: string;
  error?: boolean;
}

const TextInput: React.FC<TextInputProps> = ({
  title,
  type = 'text',
  placeholder,
  value,
  onChange,
  required = false,
  'aria-describedby': ariaDescribedBy,
  error = false
}) => {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-gray-800 mb-2">
        {title}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          aria-describedby={ariaDescribedBy}
          className={`
            w-full px-4 py-3 rounded-xl border-2 bg-white
            text-gray-800 placeholder-gray-400 text-base
            transition-all duration-300 ease-in-out
            focus:outline-none focus:ring-4 focus:ring-opacity-20
            hover:shadow-md
            ${error 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-200 bg-red-50' 
              : 'border-gray-200 focus:border-blue-500 focus:ring-blue-200 hover:border-gray-300'
            }
          `}
        />
        
        <div className={`
          absolute inset-0 rounded-xl pointer-events-none transition-all duration-300
          ${error 
            ? 'shadow-red-100' 
            : 'shadow-blue-100'
          }
          ${value ? 'shadow-sm' : ''}
        `} />
        
        {type === 'password' && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        )}
        
        {type === 'text' && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        )}
      </div>
      
      {!error && type === 'text' && (
        <p className="text-xs text-gray-500 mt-1">
          Enter a valid username or email address
        </p>
      )}
      
      {!error && type === 'password' && (
        <p className="text-xs text-gray-500 mt-1">
          Use a secure password to protect your account
        </p>
      )}
    </div>
  );
};

export default TextInput;