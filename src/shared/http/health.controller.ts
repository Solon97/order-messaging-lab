import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('health')
export class HealthController {
  constructor(
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check para o target group do ALB' })
  @ApiResponse({ status: 200, description: 'Serviço saudável' })
  @ApiResponse({ status: 503, description: 'Banco de dados indisponível' })
  async check(): Promise<{ status: 'ok' }> {
    if (this.dataSource) {
      try {
        await this.dataSource.query('SELECT 1');
      } catch {
        throw new ServiceUnavailableException({ status: 'error' });
      }
    }
    return { status: 'ok' };
  }
}
