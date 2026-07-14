import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
} from '@nestjs/common';
import { CreateOrderUseCase } from '@/order/application/create-order.use-case';
import { GetOrderUseCase } from '@/order/application/get-order.use-case';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderExceptionFilter } from './order-exception.filter';

@Controller('orders')
@UseFilters(OrderExceptionFilter)
export class OrdersController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreateOrderDto): Promise<OrderResponseDto> {
    const result = await this.createOrderUseCase.execute(dto);
    if (result.isLeft()) {
      throw result.value;
    }
    return OrderResponseDto.fromDomain(result.value);
  }

  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    const result = await this.getOrderUseCase.execute(id);
    if (result.isLeft()) {
      throw new NotFoundException(result.value.message);
    }
    return OrderResponseDto.fromDomain(result.value);
  }
}
