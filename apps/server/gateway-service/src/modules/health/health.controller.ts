import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthResponseDto } from './dto/health.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Check gateway-service availability',
    description:
      'Lightweight HTTP health check handled inside gateway-service. It does not call downstream gRPC services; it only confirms that the gateway process can accept HTTP requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'Gateway process is running and can respond to HTTP requests.',
    type: HealthResponseDto,
  })
  getHealth() {
    return {
      status: 'ok',
      service: 'gateway-service',
      timestamp: new Date().toISOString(),
    };
  }
}
