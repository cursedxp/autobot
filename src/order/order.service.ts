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

  @Cron('20 * * * * *')
  handlePriceAdjustment() {
    const assetSymbol = this.config.get('ASSET_SYMBOL');
    this.adjustStopOrder(assetSymbol);
    this.logger.debug(`Checked and adjusted stop order for ${assetSymbol}`);
  }
  async onModuleInit() {
    await this.initializeOrder('BTCUSDT'); // or any other symbol you're tracking
  }

  async initializeOrder(symbol: string): Promise<void> {
    const existingOrder = await this.prisma.order.findFirst({
      where: { symbol, status: 'OPEN' },
    });

    if (!existingOrder) {
      // Fetch the current price from Binance (or your AssetPrice model)
      const currentPrice = await this.binanceService.getCurrentPrice(symbol); // You'll need to implement this function in your Binance service

      await this.prisma.order.create({
        data: {
          symbol: symbol,
          price: currentPrice,
          type: 'STOP_LIMIT', // or whatever type you want to initialize with
          status: 'OPEN',
          // If you have an actual order on Binance, you'd fetch and save the Binance order ID here
          // binanceOrderId: 'some_order_id_from_binance',
        },
      });
      this.logger.log(
        `Initialized starting order for ${symbol} at price ${currentPrice}`,
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

      if (!currentOrder || !latestPriceData) {
        this.logger.warn(
          `Missing current order or latest price data for symbol: ${symbol}`,
        );
        return;
      }

      const latestPrice = latestPriceData.price;

      if (latestPrice > (currentOrder.highestObservedPrice || 0)) {
        await this.prisma.order.update({
          where: { id: currentOrder.id },
          data: { highestObservedPrice: latestPrice },
        });
      }

      const thresholdPrice = currentOrder.price * 1.005;
      if (latestPrice > thresholdPrice) {
        const newStopPrice = this.calculateNewStopPrice(latestPrice);
        const newOrderDetails = await this.binanceService.adjustOrder(
          symbol,
          currentOrder.binanceOrderId,
          newStopPrice,
        );

        // Assuming the newOrderDetails contains a field "orderId" with the new order ID from Binance
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
    const currentOrder = await this.prisma.order.findFirst({
      where: { symbol, status: 'OPEN' },
    });

    const latestPriceData = await this.prisma.assetPrice.findFirst({
      where: { symbol },
      orderBy: { datetime: 'desc' },
    });

    if (!currentOrder || !latestPriceData) {
      return; // Handle error or missing data
    }

    const latestPrice = latestPriceData.price;

    // Check if the price has dropped by 1% from the highest observed price
    if (latestPrice < currentOrder.highestObservedPrice * 0.99) {
      //TODO: Determine the quantity dynamically
      await this.binanceService.executeSellOrder(symbol, 1, latestPrice);

      // Update the order status in the local database
      await this.prisma.order.update({
        where: { id: currentOrder.id },
        data: { status: 'FILLED' },
      });
    }
  }

  private calculateNewStopPrice(latestPrice: number): number {
    return latestPrice; // Modify as required
  }
}
