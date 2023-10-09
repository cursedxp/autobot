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
  private isRunning = false;
  @Cron('10 * * * * *')
  async handleTradingLogic() {
    if (this.isRunning) {
      this.logger.debug(`Trading logic is currently running. Exiting...`);
      return;
    }

    this.isRunning = true;
    const assetSymbol = this.config.get<string>('ASSET_SYMBOL');
    const currentTimestamp = new Date().toISOString();
    this.logger.debug(
      `[${currentTimestamp}] Starting trading logic for ${assetSymbol}`,
    );

    const currentOrder = await this.prisma.order.findFirst({
      where: { symbol: assetSymbol, status: 'OPEN' },
    });
    let latestPriceData;

    try {
      latestPriceData = await this.prisma.assetPrice.findFirst({
        where: { symbol: assetSymbol.toLowerCase() },
        orderBy: { datetime: 'desc' },
        take: 1,
      });
    } catch (error) {
      this.logger.error(
        `Error fetching latest price for ${assetSymbol}: ${error.message}`,
      );
    }

    if (latestPriceData) {
      this.logger.debug(
        `Fetched price data for ${assetSymbol}: ${JSON.stringify(
          latestPriceData,
        )}`,
      );
    } else {
      this.logger.warn(`No price data found for ${assetSymbol}`);
    }

    this.logger.debug(
      `Current order for ${assetSymbol}: ${JSON.stringify(currentOrder)}`,
    );
    this.logger.debug(
      `Latest price data for ${assetSymbol}: ${JSON.stringify(
        latestPriceData,
      )}`,
    );

    if (currentOrder && latestPriceData) {
      await this.adjustStopOrder(
        assetSymbol,
        currentOrder,
        latestPriceData.price,
      );
      await this.checkAndExecuteSell(
        assetSymbol,
        currentOrder,
        latestPriceData.price,
      );
    }
    this.logger.debug(
      `[${currentTimestamp}] Finished trading logic for ${assetSymbol}`,
    );

    this.logger.debug(`Handled trading logic for ${assetSymbol}`);
    this.isRunning = false;
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
          highestObservedPrice: currentPrice, // Initializing with the current price
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

  async adjustStopOrder(
    symbol: string,
    currentOrder: any,
    latestPrice: number,
  ): Promise<void> {
    this.logger.debug(
      `Adjusted stop order for ${symbol} with new stop price of ${latestPrice}`,
    );

    try {
      if (latestPrice > currentOrder.highestObservedPrice) {
        await this.prisma.order.update({
          where: { id: currentOrder.id },
          data: { highestObservedPrice: latestPrice },
        });
        currentOrder.highestObservedPrice = latestPrice; // Updating in-memory object
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

  async checkAndExecuteSell(
    symbol: string,
    currentOrder: any,
    latestPrice: number,
  ): Promise<void> {
    this.logger.debug(
      `Checking sell condition for ${symbol}. Latest price: ${latestPrice}, Highest observed price: ${currentOrder.highestObservedPrice}`,
    );

    try {
      if (latestPrice < currentOrder.highestObservedPrice * 0.99) {
        const quantity = await this.binanceService.getAssetQuantity(symbol);
        await this.binanceService.executeSellOrder(symbol, quantity);

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
