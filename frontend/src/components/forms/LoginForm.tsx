'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import TextInput from '../inputs/TextInput';

interface LoginFormData {
  username: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    id: string;
    username: string;
  };
  errors?: {
    username?: string[];
    password?: string[];
  };
}

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: ''
  });
  const [errors, setErrors] = useState<{username?: string[]; password?: string[]}>({});

  const handleInputChange = (field: keyof LoginFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [field]: e.target.value
    }));
    
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const response = await fetch('/api/user-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          ...formData
        }),
      });

      const data: LoginResponse = await response.json();
      localStorage.setItem('userId', data.user?.id || '');
      localStorage.setItem('username', data.user?.username || '');
      localStorage.setItem('token', data.token || '');
      console.log('Login response:', data);

      if (data.success) {
        router.push('/dashboard');
      } else {
        if (data.errors) {
          setErrors(data.errors);
        } else {
          setErrors({
            username: [data.message || 'Login failed']
          });
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setErrors({
        username: ['Network error. Please try again.']
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-5">
          <div>
            <TextInput
              title="Username"
              type="text"
              placeholder="Enter your username"
              value={formData.username}
              onChange={handleInputChange('username')}
              required
              aria-describedby={errors.username ? "username-error" : undefined}
              error={!!errors.username}
            />
            {errors.username && (
              <div id="username-error" className="mt-2 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.username.join(', ')}
                </div>
              </div>
            )}
          </div>

          <div>
            <TextInput
              title="Password"
              type="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleInputChange('password')}
              required
              aria-describedby={errors.password ? "password-error" : undefined}
              error={!!errors.password}
            />
            {errors.password && (
              <div id="password-error" className="mt-2 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {errors.password.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !formData.username || !formData.password}
          className="
            w-full flex justify-center items-center py-4 px-6 
            border border-transparent rounded-xl shadow-lg 
            text-base font-semibold text-white 
            bg-gradient-to-r from-blue-600 to-indigo-600 
            hover:from-blue-700 hover:to-indigo-700 
            focus:outline-none focus:ring-4 focus:ring-blue-200
            disabled:opacity-50 disabled:cursor-not-allowed 
            transition-all duration-300 ease-in-out
            transform hover:scale-[1.02] hover:shadow-xl
            active:scale-[0.98]
          "
        >
          {loading ? (
            <>
              <svg 
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24"
              >
                <circle 
                  className="opacity-25" 
                  cx="12" 
                  cy="12" 
                  r="10" 
                  stroke="currentColor" 
                  strokeWidth="4"
                />
                <path 
                  className="opacity-75" 
                  fill="currentColor" 
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Getting Started...
            </>
          ) : (
            <>
              <span>Get Started</span>
              <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  );
}