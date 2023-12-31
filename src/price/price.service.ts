import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import WebSocket from 'ws';
import { ConfigService } from '@nestjs/config';

interface BinanceMessage {
  p: string;
}

@Injectable()
export class PriceService {
  private binanceSocket: WebSocket;
  private retries = 0;
  private assetSymbol: string;
  private binanceWsUrl: string;
  private maxRetries: number;
  private reconnectDelay: number;
  private logger = new Logger(PriceService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.assetSymbol = this.configService
      .get<string>('ASSET_SYMBOL')
      .toLowerCase();
    this.binanceWsUrl = this.configService
      .get<string>('BINANCE_WS_URL')
      .replace('{ASSET_SYMBOL}', this.assetSymbol);
    console.log(this.binanceWsUrl);
    this.maxRetries = this.configService.get<number>('MAX_RETRIES');
    this.reconnectDelay = this.configService.get<number>('RECONNECT_DELAY');
    this.connectToBinance();
  }

  private connectToBinance() {
    this.binanceSocket = new WebSocket(this.binanceWsUrl);

    this.binanceSocket
      .on('open', this.handleOpen)
      .on('message', this.handleMessage)
      .on('error', this.handleError)
      .on('close', this.handleClose);
  }

  private handleOpen = () => {
    this.logger.log('Successfully connected to Binance via WebSocket.');
  };

  private handleMessage = async (message: any) => {
    try {
      const data: BinanceMessage = JSON.parse(message.toString());
      const price = parseFloat(data.p); // Convert string to number

      if (isNaN(price) || price <= 0) {
        this.logger.warn(`Invalid price data for ${this.assetSymbol}:`, price);
        return;
      }

      await this.storePrice(price);
    } catch (error) {
      this.logger.error(
        `Error processing the message for ${this.assetSymbol}: ${message}. Error: ${error.message}`,
      );
    }
  };

  private handleError = (error: any) => {
    this.logger.error(
      `WebSocket Error while processing price for ${this.assetSymbol}:`,
      error,
    );
    this.binanceSocket.close();
  };

  private handleClose = () => {
    if (this.retries < this.maxRetries) {
      this.logger.log('Trying to reconnect...');
      setTimeout(() => {
        this.retries++;
        this.reconnectDelay *= 1.5; // Increase delay by 50%
        this.connectToBinance();
      }, this.reconnectDelay);
    } else {
      this.logger.error(
        'Max retries reached. Check the connection or the endpoint.',
      );
    }
  };

  async storePrice(price: number) {
    try {
      const priceData = await this.prisma.assetPrice.create({
        data: {
          symbol: this.assetSymbol.toLowerCase(),
          price,
        },
      });
      this.logger.debug(
        `Successfully stored price for ${this.assetSymbol}: ${price}`,
      );
      return priceData;
    } catch (error) {
      this.logger.error(
        `Error storing price data for ${this.assetSymbol}: ${error.message}`,
      );
    }
  }

  // Function to calculate moving average
  async calculateMovingAverage(symbol: string, days: number): Promise<number> {
    const prices = await this.prisma.assetPrice.findMany({
      where: { symbol: symbol.toLowerCase() },
      orderBy: { datetime: 'desc' },
      take: days,
    });

    const total = prices.reduce((sum, priceData) => sum + priceData.price, 0);
    return total / days;
  }
}
