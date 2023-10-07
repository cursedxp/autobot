import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { OrderService } from './order.service';
import { BinanceService } from 'src/binance/binance.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [OrderService, PrismaService, BinanceService],
})
export class OrderModule {}
