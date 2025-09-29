import jwt from 'jsonwebtoken';

export const createToken = (payload: any): string => {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  
  return jwt.sign(payload, secret as string, {
    expiresIn: process.env['JWT_EXPIRES_IN'] || '7d'
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): any => {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  
  return jwt.verify(token, secret as string);
};
