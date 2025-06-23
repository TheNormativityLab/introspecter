import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Request, Response } from 'express';
import { logger } from '../../../../services/logger';
import { Users } from '../../../../models/User/User';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

export const getUserAuth = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;  
    const envPath = path.resolve(__dirname, '../../../../../.env');
    logger.info(`User login attempt for username: ${username}`);

    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, '');
    }
    dotenv.config({ path: envPath });
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        errors: {
          username: !username ? ['Username is required'] : undefined,
          password: !password ? ['Password is required'] : undefined,
        }
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);    
    let user: any = await Users.findOne({ name: username });
    
    let isExistingUser = false;
    if (user) {
      const allUsersWithUsername = await Users.find({ name: username });
      const matchingUser = await Promise.all(
        allUsersWithUsername.map(async (u) => {
          const isMatch = await bcrypt.compare(password, u.password);
          return isMatch ? u : null;
        })
      );
      
      const foundUser = matchingUser.find(u => u !== null);
      if (foundUser) {
        user = foundUser;
        isExistingUser = true;
      }
    }
    
    if (!isExistingUser) {
      const newUser = Users.build({
        name: username,
        password: hashedPassword
      });
      user = await newUser.save();
      logger.info(`Created new user with username: ${username}`);
    }
    if (!process.env.JWT_SECRET) {
      const newSecret = crypto.randomBytes(64).toString('hex');
      fs.appendFileSync(envPath, `\nJWT_SECRET=${newSecret}`);
      process.env.JWT_SECRET = newSecret;
      console.log('Generated new JWT_SECRET and saved to .env');
    }
    const token = jwt.sign(
      { userId: user._id, username: user.name },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const logoutUser = (req: Request, res: Response) => {
  res.json({ success: true });
};

export const getUserProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { userId } = req.user;    
    const user = await Users.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.name,
      }
    });

  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};