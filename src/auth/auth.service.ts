import { Injectable, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AuthService {
  async verifyLineToken(idToken: string): Promise<any> {
    try {
      const response = await axios.post(
        'https://api.line.me/oauth2/v2.1/verify',
        new URLSearchParams({
          id_token: idToken,
          client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      return response.data; 
    } catch (error) {
      throw new UnauthorizedException('Invalid LINE token');
    }
  }
}