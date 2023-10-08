import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BinanceService } from 'src/binance/binance.service';
import { OnModuleInit } from '@nestjs/common';

@Injectable()
export class OrderService implements OnModuleInit {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private binanceService: BinanceService,
  ) {}

  @Cron('20 * * * * *') // Runs every minute at the 20th second. Adjust the frequency if needed
  handlePriceAdjustment() {
    const assetSymbol = this.config.get<string>('ASSET_SYMBOL');
    this.adjustStopOrder(assetSymbol);
    this.logger.debug(`Checked and adjusted stop order for ${assetSymbol}`);
  }

  async onModuleInit() {
    await this.initializeOrder(this.config.get<string>('ASSET_SYMBOL'));
  }

  async initializeOrder(symbol: string): Promise<void> {
    const existingOrder = await this.prisma.order.findFirst({
      where: { symbol, status: 'OPEN' },
    });

    if (!existingOrder) {
      const currentPrice = await this.binanceService.getCurrentPrice(symbol);
      const assetQuantity = await this.binanceService.getAssetQuantity(symbol); // Fetching the quantity dynamically
      await this.prisma.order.create({
        data: {
          symbol: symbol,
          price: currentPrice,
          type: 'STOP_LIMIT',
          status: 'OPEN',
          quantity: assetQuantity, // Using the dynamically fetched quantity
        },
      });
      this.logger.log(
        `Initialized starting order for ${symbol} at price ${currentPrice} with quantity ${assetQuantity}`,
      );
    }
  }

  async adjustStopOrder(symbol: string): Promise<void> {
    try {
      const currentOrder = await this.prisma.order.findFirst({
        where: { symbol, status: 'OPEN' },
      });
      const latestPriceData = await this.prisma.assetPrice.findFirst({
        where: { symbol },
        orderBy: { datetime: 'desc' },
      });

      const latestPrice = latestPriceData.price;

      if (latestPrice > currentOrder.highestObservedPrice) {
        await this.prisma.order.update({
          where: { id: currentOrder.id },
          data: { highestObservedPrice: latestPrice },
        });
      }

      const adjustmentThreshold = this.config.get<number>(
        'ADJUSTMENT_THRESHOLD',
        1.005,
      );
      if (latestPrice > currentOrder.price * adjustmentThreshold) {
        const newStopPrice = this.calculateNewStopPrice(latestPrice);
        const newOrderDetails = await this.binanceService.adjustOrder(
          symbol,
          currentOrder.binanceOrderId,
          newStopPrice,
        );

        await this.prisma.order.update({
          where: { id: currentOrder.id },
          data: {
            price: newStopPrice,
            binanceOrderId: newOrderDetails.orderId,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to adjust stop order for symbol: ${symbol}. Error: ${error.message}`,
      );
    }
  }

  async checkAndExecuteSell(symbol: string) {
    try {
      const currentOrder = await this.prisma.order.findFirst({
        where: { symbol, status: 'OPEN' },
      });
      const latestPriceData = await this.prisma.assetPrice.findFirst({
        where: { symbol },
        orderBy: { datetime: 'desc' },
      });
      const latestPrice = latestPriceData.price;

      if (latestPrice < currentOrder.highestObservedPrice * 0.99) {
        const quantity = await this.binanceService.getAssetQuantity(symbol);
        await this.binanceService.executeSellOrder(symbol, quantity); // Removed the third argument

        await this.prisma.order.update({
          where: { id: currentOrder.id },
          data: { status: 'FILLED' },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to execute sell order for symbol: ${symbol}. Error: ${error.message}`,
      );
    }
  }

  private calculateNewStopPrice(latestPrice: number): number {
    return latestPrice * 1.01; // Setting the new stop price 1% above the latest price
  }
}
