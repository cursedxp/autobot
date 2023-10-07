import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Binance from 'node-binance-api';

import { ConfigService } from '@nestjs/config';

@Injectable()
export class BinanceService {
  private binance: any;

  constructor(private config: ConfigService) {
    this.binance = new Binance().options({
      APIKEY: this.config.get('BINANCE_API_KEY'),
      APISECRET: this.config.get('BINANCE_API_SECRET'),
    });
  }

  async adjustOrder(
    symbol: string,
    orderId: string,
    newStopPrice: number,
  ): Promise<any> {
    try {
      // Cancel the existing order
      await this.binance.cancel(symbol, orderId);

      //TODO: Determine the quantity dynamically
      const quantity = 1; // Placeholder value

      // Place a new order with the adjusted stop price
      return await this.binance.sell(symbol, quantity, newStopPrice, {
        type: 'STOP_LOSS_LIMIT',
        //TODO: Add other required parameters
      });
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to adjust order for ${symbol}. Error: ${error.message}`,
      );
    }
  }

  async executeSellOrder(
    symbol: string,
    quantity: number,
    price: number,
  ): Promise<any> {
    return await this.binance.sell(symbol, quantity, price, { type: 'MARKET' });
  }
}
