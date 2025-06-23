import { NextRequest, NextResponse } from "next/server";
import { cookies } from 'next/headers';

interface BackendLoginResponse {
  success: boolean;
  message?: string;
  user?: {
    id: string;
    username: string;
  };
  token?: string;
  errors?: any;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (!process.env.BACKEND_URL) {
      return NextResponse.json(
        { success: false, message: "Backend URL not configured" },
        { status: 500 }
      );
    }

    switch (action) {
      case 'login':
        return await handleLogin(body);
      case 'logout':
        return await handleLogout();
      case 'profile':
        return await handleProfile();
      default:
        return NextResponse.json(
          { success: false, message: "Invalid action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleLogin(body: any) {
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({
      success: false,
      errors: {
        username: !username ? ['Username is required'] : undefined,
        password: !password ? ['Password is required'] : undefined,
      }
    }, { status: 400 });
  }

  try {
    const backendResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/user/user-auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    if (!backendResponse.ok) {
      const contentType = backendResponse.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const errorData = await backendResponse.json();
        return NextResponse.json({
          success: false,
          message: errorData.message || 'Login failed',
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `Backend error: ${backendResponse.status} ${backendResponse.statusText}`,
        });
      }
    }
    const backendData: BackendLoginResponse = await backendResponse.json();

    if (backendData.success && backendData.token) {
      const cookieStore = await cookies();
      cookieStore.set('auth-token', backendData.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/'
      });

      return NextResponse.json({
        success: true,
        user: backendData.user
      });
    } else {
      return NextResponse.json({
        success: false,
        message: backendData.message || 'Login failed',
        errors: backendData.errors
      }, { status: 401 });
    }
  } catch (error) {
    console.error('Backend login error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to connect to authentication server'
    }, { status: 500 });
  }
}

async function handleLogout() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;

    if (token) {
      try {
        await fetch(`${process.env.BACKEND_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        console.error('Backend logout error:', error);
      }
    }

    cookieStore.delete('auth-token');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({
      success: false,
      message: 'Logout failed'
    }, { status: 500 });
  }
}

async function handleProfile() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    
    if (!token) {
      return NextResponse.json({
        success: false,
        message: 'Not authenticated'
      }, { status: 401 });
    }

    const backendResponse = await fetch(`${process.env.BACKEND_URL}/api/v1/auth/profile`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const backendData = await backendResponse.json();

    if (backendResponse.ok) {
      return NextResponse.json({
        success: true,
        user: backendData.user
      });
    } else {
      return NextResponse.json({
        success: false,
        message: backendData.message || 'Failed to get profile'
      }, { status: backendResponse.status });
    }
  } catch (error) {
    console.error('Profile error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get profile'
    }, { status: 500 });
  }
}