import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProfitService {
  constructor(private prisma: PrismaService) {}

  async calculateProfit(
    symbol?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<number> {
    // Validation: Add validation logic here if necessary, e.g., symbol format, date range

    let trades;

    // Fetch trades based on provided filters
    if (symbol) {
      trades = await this.prisma.trade.findMany({
        where: {
          symbol: symbol,
          datetime: {
            gte: startDate || new Date(0), // Default to beginning of time if no startDate
            lte: endDate || new Date(), // Default to now if no endDate
          },
        },
      });
    } else {
      trades = await this.prisma.trade.findMany({
        where: {
          datetime: {
            gte: startDate || new Date(0),
            lte: endDate || new Date(),
          },
        },
      });
    }

    // Calculate profit
    let profit = 0;
    trades.forEach((trade) => {
      if (trade.tradeType === 'BUY') {
        profit -= trade.price * trade.quantity + (trade.fee || 0);
      } else if (trade.tradeType === 'SELL') {
        profit += trade.price * trade.quantity - (trade.fee || 0);
      }
    });

    return profit;
  }
}
