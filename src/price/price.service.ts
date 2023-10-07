import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import WebSocket from 'ws';
import { ConfigService } from '@nestjs/config';

//TODO: Find bnb websocket api url

interface BinanceMessage {
  p: number;
}

@Injectable()
export class PriceService {
  private binanceSocket: WebSocket;
  private retries = 0;
  private assetSymbol: string;
  private binanceWsUrl: string;
  private maxRetries: number;
  private reconnectDelay: number;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.assetSymbol = this.configService.get<string>('ASSET_SYMBOL');
    this.binanceWsUrl = this.configService
      .get<string>('BINANCE_WS_URL')
      .replace('{ASSET_SYMBOL}', this.assetSymbol);
    this.maxRetries = this.configService.get<number>('MAX_RETRIES');
    this.reconnectDelay = this.configService.get<number>('RECONNECT_DELAY');
  }

  private connectToBinance() {
    this.binanceSocket = new WebSocket(this.binanceWsUrl);

    this.binanceSocket
      .on('open', this.handleOpen)
      .on('message', this.handleMessage)
      .on('error', this.handleError)
      .on('close', this.handleClose);
  }

  private handleOpen() {
    console.log('Connected to Binance');
  }
  private async handleMessage(message: any) {
    try {
      const data: BinanceMessage = JSON.parse(message.toString());
      const price = data.p;

      if (typeof price !== 'number' || price <= 0) {
        console.warn(`Invalid price data for ${this.assetSymbol}:`, price);
        return;
      }

      console.log(`Price of ${this.assetSymbol} is: ${price}`);
      await this.storePrice(price);
    } catch (error) {
      console.error(
        `Error processing the message for ${this.assetSymbol}:`,
        message,
        'Error:',
        error,
      );
    }
  }

  private handleError = (error: any) => {
    console.error(
      `WebSocket Error while processing price for ${this.assetSymbol}:`,
      error,
    );
    this.binanceSocket.close();
  };

  private handleClose = () => {
    if (this.retries < this.maxRetries) {
      console.log('Trying to reconnect...');
      setTimeout(() => {
        this.retries++;
        this.reconnectDelay *= 1.5; // Increase delay by 50%
        this.connectToBinance();
      }, this.reconnectDelay);
    } else {
      console.error(
        'Max retries reached. Check the connection or the endpoint.',
      );
    }
  };

  private async storePrice(price: number) {
    try {
      const priceData = await this.prisma.assetPrice.create({
        data: {
          symbol: this.assetSymbol,
          price,
        },
      });
      return priceData;
    } catch (error) {
      console.error(
        `Error storing price data for ${this.assetSymbol} at price ${price}:`,
        error,
      );
    }
  }
}
