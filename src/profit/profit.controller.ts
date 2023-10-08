import { Controller, Query, Get } from '@nestjs/common';
import { ProfitService } from './profit.service';

@Controller('profit')
export class ProfitController {
  constructor(private profitService: ProfitService) {}

  @Get('/')
  async getProfit(
    @Query('symbol') symbol?: string,
    @Query('startDate') startDate?: Date,
    @Query('endDate') endDate?: Date,
  ): Promise<{ profit: number }> {
    const profit = await this.profitService.calculateProfit(
      symbol,
      startDate,
      endDate,
    );
    return { profit };
  }
}
