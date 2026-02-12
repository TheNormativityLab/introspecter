"use strict";
// import jwt from 'jsonwebtoken';
// import { Request, Response, NextFunction } from 'express';
Object.defineProperty(exports, "__esModule", { value: true });
// export const authenticateToken = (req: any, res: Response, next: NextFunction) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];
//   if (!token) {
//     return res.status(401).json({
//       success: false,
//       message: 'Access token required'
//     });
//   }
//   jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key', (err: any, user: any) => {
//     if (err) {
//       return res.status(403).json({
//         success: false,
//         message: 'Invalid or expired token'
//       });
//     }
//     req.user = user;
//     next();
//   });
// };
//# sourceMappingURL=auth.js.map