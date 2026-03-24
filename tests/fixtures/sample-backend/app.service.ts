import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private configService: ConfigService) {}

  getPort() {
    return this.configService.get('PORT', 3000);
  }

  getSecret() {
    // This is a violation - should use configService
    return process.env.JWT_SECRET;
  }
}
