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
    this.assetSymbol = this.configService.get<string>('ASSET_SYMBOL');
    this.binanceWsUrl = this.configService
      .get<string>('BINANCE_TESTNET_WS_URL')
      .replace('{ASSET_SYMBOL}', this.assetSymbol);
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
    this.logger.log('Connected to Binance');
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

  private; // TODO: Ensure the Prisma model (assetPrice) is properly defined and indexed for performance
  async storePrice(price: number) {
    try {
      const priceData = await this.prisma.assetPrice.create({
        data: {
          symbol: this.assetSymbol,
          price,
        },
      });
      return priceData;
    } catch (error) {
      this.logger.error(`Error storing price data: ${error.message}`);
    }
  }
}
