import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Binance, { OrderType } from 'binance-api-node'; // Adjusted import
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class BinanceService {
  private binance: ReturnType<typeof Binance>;
  private logger = new Logger(BinanceService.name);

  constructor(private config: ConfigService, private prisma: PrismaService) {
    this.binance = Binance({
      apiKey: this.config.get('BINANCE_API_KEY'),
      apiSecret: this.config.get('BINANCE_API_SECRET'),
      getTime: undefined, // You can remove this if you don't want to specify any custom getTime function.
    });
  }

  async adjustOrder(
    symbol: string,
    orderId: string,
    newStopPrice: number,
  ): Promise<any> {
    try {
      // Cancel the existing order
      await this.binance.cancelOrder({
        symbol: symbol,
        orderId: parseInt(orderId),
      });

      // Determine the quantity dynamically from the Order model
      const orderDetails = await this.prisma.order.findFirst({
        where: { symbol: symbol },
      });
      const quantity = orderDetails?.quantity;

      // Place a new order with the adjusted stop price
      return await this.binance.order({
        symbol: symbol,
        side: 'SELL',
        quantity: quantity.toString(),
        price: (newStopPrice * 0.99).toString(),
        type: OrderType.STOP_LOSS_LIMIT,
        stopPrice: newStopPrice.toString(),
        // TODO: Add other required parameters
      });
    } catch (error) {
      this.logger.error(
        `Failed to adjust order for ${symbol}. Error: ${JSON.stringify(error)}`,
      );
      throw new InternalServerErrorException(
        `Failed to adjust order for ${symbol}`,
      );
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.binance.prices({ symbol: symbol });
      return parseFloat(ticker[symbol]);
    } catch (error) {
      this.logger.error(
        `Failed to fetch price for ${symbol}. Error: ${JSON.stringify(error)}`,
      );
      throw new InternalServerErrorException(
        `Failed to fetch price for ${symbol}`,
      );
    }
  }

  async getAssetQuantity(symbol: string): Promise<number> {
    try {
      const accountInfo = await this.binance.accountInfo();
      this.logger.debug(`Account Info: ${JSON.stringify(accountInfo)}`); // Additional logging

      const asset = symbol.slice(0, -4);
      this.logger.debug(`Extracted Asset: ${asset}`); // Additional logging

      const assetBalance = accountInfo.balances.find((b) => b.asset === asset);
      return parseFloat(assetBalance?.free || '0');
    } catch (error) {
      this.logger.error(
        `Failed to fetch balance for ${symbol}. Error: ${JSON.stringify(
          error,
        )}`,
      );
      throw new InternalServerErrorException(
        `Failed to fetch balance for ${symbol}`,
      );
    }
  }

  async executeSellOrder(symbol: string, quantity: number): Promise<any> {
    // Safety check for quantity
    if (quantity <= 0) {
      this.logger.warn(`Invalid quantity provided for sell order: ${quantity}`);
      throw new Error(`Invalid quantity provided for sell order: ${quantity}`);
    }

    try {
      const response = await this.binance.order({
        symbol: symbol,
        side: 'SELL',
        quantity: quantity.toString(),
        type: OrderType.MARKET,
      });

      if (response && response.status === 'FILLED') {
        await this.prisma.trade.create({
          data: {
            symbol: symbol,
            quantity: parseFloat(response.executedQty),
            price: parseFloat(response.price),
            tradeType: 'SELL',
          },
        });
      } else {
        this.logger.error(
          `Failed to execute sell order for ${symbol}. Response: ${JSON.stringify(
            response,
          )}`,
        );
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to execute sell order for ${symbol}. Error: ${JSON.stringify(
          error,
        )}`,
      );
      throw new InternalServerErrorException(
        `Failed to execute sell order for ${symbol}`,
      );
    }
  }

  async executeTrade(
    symbol: string,
    price: number,
    quantity: number,
    type: string,
    fee: number,
  ) {
    // ... Your logic to execute the trade ...

    // Once the trade is successful, log it
    await this.prisma.trade.create({
      data: {
        symbol: symbol,
        price: price,
        quantity: quantity,
        tradeType: type, // 'BUY' or 'SELL'
        fee: fee,
      },
    });
  }
}
