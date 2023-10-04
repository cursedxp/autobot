import { Controller, Get } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('db-check')
  async checkDbConnection(): Promise<string> {
    try {
      const response = await this.prisma.assetPrice.findFirst();

      return ' Database connection is successful ';
    } catch (error) {
      return `Database connection failed:  ${error.message}`;
    }
  }
}
