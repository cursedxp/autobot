import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { HealthController } from './health/health.controller';
import { PriceService } from './price/price.service';
import { ConfigModule } from '@nestjs/config';
import { OrderService } from './order/order.service';
import { OrderModule } from './order/order.module';
import { BinanceService } from './binance/binance.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), OrderModule],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    PrismaService,
    PriceService,
    OrderService,
    BinanceService,
  ],
})
export class AppModule {}
